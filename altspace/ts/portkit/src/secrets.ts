// Hidden information. Everything a page writes to the room can be read by everybody, and public space state can
// be written by anybody, so:
//
//   commit / reveal   A player publishes SHA-256(nonce, value) now and the value with its nonce later. Nobody can
//                     change what they committed to, and nobody learns it before the reveal. Synchronous (the
//                     hash is plain TypeScript). Commitments are published in the player's own user state, which
//                     the room ties to its sender.
//   fair draws        A player's own random draw is never trusted alone. The player commits to a secret; the
//                     referee then publishes a number for that commitment; the draw is SHA-256(secret, number).
//                     The player knows the draw at once, everyone else when the secret is revealed, and everyone
//                     checks the secret against the commitment the referee recorded. A changed secret is
//                     rejected; a player who does not reveal by the referee's deadline forfeits. The player's part
//                     lives in the player's user state and the referee's part in the referee's user state, so no
//                     other client can change either. The secret is saved on the device, so a page reload during
//                     a round gets the same draw back.
//   dealt draws       For what the referee deals (cards): the referee commits to a seed, every listed player then
//                     commits to a contribution, then reveals it, and the deal's seed is SHA-256 of all of them.
//                     The referee cannot grind seeds (its own is fixed before it sees any contribution) and no player
//                     can steer the result (contributions are fixed before any is shown). The referee knows the deal,
//                     as a dealer does; after the hand it reveals its seed and everyone checks the deal.
//   seal / open       One player encrypts a value for another: ECDH P-256 between the two key pairs, then
//                     AES-GCM (WebCrypto, so asynchronous). Public keys travel in the announcement leaf.
//                     The trust is the upstream games' own: whoever deals knows what they dealt.

import type { Core } from "./core.ts";
import type { Presence } from "./presence.ts";
import type { Referee } from "./referee.ts";
import { sha256, sha256Text, toHex } from "./sha256.ts";
import type { CryptoLike, KeyValueStore } from "./types.ts";
import { asciiJson, canonicalJson, fromBase64, isRecord, safeParse, toBase64, utf8Decode, utf8Encode } from "./util.ts";
import { RefereeTable } from "./refrecord.ts";
import { decodeValue, encodeValue } from "./values.ts";

/** What stays private until the reveal. */
export interface Opening {
  /** The value, in the tagged JSON form of values.ts. */
  v: unknown;
  /** The nonce. */
  s: string;
}

export interface Commitment {
  /** Publish this. */
  readonly hash: string;
  /** Keep this, and publish it when the time comes. */
  reveal(): Opening;
}

export type DrawState =
  /** No draw under that label. */
  | "none"
  /** The player has committed; the referee has not answered yet. */
  | "committed"
  /** The referee's number is in: the player knows the draw, nobody else does. */
  | "numbered"
  /** The secret is public and matches: everybody knows the draw. */
  | "revealed"
  /** The commitment or the secret was changed after the referee's number. */
  | "rejected"
  /** The referee's deadline passed without a valid reveal. */
  | "forfeit";

/** The outcome of a fair draw: as many independent numbers as the game asks for. */
export class Draw {
  private readonly seed: string;
  constructor(seed: string) {
    this.seed = seed;
  }
  /** An integer in [0, maxExclusive). `index` picks which of the draw's numbers: die 0, die 1, ... */
  Int(maxExclusive: number, index = 0): number {
    const h = sha256(utf8Encode(`${this.seed}\n${index}`));
    // 48 bits is far more than any game range needs, and stays exact in a double.
    const n = h[0]! * 2 ** 40 + h[1]! * 2 ** 32 + h[2]! * 2 ** 24 + h[3]! * 2 ** 16 + h[4]! * 2 ** 8 + h[5]!;
    return n % Math.max(1, Math.floor(maxExclusive));
  }
  Ints(count: number, maxExclusive: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(this.Int(maxExclusive, i));
    return out;
  }
  /** In [0, 1). */
  Float(index = 0): number {
    return this.Int(2 ** 32, index) / 2 ** 32;
  }
  toString(): string {
    return this.seed;
  }
}

export interface DrawStatus {
  state: DrawState;
  /** Present for the local player once numbered, and for everyone once revealed. */
  draw: Draw | null;
}

/**
 * [label, hash, number, deadline in synced seconds or 0, forfeit 0 | 1, the player's user id, who supplied the number
 * (a session id), how: "r" the referee that published it, "w" a witness (the referee's own draw), "s" solo (nobody else)]
 */
type DrawEntry = [string, string, string, number, number, string, string, string];

/** Whether a table entry may be believed: checked when this client first sees it (see entryOf). */
type Verdict = "ok" | "pending" | "bad";

/** How long the referee keeps the entry of a player who left, for a page reload to pick it up again. */
const DRAW_KEEP_MS = 120000;
/** How many first answers (user and label) the referee remembers per epoch, to refuse a re-roll after DRAW_KEEP_MS. */
const ANSWERED_MAX = 1024;

function parseDrawEntry(e: unknown): DrawEntry | null {
  if (!Array.isArray(e) || typeof e[0] !== "string" || typeof e[1] !== "string" || typeof e[2] !== "string") return null;
  return [e[0], e[1], e[2], typeof e[3] === "number" ? e[3] : 0, e[4] === 1 ? 1 : 0, typeof e[5] === "string" ? e[5] : "", typeof e[6] === "string" ? e[6] : "", typeof e[7] === "string" ? e[7] : ""];
}

const CURVE = { name: "ECDH", namedCurve: "P-256" };

export type DealState =
  /** No deal under that label from the current referee. */
  | "none"
  /** The referee has committed; listed players are committing to their contributions. */
  | "committing"
  /** Every listed player has committed; contributions are being revealed. */
  | "revealing"
  /** Every contribution is in: the referee can compute the deal. */
  | "ready"
  /** The referee revealed its seed and it matches: everyone can check the deal. */
  | "revealed"
  /** The referee's revealed seed does not match its commitment. */
  | "invalid";

