// Who is taking part in one instance: the players in the room whose page is running this instance right now.
//
// A player in the room is not enough. Their page may still be loading the kit, or the snippet may not be on it at
// all. So every running instance announces itself in its player's user state, in the leaf `<prefix>.k`:
//
//   {k: <public key>, v: 1, x: {<name>: value}}
//
// Only announced players can be referee, get a player id or be reported to behaviours as joined. The room drops
// a player's user state when they leave, and `players()` drops them at once.
//
// `x` carries the small per-player records the runtime itself needs everyone to see and nobody else to be able to
// write: published commitments, a fair draw's commitment and reveal, the head of the player's command queue.

import type { Core } from "./core.ts";
import { asciiJson, isRecord, safeParse } from "./util.ts";

export interface Participant {
  sid: string;
  uid: string;
  name: string;
  isLocal: boolean;
  /** ECDH public key, raw, base64url. */
  publicKey: string;
}

type Handler = (kind: "join" | "leave", who: Participant) => void;

export class Presence {
  private readonly core: Core;
  private readonly known = new Map<string, Participant>();
  private readonly extras = new Map<string, Record<string, unknown>>();
  private readonly texts = new Map<string, string>();
  /** Every public key each session has announced, kept after it leaves (a sealed box can outlive its sender's visit). */
  private readonly keysSeen = new Map<string, string>();
  private readonly handlers: Handler[] = [];
  private readonly extraHandlers: Array<(sid: string) => void> = [];
  private announced: string | null = null;
  private localExtras: Record<string, unknown> = {};
  private dirty = false;
  private started = false;

  constructor(core: Core) {
    this.core = core;
  }

  private get markerPath(): string {
    return this.core.prefix + ".k";
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { platform } = this.core;
    this.core.own(platform.onPlayers(() => this.recompute()));
    this.core.own(
      platform.onUser(this.core.prefix + ".", (_sid, path) => {
        if (path === this.markerPath) this.recompute();
      }),
    );
    this.recompute();
  }

  /** Publishes the local marker. From here on the local player is a participant. */
  announce(publicKey: string): void {
    this.announced = publicKey;
    this.write();
    this.recompute();
  }

  /** Withdraws the marker, when the instance stops while its player stays in the room. */
  retire(): void {
    if (this.announced === null) return;
    this.announced = null;
    this.core.platform.userSet(this.markerPath, null);
  }

  /** Sets or (with undefined) removes one of the local player's published records. Sent at the end of the tick. */
  setExtra(name: string, value: unknown): void {
    if (value === undefined) {
      if (!(name in this.localExtras)) return;
      delete this.localExtras[name];
    } else this.localExtras[name] = value;
    this.dirty = true;
    this.emitExtra(this.core.me.sid);
  }

  /** The local player's session id. */
  get localSid(): string {
    return this.core.me.sid;
  }

  /** A published record of any participant, from the mirror (the local player's own is read back at once). */
  extra(sid: string, name: string): unknown {
    if (sid === this.core.me.sid) return this.localExtras[name];
    return this.extras.get(sid)?.[name];
  }

  /** Called when a participant's published records may have changed. */
  onExtra(handler: (sid: string) => void): void {
    this.extraHandlers.push(handler);
  }

  /** Looks again at who is here: a session id can change without an event. Called about once a second. */
  tend(): void {
    if (this.started) this.recompute();
  }

  /** Sends the marker if a record changed. Called once per tick. */
  flush(): void {
    if (!this.dirty || this.announced === null || this.core.disposed) return;
    this.write();
  }

  private write(): void {
    this.dirty = false;
    const marker: Record<string, unknown> = { k: this.announced, v: 1 };
    if (Object.keys(this.localExtras).length) marker.x = this.localExtras;
    this.core.platform.userSet(this.markerPath, asciiJson(marker));
  }

  /** Participants ordered by user id, then session id: the order referee ranks and player ids follow. */
  list(): Participant[] {
    return [...this.known.values()].sort(compare);
  }

  has(sid: string): boolean {
    return this.known.has(sid);
  }

  get(sid: string): Participant | undefined {
    return this.known.get(sid);
  }

  /** The public key a session announced, now or before it left; undefined for a session never seen. */
  keyOf(sid: string): string | undefined {
    return this.known.get(sid)?.publicKey ?? this.keysSeen.get(sid);
  }

  /** Position of `sid` in `list()`, or -1. */
  rank(sid: string): number {
    return this.list().findIndex((p) => p.sid === sid);
  }

  on(handler: Handler): void {
    this.handlers.push(handler);
  }

  private recompute(): void {
    if (this.core.disposed) return;
    const { platform } = this.core;
    const now = new Map<string, Participant>();
    const changed: string[] = [];
    for (const player of platform.players()) {
      let key: string | null = null;
      if (player.isLocal) key = this.announced;
      else {
        const text = platform.userGet(player.sid, this.markerPath) ?? "";
        if (text !== this.texts.get(player.sid)) {
          this.texts.set(player.sid, text);
          const marker = safeParse(text);
          this.extras.set(player.sid, isRecord(marker) && isRecord(marker.x) ? marker.x : {});
          changed.push(player.sid);
        }
        const marker = safeParse(text);
        if (isRecord(marker) && typeof marker.k === "string" && marker.k.length > 0) key = marker.k;
      }
      if (key === null) continue;
      now.set(player.sid, { sid: player.sid, uid: player.uid, name: player.name, isLocal: player.isLocal, publicKey: key });
    }
    const left: Participant[] = [];
    const joined: Participant[] = [];
    for (const [sid, who] of this.known) if (!now.has(sid)) left.push(who);
    for (const [sid, who] of now) {
      const before = this.known.get(sid);
      if (!before) joined.push(who);
      else {
        before.name = who.name;
        before.publicKey = who.publicKey;
      }
    }
    for (const who of now.values()) this.keysSeen.set(who.sid, who.publicKey);
    for (const who of left) {
      this.known.delete(who.sid);
      this.extras.delete(who.sid);
      this.texts.delete(who.sid);
    }
    for (const who of joined) this.known.set(who.sid, who);
    for (const who of left.sort(compare)) this.emit("leave", who);
    for (const who of joined.sort(compare)) this.emit("join", who);
    for (const sid of changed) if (this.known.has(sid)) this.emitExtra(sid);
  }

  private emit(kind: "join" | "leave", who: Participant): void {
    for (const handler of this.handlers.slice()) this.core.guard("presence handler", () => handler(kind, who));
  }

  private emitExtra(sid: string): void {
    for (const handler of this.extraHandlers.slice()) this.core.guard("presence record handler", () => handler(sid));
  }
}

function compare(a: { uid: string; sid: string }, b: { uid: string; sid: string }): number {
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0;
}
