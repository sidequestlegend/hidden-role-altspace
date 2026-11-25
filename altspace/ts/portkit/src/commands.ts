// Numbered commands to the referee.
//
// Several upstream games use a synced field as a command channel ("task"): a player writes a request and the
// master acts on it when it deserialises. Copied as is, a late joiner would act on the last request again, and a
// request written while the referee changes would be lost. So a request is a record instead:
//
//   - The sender publishes the front of its queue in its announcement leaf: x.q = [[n, behaviour, player, name, args],
//     ...], up to 8 requests (4 KB) at once, so a burst of presses goes in one write and is run in one pass.
//   - The referee runs every request whose number is above the one it has acknowledged for that sender, then
//     writes the number into its own announcement leaf: x.ak = {e, m: {<sid>: n}} (refrecord.ts). It is not in
//     public space state, where any client could acknowledge another player's requests so that they never run.
//   - The sender publishes its next request once the acknowledgement is mirrored.
//
// A request carries a write mark: the sender's ownership claims and writes the room had not echoed when it was published
// ([slot id, generation, sequence], made after the sending turn's own writes). Space state and user state travel by
// different roads (the app paces them apart), so a request can reach the referee before the claim it was sent after; the
// referee holds the request (and the sender's later ones) until it has seen them, or for eventHoldMs at most. Without
// the mark the referee's handler ran on the old value and its write lost to the claim arriving after it (beer pong).
//
// Only the referee ever runs a request, each one in order; a new referee carries on from the last numbers it read.
// (If a referee runs a request and leaves before its acknowledgement reaches the room, the next referee runs it
// again: at-least-once in that one corner.)

import type { Behaviour } from "./behaviour.ts";
import type { Core } from "./core.ts";
import { callable } from "./events.ts";
import type { Presence } from "./presence.ts";
import type { Referee } from "./referee.ts";
import { RefereeTable } from "./refrecord.ts";
import { asciiJson, utf8Length } from "./util.ts";
import { decodeValue, encodeValue } from "./values.ts";

export interface CommandRoutes {
  /** The local copy of the behaviour a request addresses: its id and, for a per-player one, its owner's session. */
  resolve(id: string, playerSid: string | null): Behaviour | null;
  address(behaviour: Behaviour): { id: string; playerSid: string | null } | null;
  /** Runs `name` on the behaviour with the sender as the calling player. */
  invoke(behaviour: Behaviour, name: string, args: unknown[], fromSid: string): void;
  acknowledged(behaviour: Behaviour, number: number): void;
  refused(behaviour: Behaviour, code: string, name: string): void;
  /** Writes every slot the local player changed in this turn (the end of the action the request was sent in). */
  flush?(): void;
  /** The local player's claims and writes the room has not echoed yet: [slot id, generation, sequence]. */
  marks?(): Array<[string, number, number]>;
  /** Has this client seen that claim and that write? */
  seen?(id: string, g: number, n: number): boolean;
}

type Mark = Array<[string, number, number]>;

interface Pending {
  n: number;
  behaviour: Behaviour;
  /** [n, behaviour id, player sid, method, args, write mark?]: the mark is added once the sending turn is over. */
  record: [number, string, string, string, unknown[]] | [number, string, string, string, unknown[], Mark];
  sealed: boolean;
}

/** A request must fit in the announcement leaf with room to spare. */
const MAX_COMMAND_BYTES = 2048;
/** Requests published at once, and their size together. */
const MAX_BATCH = 8;
const MAX_BATCH_BYTES = 4096;

export class Commands {
  private readonly core: Core;
  private readonly presence: Presence;
  private readonly referee: Referee;
  private readonly routes: CommandRoutes;
  private readonly queue: Pending[] = [];
  private nextNumber = 0;
  private readonly acks: RefereeTable<number>;
  private reviewing = false;
  private reviewAgain = false;
  private sealing = false;
  /** Referee: since when a sender's first due request (`<sid>` newline `<n>`) has waited for its write mark. */
  private readonly heldSince = new Map<string, number>();
  private holding = false;
  /** False until behaviours have started: the referee runs nothing before then. */
  started = false;
  run = 0;

  constructor(core: Core, presence: Presence, referee: Referee, routes: CommandRoutes) {
    this.core = core;
    this.presence = presence;
    this.referee = referee;
    this.routes = routes;
    this.acks = new RefereeTable(presence, referee, "ak", (v) => (typeof v === "number" ? v : null));
  }

  listen(): void {
    this.presence.onExtra(() => this.review());
    this.presence.on(() => this.review());
    this.referee.on(() => this.review());
    // A held request may run once the state it waits for has arrived (after Sync has taken it in: a microtask later).
    this.core.onState(() => {
      if (this.holding) Promise.resolve().then(() => this.review());
    });
  }

  send(behaviour: Behaviour, name: string, args: unknown[]): number {
    const address = this.routes.address(behaviour);
    if (!address) return 0;
    if (!callable(behaviour, name)) {
      this.core.log("warn", `SendCommand: ${address.id} has no network-callable method '${name}' (list it in its class's static networkCallable)`);
      return 0;
    }
    if (this.nextNumber === 0) this.nextNumber = (this.table()[this.core.me.sid] ?? 0) + 1;
    const n = this.nextNumber++;
    const record: Pending["record"] = [n, address.id, address.playerSid ?? "", name, args.map(encodeValue)];
    if (utf8Length(asciiJson(record)) > MAX_COMMAND_BYTES) {
      this.routes.refused(behaviour, "value_too_large", name);
      return 0;
    }
    this.queue.push({ n, behaviour, record, sealed: false });
    if (!this.sealing) {
      this.sealing = true;
      Promise.resolve().then(() => this.seal());
    }
    return n;
  }