interface DealRecord {
  l: string;
  h: string;
  s: string[];
  p: number;
  r?: string;
}

interface Contribution {
  l: string;
  h: string;
  c?: string;
}

function parseDeal(raw: unknown): DealRecord | null {
  if (!isRecord(raw) || typeof raw.l !== "string" || typeof raw.h !== "string" || !Array.isArray(raw.s)) return null;
  return { l: raw.l, h: raw.h, s: raw.s.filter((x): x is string => typeof x === "string"), p: raw.p === 1 ? 1 : 0, r: typeof raw.r === "string" ? raw.r : undefined };
}

function parseContribution(raw: unknown): Contribution | null {
  if (!isRecord(raw) || typeof raw.l !== "string" || typeof raw.h !== "string") return null;
  return { l: raw.l, h: raw.h, c: typeof raw.c === "string" ? raw.c : undefined };
}

export class Secrets {
  private readonly core: Core;
  private readonly presence: Presence;
  private readonly referee: Referee;
  private readonly crypto: CryptoLike;
  private readonly nowSeconds: () => number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private privateKey: any = null;
  private publicKeyText = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly derived = new Map<string, Promise<any>>();
  private mySecret: { label: string; secret: string } | null = null;
  private readonly lastStates = new Map<string, string>();
  /** The referee's numbers and judgements, read from the referee's own user state. */
  private readonly numbers: RefereeTable<DrawEntry>;
  /** Per `<uid>\n<label>`: the hash and number first seen, and whether the entry checked out when it appeared. */
  private readonly pins = new Map<string, { h: string; n: string; verdict: Verdict; live: boolean; publisher: string }>();
  /** Witness answers seen this epoch: `<witness sid>\n<drawer uid>\n<label>\n<hash>` -> number (the first one stays). */
  private readonly answers = new Map<string, string>();
  /** The first commitment seen per `<uid>\n<label>` this epoch (a referee may not re-commit after its witness answered). */
  private readonly firstCommit = new Map<string, string>();
  /** Entries already in the first table this client read this epoch: numbered before it was here, so taken as found. */
  private baseline: Set<string> | null = null;
  private pinsEpoch = -1;
  private readonly warnedPins = new Set<string>();
  private readonly goneSince = new Map<string, number>();
  /** Witness only: the commitment answered per `<epoch>\n<referee uid>\n<label>`. */
  private readonly witnessed = new Map<string, string>();
  /** Referee only: the first entry answered per `<uid>\n<label>` in `answeredEpoch` (see officiate). */
  private readonly answered = new Map<string, DrawEntry>();
  private answeredEpoch = -1;
  private drawStore: KeyValueStore | null = null;
  private drawKey = "";
  private restoring: { e: number; l: string; s: string; r: number } | null = null;
  /** The draw the restore brought back, until the game's first beginDraw (which keeps it under the same label). */
  private restored: { e: number; l: string; s: string; r: number } | null = null;
  /** The referee's own seed for its current deal. */
  private dealSeed: { label: string; seed: string } | null = null;
  /** This player's contribution to a deal. */
  private myContribution: { label: string; c: string } | null = null;
  /** Commitments and contributions as first seen, per deal label and session (they outlive a player's visit). */
  private readonly dealSeen = new Map<string, { h: string; refSid: string; parts: Map<string, { h: string; c?: string }> }>();
  /** Told when a player's draw changes state. */
  onDrawChanged: (sid: string, label: string, status: DrawStatus) => void = () => {};

  constructor(core: Core, presence: Presence, referee: Referee, nowSeconds: () => number) {
    this.core = core;
    this.presence = presence;
    this.referee = referee;
    this.crypto = core.platform.crypto;
    this.nowSeconds = nowSeconds;
    this.numbers = new RefereeTable(presence, referee, "fn", parseDrawEntry);
  }

  /** Starts following commitments, the referee's numbers and reveals. */
  listen(): void {
    this.presence.onExtra(() => this.review());
    this.presence.on(() => this.review());
    this.referee.on(() => this.review());
  }

  /** `n` bytes from the strong generator (WebCrypto; seeded in the fake room). */
  RandomBytes(n: number): Uint8Array {
    return this.crypto.getRandomValues(new Uint8Array(Math.max(0, Math.floor(n))));
  }

  // ---- commit / reveal ----------------------------------------------------------------------------------------

  commit(value: unknown): Commitment {
    const nonce = toBase64(this.crypto.getRandomValues(new Uint8Array(16)));
    const opening: Opening = { v: encodeValue(value), s: nonce };
    const hash = hashOpening(opening);
    return { hash, reveal: () => ({ v: opening.v, s: opening.s }) };
  }

  /** True when `opening` is what `hash` committed to. */
  verify(hash: string | null | undefined, opening: Opening | null | undefined): boolean {
    if (!opening || typeof opening.s !== "string" || typeof hash !== "string") return false;
    return hashOpening(opening) === hash;
  }

  /** The value inside an opening, with value types rebuilt. Check it with `verify` first. */
  valueOf<T = unknown>(opening: Opening): T {
    return decodeValue(opening.v) as T;
  }

  /** Publishes one of the local player's commitments under `label`, in their own user state. */
  publish(label: string, hash: string): void {
    const all = { ...this.own("c") };
    all[label] = hash;
    this.presence.setExtra("c", all);
  }

  /** Takes a published commitment back (when its round is over). */
  retract(label: string): void {
    const all = { ...this.own("c") };
    delete all[label];
    this.presence.setExtra("c", Object.keys(all).length ? all : undefined);
  }

