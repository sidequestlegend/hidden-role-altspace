// The referee stands in for VRChat's master client. There is no host on this platform, so one participant is
// elected per instance and named in the state leaf `ref` = {sid, uid, term, e}.
//
//   - The mirrored value is the truth. It is valid while its session is a candidate.
//   - While it is invalid, candidates rank by user id and rank r writes a claim after r x 400 ms, with term + 1.
//     Two claims can cross; the room keeps the last one written and everybody obeys what they see mirrored.
//   - Nobody writes `ref` while a valid one is mirrored, so a valid referee is never replaced.
//   - Who is a candidate is the game's choice. "anyone": every participant. "declared": only participants who
//     have said so themselves (Networking.SetRefereeCandidate), in their own user state. A hidden-information
//     game uses that so that a bystander is never elected and handed every secret. With no candidate there is no
//     referee and the instance idles: behaviours run, but nothing unowned can be written. A referee who stops
//     being a candidate stops being referee, and the others elect again.
//   - Two claims of one term written in the same moment both seem to win for a while: each claimant may see its own
//     first. The room still ends with one (the last written), so a claimant does not start its game on what it sees
//     until the record has stood still for CROSSING_MS after its claim (settlingMs; the instance waits for it). The
//     loser then starts as a follower of the winner ("joined"), and only the winner starts the game ("fresh").
//   - `e` is the epoch. A claimant that finds nobody left from the last game (no participant says it is running
//     in the mirrored epoch) raises it, and every record of an older epoch then counts as absent: the instance
//     starts fresh without a delete having to race the writes that follow it.

import type { Core } from "./core.ts";
import type { Presence } from "./presence.ts";
import { asciiJson, isRecord, safeParse } from "./util.ts";

export interface RefRecord {
  sid: string;
  uid: string;
  term: number;
  e: number;
}

export type CandidateRule = "anyone" | "declared";

type Handler = (now: RefRecord | null, before: RefRecord | null) => void;

/** Two claims written at nearly the same time settle within this long; a later replacement is not a crossing. */
const CROSSING_MS = 1500;

export class Referee {
  private readonly core: Core;
  private readonly presence: Presence;
  private readonly rule: CandidateRule;
  private readonly handlers: Handler[] = [];
  private judging = false;
  private timer = 0;
  private timerDue = -1;
  private invalidSince = 0;
  private claimAt = -Infinity;
  /** When the mirrored record last changed (or went invalid), for settlingMs. */
  private changedAt = -Infinity;
  private seen: RefRecord | null = null;
  private lastEpoch = 0;
  private declared = false;
  /** Counters for tests and diagnostics. */
  claims = 0;
  /** What this client found when it last claimed: a new epoch, or a game other participants were still running. */
  lastClaim: { term: number; fresh: boolean; alive: boolean } | null = null;

  constructor(core: Core, presence: Presence, rule: CandidateRule) {
    this.core = core;
    this.presence = presence;
    this.rule = rule;
  }

  start(): void {
    this.core.onState((key) => {
      if (key === "ref") this.check();
    });
    this.presence.on(() => this.check());
    this.presence.onExtra(() => this.check());
    this.invalidSince = this.core.platform.clock.now();
    this.check();
    this.core.scheduler.after(this.core.options.settleMs, () => {
      this.judging = true;
      this.invalidSince = this.core.platform.clock.now();
      this.check();
    });
  }

  /** The mirrored record, whether or not its session is still a candidate. */
  mirrored(): RefRecord | null {
    const raw = safeParse(this.core.get("ref"));
    if (!isRecord(raw) || typeof raw.sid !== "string" || typeof raw.uid !== "string") return null;
    if (typeof raw.term !== "number" || typeof raw.e !== "number") return null;
    return { sid: raw.sid, uid: raw.uid, term: raw.term, e: raw.e };
  }

  /** The referee, or null while there is none. */
  current(): RefRecord | null {
    const m = this.mirrored();
    return m && this.isCandidate(m.sid) ? m : null;
  }

  isMe(): boolean {
    return this.current()?.sid === this.core.me.sid;
  }

  /**
   * How long before this client may start its game on the referee it sees: 0 if it never claimed (a follower takes
   * what is mirrored), else until the record has not changed for CROSSING_MS since its last claim, so that a claim of
   * the same term that crossed its own has arrived and the room's choice is the one everybody sees.
   */
  settlingMs(): number {
    if (this.claims === 0) return 0;
    const quietSince = Math.max(this.claimAt, this.changedAt);
    return Math.max(0, quietSince + CROSSING_MS - this.core.platform.clock.now());
  }