  /** After the turn that sent them: the turn's writes go out first, then the requests, marked with what they follow. */
  private seal(): void {
    this.sealing = false;
    if (this.core.disposed) return;
    this.core.guard("command write mark", () => this.routes.flush?.());
    const marks = this.routes.marks?.() ?? [];
    for (const pending of this.queue) {
      if (pending.sealed) continue;
      pending.sealed = true;
      if (marks.length) {
        const [n, id, sid, name, args] = pending.record;
        pending.record = [n, id, sid, name, args, marks];
      }
    }
    this.review();
  }

  /**
   * Publishes, runs and acknowledges whatever is due. Also called about once a second. Not re-entrant: a command
   * handler that publishes a user-state record (Secrets.beginDeal, presence.setExtra) tells every record listener at
   * once, which calls this again; that call is held and run after the current pass, so no command runs inside another.
   */
  review(): void {
    if (this.core.disposed || !this.started) return;
    if (this.reviewing) {
      this.reviewAgain = true;
      return;
    }
    this.reviewing = true;
    try {
      let passes = 0;
      do {
        this.reviewAgain = false;
        this.reviewOnce();
      } while (this.reviewAgain && !this.core.disposed && ++passes < 16);
    } finally {
      this.reviewing = false;
      this.reviewAgain = false;
    }
  }

  private reviewOnce(): void {
    const me = this.core.me.sid;
    const acked = this.table()[me] ?? 0;
    while (this.queue.length && this.queue[0]!.n <= acked) {
      const done = this.queue.shift()!;
      this.core.guard("OnCommandAcknowledged", () => this.routes.acknowledged(done.behaviour, done.n));
    }
    const published = this.presence.extra(me, "q");
    if (this.queue.length) {
      const batch: Pending["record"][] = [];
      let bytes = 2;
      for (const pending of this.queue) {
        if (!pending.sealed) break;
        const size = utf8Length(asciiJson(pending.record)) + 1;
        if (batch.length >= MAX_BATCH || (batch.length && bytes + size > MAX_BATCH_BYTES)) break;
        batch.push(pending.record);
        bytes += size;
      }
      const first = Array.isArray(published) && Array.isArray(published[0]) ? published[0][0] : null;
      const last = Array.isArray(published) && Array.isArray(published[published.length - 1]) ? published[published.length - 1][0] : null;
      if (batch.length && (first !== batch[0]![0] || last !== batch[batch.length - 1]![0])) this.presence.setExtra("q", batch);
    } else if (published !== undefined) this.presence.setExtra("q", undefined);
    if (this.referee.isMe()) this.officiate();
  }

  private officiate(): void {
    const table = this.acks.working();
    let changed = false;
    const now = this.core.platform.clock.now();
    let holding = false;
    for (const sid of Object.keys(table)) {
      if (!this.presence.has(sid)) {
        delete table[sid];
        changed = true;
      }
    }
    for (const who of this.presence.list()) {
      const batch = this.presence.extra(who.sid, "q");
      if (!Array.isArray(batch)) continue;
      for (const q of batch.slice(0, MAX_BATCH)) {
        if (!Array.isArray(q) || typeof q[0] !== "number" || typeof q[1] !== "string" || typeof q[3] !== "string") break;
        // In order and once: a number at or below the acknowledged one has run; a gap waits for the missing one.
        const acked = table[who.sid] ?? 0;
        if (q[0] <= acked) continue;
        if (acked > 0 && q[0] !== acked + 1) break;
        // The write mark: the sender's claims and writes this request was sent after. Wait for them (in order: the
        // sender's later requests wait too), for eventHoldMs at most; then run anyway, as a late event does.
        const key = who.sid + "\n" + q[0];
        if (who.sid !== this.core.me.sid && !this.marked(q[5])) {
          const since = this.heldSince.get(key) ?? now;
          this.heldSince.set(key, since);
          if (now - since < this.core.options.eventHoldMs) {
            holding = true;
            if (since === now) this.core.scheduler.after(this.core.options.eventHoldMs + 1, () => this.review());
            break;
          }
          this.core.log("info", `a command from session ${who.sid} ran without the state it was sent after (it had not arrived in ${this.core.options.eventHoldMs} ms)`);
        }
        this.heldSince.delete(key);
        // The acknowledgement is written before the command runs: whatever the handler does (it may publish a record
        // of its own, which reviews again), this request is already done.
        table[who.sid] = q[0];
        this.acks.write(table);
        changed = false;
        const behaviour = this.routes.resolve(q[1], typeof q[2] === "string" && q[2] ? q[2] : null);
        const args = Array.isArray(q[4]) ? q[4].map(decodeValue) : [];
        this.run++;
        if (behaviour) this.routes.invoke(behaviour, q[3], args, who.sid);
      }
    }
    if (changed) this.acks.write(table);
    this.holding = holding;
    if (!holding) this.heldSince.clear();
  }

  /** Has the referee seen every claim and write in a request's mark? (No mark, or a malformed one: nothing to wait for.) */
  private marked(mark: unknown): boolean {
    if (!Array.isArray(mark) || !this.routes.seen) return true;
    for (const m of mark.slice(0, 8)) {
      if (!Array.isArray(m) || typeof m[0] !== "string" || typeof m[1] !== "number" || typeof m[2] !== "number") continue;
      if (!this.routes.seen(m[0], m[1], m[2])) return false;
    }
    return true;
  }

  private table(): Record<string, number> {
    return this.acks.read();
  }
}