  /** The commitment a participant published under `label`, or null. Only that player can have written it. */
  published(sid: string, label: string): string | null {
    const all = this.presence.extra(sid, "c");
    return isRecord(all) && typeof all[label] === "string" ? (all[label] as string) : null;
  }

  private own(name: string): Record<string, unknown> {
    const value = this.presence.extra(this.core.me.sid, name);
    return isRecord(value) ? value : {};
  }

  // ---- fair draws ---------------------------------------------------------------------------------------------
  //
  // Where each part lives, so that nobody can change another player's part:
  //   x.fd  [label, hash]          the player's commitment, in the player's own user state
  //   x.fr  [label, secret]        the player's reveal, in the player's own user state
  //   x.fn  {e, m: {sid: entry}}   the referee's numbers and judgements, in the referee's own user state
  //                                (refrecord.ts); entry = [label, hash, number, deadline, forfeit, uid]
  //   x.fw  [drawer uid, label, hash, number]   a witness's answer to the referee's own commitment, in the witness's
  //                                user state: the referee never supplies the number of its own draw (it knows its secret,
  //                                and could search secrets or numbers until it liked the outcome)
  // Each client also keeps the first hash and number it saw for a player's label in this epoch (`pins`): a later
  // table that changes them (a referee seat taken over by a modified client) is not believed. An entry that appears
  // while this client is here is checked when it appears: numbered by the referee publishing it ("r", for another
  // player), or by that player's witness ("w": the number is the witness's published answer to the first commitment
  // seen), or "s" (solo: believed only while nobody else takes part). Entries already there when this client first read
  // the table were numbered before it came, and are taken as found.

  /** Starts a draw for the local player under `label` (a round name). It replaces their previous draw. */
  beginDraw(label: string): void {
    // After a page reload the secret this device saved for the same label is used again (whether or not the
    // referee's table has been read yet): a new secret under a label the player already holds is refused as a
    // re-roll, so a game may call beginDraw as soon as it starts.
    // The same holds when the restore has already run: the first beginDraw under the restored label keeps it.
    const pending = this.restoring && this.restoring.l === label ? this.restoring : null;
    const restored = !pending && this.restored && this.restored.l === label && this.mySecret?.label === label ? this.restored : null;
    const saved = pending ?? restored;
    this.restored = null;
    const secret = saved ? saved.s : toBase64(this.crypto.getRandomValues(new Uint8Array(16)));
    this.mySecret = { label, secret };
    this.restoring = null;
    this.saveDraw(!!saved && saved.r === 1);
    this.presence.setExtra("fr", saved && saved.r === 1 ? [label, secret] : undefined);
    this.presence.setExtra("fd", [label, sha256Text(secret)]);
    if (pending) this.core.log("info", `the draw '${label}' came back after a reload`);
  }

  /**
   * True while a draw this device saved before a page reload may still come back (under `label`, or any label
   * when none is given): the restore waits for the referee's table. `beginDraw` with the same label takes it over.
   */
  hasSavedDraw(label?: string): boolean {
    return !!this.restoring && (label === undefined || this.restoring.l === label);
  }

  /** Publishes the local player's secret for `label`, so everyone can compute and check the draw. */
  revealDraw(label: string): void {
    if (!this.mySecret || this.mySecret.label !== label) return;
    this.saveDraw(true);
    this.presence.setExtra("fr", [label, this.mySecret.secret]);
  }

  /** The referee starts the clock: draws under `label` not revealed within `seconds` are forfeit. */
  demandReveal(label: string, seconds: number): void {
    if (!this.referee.isMe()) return;
    const table = this.numbers.working();
    const deadline = this.nowSeconds() + seconds;
    let changed = false;
    for (const sid of Object.keys(table)) {
      const entry = table[sid]!;
      if (entry[0] === label && entry[3] === 0 && entry[4] === 0) {
        entry[3] = deadline;
        changed = true;
      }
    }
    if (changed) this.numbers.write(table);
  }

  /** Where a participant's draw under `label` stands, and the draw itself once this client may know it. */
  drawOf(sid: string, label: string): DrawStatus {
    const checked = this.entryOf(sid);
    const committed = this.presence.extra(sid, "fd");
    const hasCommit = Array.isArray(committed) && committed[0] === label && typeof committed[1] === "string";
    if (!checked || checked.entry[0] !== label) return { state: hasCommit ? "committed" : "none", draw: null };
    if (checked.verdict === "bad") return { state: "rejected", draw: null };
    if (checked.verdict === "pending") return { state: "committed", draw: null };
    const entry = checked.entry;
    const [, hash, number, , forfeit] = entry;
    if (hasCommit && committed[1] !== hash) return { state: "rejected", draw: null };
    const revealed = this.presence.extra(sid, "fr");
    if (Array.isArray(revealed) && revealed[0] === label && typeof revealed[1] === "string") {
      if (sha256Text(revealed[1]) !== hash) return { state: "rejected", draw: null };
      if (forfeit) return { state: "forfeit", draw: null };
      return { state: "revealed", draw: new Draw(drawSeed(revealed[1], number, label)) };
    }
    if (forfeit) return { state: "forfeit", draw: null };
    if (sid === this.core.me.sid && this.mySecret && this.mySecret.label === label && sha256Text(this.mySecret.secret) === hash) {
      return { state: "numbered", draw: new Draw(drawSeed(this.mySecret.secret, number, label)) };
    }
    return { state: "numbered", draw: null };
  }

  /** The local player's own draw under `label`, as soon as the referee's number is in. */
  myDraw(label: string): Draw | null {
    return this.drawOf(this.core.me.sid, label).draw;
  }