  /** The epoch of the last valid referee seen: records of any other epoch are ignored. 0 before the first. */
  get epoch(): number {
    return this.lastEpoch;
  }

  /** May this session be elected? */
  isCandidate(sid: string): boolean {
    if (!this.presence.has(sid)) return false;
    return this.rule === "anyone" || this.presence.extra(sid, "rc") === 1;
  }

  /** Candidates in rank order. */
  candidates(): string[] {
    return this.presence
      .list()
      .filter((p) => this.isCandidate(p.sid))
      .map((p) => p.sid);
  }

  /** Under the "declared" rule: offers the local player as referee, or withdraws the offer. */
  setCandidate(on: boolean): void {
    if (this.declared === on) return;
    this.declared = on;
    this.presence.setExtra("rc", on ? 1 : undefined);
    this.presence.flush();
  }

  /** Tells the others which epoch this client is running in, so a claimant knows the game is still alive. */
  private publishEpoch(): void {
    if (this.presence.extra(this.core.me.sid, "ep") === this.lastEpoch) return;
    this.presence.setExtra("ep", this.lastEpoch);
    this.presence.flush();
  }

  on(handler: Handler): void {
    this.handlers.push(handler);
  }

  private check(): void {
    if (this.core.disposed) return;
    const now = this.current();
    const before = this.seen;
    if (now) {
      this.cancelTimer();
      if (!before || before.sid !== now.sid || before.term !== now.term || before.e !== now.e) {
        // Nobody honest writes `ref` while a valid referee is mirrored, so a sitting referee replaced while it is
        // still a candidate was displaced by a modified client (or by a claim that crossed its own, just after it: one
        // that comes while its record had not yet stood still for CROSSING_MS, as settlingMs counts it).
        const me = this.core.me.sid;
        const settled = this.core.platform.clock.now() - Math.max(this.claimAt, this.changedAt) > CROSSING_MS;
        if (before && before.sid === me && now.sid !== me && this.isCandidate(me) && settled) {
          this.core.log("warn", `the referee seat was taken by session ${now.sid} (term ${now.term}) while this client was referee`);
        }
        this.lastEpoch = now.e;
        this.seen = now;
        this.changedAt = this.core.platform.clock.now();
        this.publishEpoch();
        this.emit(now, before);
      }
      return;
    }
    if (before) {
      this.seen = null;
      this.invalidSince = this.core.platform.clock.now();
      this.changedAt = this.invalidSince;
      this.claimAt = -Infinity;
      this.emit(null, before);
    }
    if (!this.judging) return;
    const me = this.core.me.sid;
    const rank = this.candidates().indexOf(me);
    if (rank < 0) {
      this.cancelTimer();
      return; // not a candidate: someone else must claim, or nobody
    }
    // A claim of ours may still be on its way; give it time before claiming again.
    const earliest = Math.max(this.invalidSince + rank * this.core.options.claimStepMs, this.claimAt + this.core.options.claimRetryMs);
    if (this.timer && this.timerDue === earliest) return;
    this.cancelTimer();
    this.timerDue = earliest;
    this.timer = this.core.scheduler.after(Math.max(0, earliest - this.core.platform.clock.now()), () => {
      this.timer = 0;
      this.claim();
    });
  }

  private claim(): void {
    if (this.core.disposed || this.current()) return;
    const me = this.core.me;
    if (!this.isCandidate(me.sid)) return;
    const old = this.mirrored();
    // Is anybody still running the game the mirrored record belongs to?
    const alive = old !== null && this.presence.list().some((p) => this.presence.extra(p.sid, "ep") === old.e);
    const fresh = old === null || (this.core.options.whenEmpty === "reset" && !alive);
    const record: RefRecord = { sid: me.sid, uid: me.uid, term: (old?.term ?? 0) + 1, e: (old?.e ?? 0) + (fresh ? 1 : 0) };
    this.claims++;
    this.lastClaim = { term: record.term, fresh, alive };
    this.claimAt = this.core.platform.clock.now();
    this.core.log("info", `claiming referee, term ${record.term}, epoch ${record.e}${fresh && old ? " (fresh start)" : ""}`);
    this.core.set("ref", asciiJson(record));
    this.check(); // schedules the retry in case this claim never comes back
  }

  private cancelTimer(): void {
    if (this.timer) this.core.scheduler.cancel(this.timer);
    this.timer = 0;
    this.timerDue = -1;
  }

  private emit(now: RefRecord | null, before: RefRecord | null): void {
    for (const handler of this.handlers.slice()) this.core.guard("referee handler", () => handler(now, before));
  }
}