  /** A participant's entry in the referee's table, with the hash and number this client saw first, and whether it checks out. */
  private entryOf(sid: string): { entry: DrawEntry; verdict: Verdict } | null {
    const table = this.numbers.read();
    this.newEpoch(table);
    this.collect();
    const entry = table[sid];
    if (!entry) return null;
    const key = `${entry[5]}\n${entry[0]}`;
    let pin = this.pins.get(key);
    if (!pin) {
      const publisher = this.referee.current()?.sid ?? "";
      pin = { h: entry[1], n: entry[2], verdict: "pending", live: !(this.baseline?.has(key) ?? false), publisher };
      this.pins.set(key, pin);
    }
    if (pin.h !== entry[1] || pin.n !== entry[2]) {
      if (!this.warnedPins.has(key)) {
        this.warnedPins.add(key);
        this.core.log("warn", `the referee's table changed the pinned commitment or number of a draw (${entry[0]}); keeping the first one seen`);
      }
    }
    const kept: DrawEntry = [entry[0], pin.h, pin.n, entry[3], entry[4], entry[5], entry[6], entry[7]];
    if (pin.verdict !== "ok" && pin.verdict !== "bad") {
      pin.verdict = this.judge(sid, kept, pin.live, pin.publisher);
      if (pin.verdict === "bad") this.core.log("warn", `a draw (${entry[0]}) whose number its own player could have chosen is not believed (${kept[7] || "?"} by ${kept[6] || "?"})`);
    }
    // solo is believed only while nobody else takes part: it is judged again every time
    const verdict = kept[7] === "s" && pin.verdict === "ok" && this.presence.list().length > 1 ? "bad" : pin.verdict;
    if (verdict === "bad" && pin.verdict === "ok" && !this.warnedPins.has("solo:" + key)) {
      this.warnedPins.add("solo:" + key);
      this.core.log("warn", `a draw (${entry[0]}) whose number its own player could have chosen is not believed (solo, while others take part)`);
    }
    return { entry: kept, verdict };
  }

  /** Clears what this client keeps per epoch, and takes the first table it reads as the baseline. */
  private newEpoch(table: Record<string, DrawEntry>): void {
    const epoch = this.referee.epoch;
    if (this.pinsEpoch !== epoch) {
      this.pins.clear();
      this.answers.clear();
      this.firstCommit.clear();
      this.baseline = null;
      this.pinsEpoch = epoch;
    }
    if (this.baseline === null && epoch !== 0) {
      const ref = this.referee.current();
      if (!ref) return;
      // the referee's leaf holds no table yet: nothing has been numbered in this epoch, so everything from now on is live
      this.baseline = new Set(Object.keys(table).map((sid) => `${table[sid]![5]}\n${table[sid]![0]}`));
    }
  }

  /** Records every witness answer and first commitment in view (they outlive their writer's visit in this memory). */
  private collect(): void {
    for (const who of this.presence.list()) {
      const fw = this.presence.extra(who.sid, "fw");
      if (Array.isArray(fw) && fw.length >= 4 && fw.slice(0, 4).every((x) => typeof x === "string")) {
        const key = `${who.sid}\n${fw[0]}\n${fw[1]}\n${fw[2]}`;
        if (!this.answers.has(key)) this.answers.set(key, fw[3] as string);
      }
      const fd = this.presence.extra(who.sid, "fd");
      if (Array.isArray(fd) && typeof fd[0] === "string" && typeof fd[1] === "string") {
        const key = `${who.uid}\n${fd[0]}`;
        if (!this.firstCommit.has(key)) this.firstCommit.set(key, fd[1]);
      }
    }
  }

  /** Whether an entry that appeared while this client was here was numbered by somebody other than its own player. */
  private judge(sid: string, entry: DrawEntry, live: boolean, publisher: string): Verdict {
    if (!live) return "ok"; // numbered before this client came: taken as found, like any pin
    const [label, hash, number, , , uid, by, how] = entry;
    if (how === "r") return by !== "" && by === publisher && by !== sid ? "ok" : "bad";
    if (how === "s") return "ok"; // (and only while nobody else takes part: see entryOf)
    if (how === "w") {
      if (by === "" || by === sid || by === publisher) return "bad";
      const first = this.firstCommit.get(`${uid}\n${label}`);
      if (first !== undefined && first !== hash) return "bad"; // re-committed after the first commitment was seen
      const answer = this.answers.get(`${by}\n${uid}\n${label}\n${hash}`);
      if (answer !== undefined) return answer === number ? "ok" : "bad";
      return this.presence.has(by) ? "pending" : "bad"; // a witness that left without this client seeing its answer
    }
    return "bad";
  }

  /**
   * The witness's part: the lowest-ranked participant other than the referee answers the referee's commitment with a
   * number of its own, once per label (a referee that re-commits after seeing the answer gets no second one).
   */
  private witness(): void {
    const ref = this.referee.current();
    const me = this.core.me;
    if (!ref || ref.sid === me.sid) return;
    const others = this.presence.list().filter((p) => p.sid !== ref.sid);
    if (!others.length || others[0]!.sid !== me.sid) return;
    const fd = this.presence.extra(ref.sid, "fd");
    if (!Array.isArray(fd) || typeof fd[0] !== "string" || typeof fd[1] !== "string") return;
    const key = `${this.referee.epoch}\n${ref.uid}\n${fd[0]}`;
    const first = this.witnessed.get(key);
    if (first !== undefined) return; // answered this label already (the same hash, or a re-commit that gets nothing)
    const entry = this.numbers.read()[ref.sid];
    if (entry && entry[0] === fd[0] && entry[5] === ref.uid) return; // numbered already
    this.witnessed.set(key, fd[1]);
    while (this.witnessed.size > ANSWERED_MAX) this.witnessed.delete(this.witnessed.keys().next().value as string);
    this.presence.setExtra("fw", [ref.uid, fd[0], fd[1], toBase64(this.crypto.getRandomValues(new Uint8Array(16)))]);
  }

  /** Looks at every participant's draw: the referee answers and judges, and everyone reports changes. */
  review(): void {
    if (this.core.disposed) return;
    this.reviewDeal();
    this.restoreDraw();
    this.witness();
    if (this.referee.isMe()) this.officiate();
    for (const who of this.presence.list()) {
      const committed = this.presence.extra(who.sid, "fd");
      const checked = this.entryOf(who.sid);
      const label = checked ? checked.entry[0] : Array.isArray(committed) && typeof committed[0] === "string" ? committed[0] : null;
      if (label === null) continue;
      const status = this.drawOf(who.sid, label);
      const mark = `${label}\n${status.state}`;
      if (this.lastStates.get(who.sid) === mark) continue;
      this.lastStates.set(who.sid, mark);
      this.core.guard("draw handler", () => this.onDrawChanged(who.sid, label, status));
    }
  }

  private officiate(): void {
    const table = this.numbers.working();
    let changed = false;
    const now = this.nowSeconds();
    const clock = this.core.platform.clock.now();
    // A player who left keeps their entry for a while: a page reload comes back as a new session of the same
    // user, republishes the same commitment (the secret is saved on the device) and gets the entry back.
    for (const sid of Object.keys(table)) {
      if (this.presence.has(sid)) {
        this.goneSince.delete(sid);
        continue;
      }
      const since = this.goneSince.get(sid) ?? clock;
      this.goneSince.set(sid, since);
      if (clock - since >= DRAW_KEEP_MS) {
        delete table[sid];
        this.goneSince.delete(sid);
        changed = true;
      }
    }
    if (this.answeredEpoch !== this.referee.epoch) {
      this.answered.clear();
      this.answeredEpoch = this.referee.epoch;
    }
    // What this referee (or its predecessor, through the table it carries on from) answered first per user and label.
    for (const sid of Object.keys(table)) this.remember(table[sid]!);
    for (const who of this.presence.list()) {
      const committed = this.presence.extra(who.sid, "fd");
      const entry = table[who.sid];
      if (Array.isArray(committed) && typeof committed[0] === "string" && typeof committed[1] === "string") {
        // A new label is a new draw. The same label keeps the commitment that was answered first: a player
        // who swaps it after seeing the number gets no second number, and their reveal will not match.
        if (!entry || entry[0] !== committed[0]) {
          const label = committed[0];
          // The same user may already hold this label under another session: a page reload (the departed session's
          // entry), or a second page. The user keeps the commitment and number answered first. A new session that
          // commits a different hash (a modified page re-rolling by reloading) gets that first entry, which its
          // commitment does not match, so its draw is "rejected"; it never gets a fresh number. After the departed
          // entry is dropped (DRAW_KEEP_MS) the referee still remembers the first answer for the rest of the epoch.
          const holders = Object.keys(table).filter((sid) => sid !== who.sid && table[sid]![5] === who.uid && table[sid]![0] === label);
          const departed = holders.find((sid) => !this.presence.has(sid) && table[sid]![1] === committed[1]) ?? holders.find((sid) => !this.presence.has(sid));
          const holder = departed ?? holders[0];
          const first = holder !== undefined ? table[holder]! : this.answered.get(`${who.uid}\n${label}`);
          if (first) {
            table[who.sid] = [label, first[1], first[2], first[3], first[4], who.uid, first[6], first[7]];
            if (departed !== undefined) {
              delete table[departed];
              this.goneSince.delete(departed);
            }
            if (first[1] !== committed[1]) {
              this.core.log("warn", `a new session of a player committed a different secret for the draw '${label}' they already hold (a re-roll by reloading?): refused, the first commitment stands`);
            }
          } else if (who.sid !== this.core.me.sid) {
            table[who.sid] = [label, committed[1], toBase64(this.crypto.getRandomValues(new Uint8Array(16))), 0, 0, who.uid, this.core.me.sid, "r"];
            this.remember(table[who.sid]!);
          } else {
            // the referee's own draw: never its own number. The lowest-ranked other participant's answer (x.fw); none yet:
            // wait for it; nobody else here: solo (believed only while that lasts)
            const others = this.presence.list().filter((p) => p.sid !== who.sid);
            const answer = others
              .map((p) => ({ sid: p.sid, fw: this.presence.extra(p.sid, "fw") }))
              .find((a) => Array.isArray(a.fw) && a.fw[0] === who.uid && a.fw[1] === label && a.fw[2] === committed[1] && typeof a.fw[3] === "string");
            if (answer) table[who.sid] = [label, committed[1], (answer.fw as string[])[3]!, 0, 0, who.uid, answer.sid, "w"];
            else if (!others.length) table[who.sid] = [label, committed[1], toBase64(this.crypto.getRandomValues(new Uint8Array(16))), 0, 0, who.uid, who.sid, "s"];
            else continue;
            this.remember(table[who.sid]!);
          }
          changed = true;
          continue;
        }
      }
      if (entry && entry[3] > 0 && entry[4] === 0 && now >= entry[3]) {
        const revealed = this.presence.extra(who.sid, "fr");
        const ok = Array.isArray(revealed) && revealed[0] === entry[0] && typeof revealed[1] === "string" && sha256Text(revealed[1]) === entry[1];
        if (!ok) {
          entry[4] = 1;
          changed = true;
        }
      }
    }
    if (changed) this.numbers.write(table);
  }

  /** The referee keeps the first entry it answered per user and label for the epoch (bounded). */
  private remember(entry: DrawEntry): void {
    const key = `${entry[5]}\n${entry[0]}`;
    if (this.answered.has(key)) return;
    this.answered.set(key, [entry[0], entry[1], entry[2], 0, 0, entry[5], entry[6], entry[7]]);
    while (this.answered.size > ANSWERED_MAX) this.answered.delete(this.answered.keys().next().value as string);
  }

  private saveDraw(revealed: boolean): void {
    if (!this.drawStore || !this.mySecret) return;
    try {
      this.drawStore.set(this.drawKey, JSON.stringify({ e: this.referee.epoch, l: this.mySecret.label, s: this.mySecret.secret, r: revealed ? 1 : 0 }));
    } catch {
      /* not saved: a reload loses the draw */
    }
  }

  /**
   * After a page reload: the secret this device saved comes back once the referee's table (as last mirrored)
   * still holds this user's entry for it; the commitment (and the reveal, if it was made) is published again and
   * the referee moves the entry to the new session.
   */
  private restoreDraw(): void {
    const saved = this.restoring;
    if (!saved || this.mySecret) return;
    const epoch = this.referee.epoch;
    if (epoch === 0) return;
    if (saved.e !== 0 && saved.e !== epoch) {
      this.restoring = null;
      return;
    }
    const hash = sha256Text(saved.s);
    const table = this.numbers.read();
    const mine = Object.keys(table)
      .map((sid) => table[sid]!)
      .filter((e) => e[5] === this.core.me.uid);
    if (mine.some((e) => e[0] === saved.l && e[1] === hash)) {
      this.restoring = null;
      this.restored = saved;
      this.mySecret = { label: saved.l, secret: saved.s };
      this.presence.setExtra("fd", [saved.l, hash]);
      if (saved.r) this.presence.setExtra("fr", [saved.l, saved.s]);
      this.core.log("info", `the draw '${saved.l}' came back after a reload`);
    } else if (mine.length) {
      this.restoring = null; // the table has moved on to another round
    }
  }

  // ---- dealt draws ---------------------------------------------------------------------------------------------
  //
  //   referee x.dl  {l: label, h: SHA-256(seed), s: [listed session ids], p: 0 committing | 1 revealing, r?: seed}
  //   player  x.dc  {l: label, h: SHA-256(contribution), c?: contribution}
  // The runtime answers for every listed player by itself (review), so game code only calls beginDeal, dealDraw,
  // revealDeal on the referee and verifyDeal anywhere.

  /** The referee starts a deal under `label` for the players with these session ids. Replaces its previous deal. */
  beginDeal(label: string, sids: string[]): void {
    if (!this.referee.isMe()) return;
    // The deal is SHA-256 of the referee's committed seed and every listed contribution. With no other player listed
    // there is nothing the referee does not choose itself (it could search seeds before committing): say so.
    if (!sids.some((sid) => sid !== this.core.me.sid)) {
      this.core.log("warn", `beginDeal('${label}') lists no player but the referee: the deal is the referee's own choice, not a fair one`);
    }
    const seed = toBase64(this.crypto.getRandomValues(new Uint8Array(16)));
    this.dealSeed = { label, seed };
    this.presence.setExtra("dl", { l: label, h: sha256Text(seed), s: sids.slice(), p: 0 });
    this.review();
  }

  /** Where the current referee's deal under `label` stands. */
  dealState(label: string): DealState {
    const deal = this.currentDeal();
    if (!deal || deal.l !== label) return "none";
    const seen = this.dealSeen.get(label);
    if (deal.r !== undefined) return seen && sha256Text(deal.r) === seen.h ? "revealed" : "invalid";
    if (deal.p === 0) return "committing";
    return this.contributions(deal) ? "ready" : "revealing";
  }

  /**
   * The referee's deal, once every listed player still present has revealed a contribution (a listed player who
   * left counts as absent: say so in the game if it matters). Null before that, and on any other client.
   */
  dealDraw(label: string): Draw | null {
    const deal = this.currentDeal();
    if (!this.referee.isMe() || !deal || deal.l !== label || !this.dealSeed || this.dealSeed.label !== label) return null;
    const parts = this.contributions(deal);
    return parts ? new Draw(dealSeedOf(this.dealSeed.seed, label, parts)) : null;
  }

  /** The referee publishes its seed (after the hand), so that everyone can check the deal. */
  revealDeal(label: string): void {
    const deal = this.currentDeal();
    if (!this.referee.isMe() || !deal || deal.l !== label || !this.dealSeed || this.dealSeed.label !== label) return;
    this.presence.setExtra("dl", { ...deal, r: this.dealSeed.seed });
  }

  /** The session ids the current referee listed as contributors to the deal under `label`, or null (no such deal). */
  dealContributors(label: string): string[] | null {
    const deal = this.currentDeal();
    return deal && deal.l === label ? deal.s.slice() : null;
  }

  /**
   * After revealDeal: the deal, recomputed here from the referee's seed and the contributions this client saw; null if it
   * does not check out. A deal with no contributor but the referee is never fair (the referee could have searched seeds
   * before committing): null, and a warning. With `expected` (the session ids the game says must contribute: the seated
   * players), the referee's list must be exactly those, or the deal is null too (a referee that leaves players out of
   * the list, or lists only accomplices).
   */
  verifyDeal(label: string, expected?: string[]): Draw | null {
    const deal = this.currentDeal();
    if (!deal || deal.l !== label || deal.r === undefined) return null;
    const ref = this.referee.current();
    if (!deal.s.some((sid) => sid !== ref?.sid)) {
      this.warnDeal(label, "lists no contributor but the referee: its outcome was the referee's own choice");
      return null;
    }
    if (expected) {
      const want = [...new Set(expected)].sort();
      const listed = [...new Set(deal.s)].sort();
      if (want.length !== listed.length || want.some((sid, i) => sid !== listed[i])) {
        this.warnDeal(label, `lists ${listed.length} contributors, not the ${want.length} the game expects`);
        return null;
      }
    }
    const seen = this.dealSeen.get(label);
    if (!seen || sha256Text(deal.r) !== seen.h) return null;
    const parts = this.contributions(deal);
    return parts ? new Draw(dealSeedOf(deal.r, label, parts)) : null;
  }

  private readonly warnedDeals = new Set<string>();
  private warnDeal(label: string, why: string): void {
    if (this.warnedDeals.has(label)) return;
    this.warnedDeals.add(label);
    this.core.log("warn", `the deal '${label}' ${why}`);
  }

  private currentDeal(): DealRecord | null {
    const ref = this.referee.current();
    return ref ? parseDeal(this.presence.extra(ref.sid, "dl")) : null;
  }

  /** Every listed contribution, revealed and matching its commitment ("-" for a listed player who left); null while one is missing. */
  private contributions(deal: DealRecord): string[] | null {
    const seen = this.dealSeen.get(deal.l);
    if (!seen) return null;
    const out: string[] = [];
    for (const sid of deal.s) {
      const part = seen.parts.get(sid);
      if (part && part.c !== undefined) out.push(part.c);
      else if (!this.presence.has(sid) && (!part || deal.p === 1)) out.push("-");
      else return null;
    }
    return out;
  }

  /** Follows the deal: records what is first seen, answers for the local player, and moves the referee's phase on. */
  private reviewDeal(): void {
    const ref = this.referee.current();
    const deal = this.currentDeal();
    if (!ref || !deal) return;
    let seen = this.dealSeen.get(deal.l);
    if (!seen || seen.refSid !== ref.sid) {
      seen = { h: deal.h, refSid: ref.sid, parts: new Map() };
      this.dealSeen.set(deal.l, seen);
      while (this.dealSeen.size > 8) this.dealSeen.delete(this.dealSeen.keys().next().value as string);
    }
    for (const sid of deal.s) {
      const part = parseContribution(this.presence.extra(sid, "dc"));
      if (!part || part.l !== deal.l) continue;
      const known = seen.parts.get(sid);
      if (!known) seen.parts.set(sid, { h: part.h });
      const entry = seen.parts.get(sid)!;
      if (part.c !== undefined && entry.c === undefined && entry.h === part.h && sha256Text(part.c) === entry.h) entry.c = part.c;
    }
    const me = this.core.me.sid;
    if (deal.s.includes(me)) {
      if (!this.myContribution || this.myContribution.label !== deal.l) {
        this.myContribution = { label: deal.l, c: toBase64(this.crypto.getRandomValues(new Uint8Array(16))) };
        this.presence.setExtra("dc", { l: deal.l, h: sha256Text(this.myContribution.c) });
      } else if (deal.p === 1) {
        const mine = parseContribution(this.presence.extra(me, "dc"));
        if (mine && mine.c === undefined) this.presence.setExtra("dc", { ...mine, c: this.myContribution.c });
      }
    }
    if (this.referee.isMe() && deal.p === 0 && this.dealSeed && this.dealSeed.label === deal.l) {
      const all = deal.s.every((sid) => seen!.parts.has(sid) || !this.presence.has(sid));
      if (all) this.presence.setExtra("dl", { ...deal, p: 1 });
    }
  }

  // ---- seal / open --------------------------------------------------------------------------------------------

  /** The local public key (raw point, base64url). Empty before `init`. */
  get publicKey(): string {
    return this.publicKeyText;
  }

  /**
   * Makes the local key pair, or loads the one this device saved for this player and instance, so that a page
   * reload can still open what was sealed before it.
   */
  async init(store: KeyValueStore | null, storeKey: string, drawKey = ""): Promise<string> {
    const subtle = this.crypto.subtle;
    if (store && drawKey) {
      this.drawStore = store;
      this.drawKey = drawKey;
      try {
        const saved = safeParse(store.get(drawKey));
        if (isRecord(saved) && typeof saved.l === "string" && typeof saved.s === "string") {
          this.restoring = { e: typeof saved.e === "number" ? saved.e : 0, l: saved.l, s: saved.s, r: saved.r === 1 ? 1 : 0 };
        }
      } catch {
        /* nothing to restore */
      }
    }
    if (store) {
      try {
        const saved = safeParse(store.get(storeKey));
        if (isRecord(saved) && isRecord(saved.d) && typeof saved.p === "string") {
          this.privateKey = await subtle.importKey("jwk", saved.d, CURVE, false, ["deriveKey"]);
          this.publicKeyText = saved.p;
          return this.publicKeyText;
        }
      } catch {
        /* unreadable: make a new pair */
      }
    }
    const pair = await subtle.generateKey(CURVE, true, ["deriveKey"]);
    this.privateKey = pair.privateKey;
    this.publicKeyText = toBase64(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
    if (store) {
      try {
        store.set(storeKey, JSON.stringify({ p: this.publicKeyText, d: await subtle.exportKey("jwk", pair.privateKey) }));
      } catch {
        /* the pair lives for this page only */
      }
    }
    return this.publicKeyText;
  }

  /** True once the player's public key is known, so `seal` for them can work. */
  canSealFor(sid: string): boolean {
    return !!this.presence.get(sid)?.publicKey;
  }

  /**
   * Encrypts `value` for one participant. The result is text that can go anywhere (a synced field, a network
   * event): only that player's key opens it.
   */
  async seal(forSid: string, value: unknown): Promise<string> {
    if (!this.privateKey) throw new Error("secrets are not ready");
    const target = this.presence.get(forSid);
    if (!target || !target.publicKey) throw new Error(`no public key known for player session ${forSid}`);
    const key = await this.sharedKey(target.publicKey);
    const iv = this.crypto.getRandomValues(new Uint8Array(12));
    const me = this.core.me;
    const aad = utf8Encode(`${this.core.prefix}\n${me.sid}\n${forSid}`);
    const plain = utf8Encode(canonicalJson(encodeValue(value)));
    const cipher = new Uint8Array(await this.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plain));
    return JSON.stringify({ f: me.sid, t: forSid, u: target.uid, p: this.publicKeyText, i: toBase64(iv), c: toBase64(cipher) });
  }

  /**
   * Opens a box sealed for the local player. Throws when it is for someone else, was changed on the way, or
   * claims a sender whose announced key is not the one it was sealed with.
   */
  async open<T = unknown>(box: string): Promise<T> {
    if (!this.privateKey) throw new Error("secrets are not ready");
    const b = safeParse(box);
    if (!isRecord(b) || typeof b.f !== "string" || typeof b.t !== "string" || typeof b.p !== "string" || typeof b.i !== "string" || typeof b.c !== "string") {
      throw new Error("not a sealed box");
    }
    const me = this.core.me;
    if (b.t !== me.sid && b.u !== me.uid) throw new Error("this box is sealed for another player");
    // The sender's key must be the one that session announced in its own user state: a box that names a player
    // who has left, or one this client never saw, cannot be told from a forgery and is refused.
    const senderKey = this.presence.keyOf(b.f);
    if (senderKey !== b.p) throw new Error("the box does not come from the player it names");
    const key = await this.sharedKey(b.p);
    const aad = utf8Encode(`${this.core.prefix}\n${b.f}\n${b.t}`);
    let plain: ArrayBuffer;
    try {
      plain = await this.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(b.i), additionalData: aad }, key, fromBase64(b.c));
    } catch {
      throw new Error("the box could not be opened (wrong key or changed contents)");
    }
    return decodeValue(JSON.parse(utf8Decode(new Uint8Array(plain)))) as T;
  }

  /**
   * Seals one value per participant into a single text, for one synced field that is rewritten as a whole.
   *
   * A box written for one player at a telling moment names its reader even though nobody else can open it. Here
   * every participant gets an entry every time, each padded to `slotBytes` before encryption, in session-id
   * order: the text has the same size and shape whoever it really concerns. `valueFor` returns undefined for a
   * participant who gets nothing; their entry is filled with padding.
   */
  async sealAll(valueFor: (sid: string) => unknown, slotBytes = 256): Promise<string> {
    if (!this.privateKey) throw new Error("secrets are not ready");
    const me = this.core.me;
    const entries: Record<string, [string, string]> = {};
    const everyone = this.presence
      .list()
      .map((p) => p.sid)
      .sort();
    for (const sid of everyone) {
      const target = this.presence.get(sid);
      if (!target || !target.publicKey) continue;
      const value = valueFor(sid);
      const text = value === undefined ? "{}" : canonicalJson({ v: encodeValue(value) });
      const bytes = utf8Encode(text);
      if (bytes.length > slotBytes) throw new Error(`sealAll: the value for one player needs ${bytes.length} bytes, more than the slot of ${slotBytes}`);
      const padded = new Uint8Array(slotBytes).fill(0x20);
      padded.set(bytes);
      const key = await this.sharedKey(target.publicKey);
      const iv = this.crypto.getRandomValues(new Uint8Array(12));
      const aad = utf8Encode(`${this.core.prefix}\n${me.sid}\n${sid}\nall`);
      const cipher = new Uint8Array(await this.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, padded));
      entries[sid] = [toBase64(iv), toBase64(cipher)];
    }
    return asciiJson({ f: me.sid, p: this.publicKeyText, n: slotBytes, m: entries });
  }

  /**
   * Opens the local player's entry of a `sealAll` text. Resolves null when the entry holds nothing for them,
   * or there is none (they arrived after it was written).
   */
  async openMine<T = unknown>(bundle: string): Promise<T | null> {
    if (!this.privateKey) throw new Error("secrets are not ready");
    const b = safeParse(bundle);
    if (!isRecord(b) || typeof b.f !== "string" || typeof b.p !== "string" || !isRecord(b.m)) throw new Error("not a sealed bundle");
    const me = this.core.me;
    const entry = b.m[me.sid];
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") return null;
    if (this.presence.keyOf(b.f) !== b.p) throw new Error("the bundle does not come from the player it names");
    const key = await this.sharedKey(b.p);
    const aad = utf8Encode(`${this.core.prefix}\n${b.f}\n${me.sid}\nall`);
    let plain: ArrayBuffer;
    try {
      plain = await this.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(entry[0]), additionalData: aad }, key, fromBase64(entry[1]));
    } catch {
      throw new Error("the entry could not be opened (wrong key or changed contents)");
    }
    const parsed = safeParse(utf8Decode(new Uint8Array(plain)).trimEnd());
    return isRecord(parsed) && "v" in parsed ? (decodeValue(parsed.v) as T) : null;
  }

  /**
   * Opens a box sealed for the local player and says who sealed it (a session id whose announced key the box was
   * sealed with). A game that takes a dealt value as authority checks that the sender is the referee.
   */
  async openWithSender<T = unknown>(box: string): Promise<{ value: T; from: string }> {
    const value = await this.open<T>(box);
    return { value, from: String((safeParse(box) as Record<string, unknown>).f) };
  }

  /** True when `box` names the local player as its reader. */
  isForMe(box: string): boolean {
    const b = safeParse(box);
    return isRecord(b) && (b.t === this.core.me.sid || b.u === this.core.me.uid);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sharedKey(theirPublic: string): Promise<any> {
    let key = this.derived.get(theirPublic);
    if (!key) {
      const subtle = this.crypto.subtle;
      key = (async () => {
        const pub = await subtle.importKey("raw", fromBase64(theirPublic), CURVE, false, []);
        return subtle.deriveKey({ name: "ECDH", public: pub }, this.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      })();
      this.derived.set(theirPublic, key);
      key.catch(() => this.derived.delete(theirPublic));
    }
    return key;
  }
}

function hashOpening(opening: Opening): string {
  return sha256Text(opening.s + "\n" + canonicalJson(opening.v));
}

function dealSeedOf(seed: string, label: string, parts: string[]): string {
  return toHex(sha256(utf8Encode(`${seed}\n${label}\n${parts.join("\n")}`)));
}

function drawSeed(secret: string, number: string, label: string): string {
  return toHex(sha256(utf8Encode(`${secret}\n${number}\n${label}`)));
}
