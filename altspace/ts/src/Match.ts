// The match on the room: the referee runs MatchRules (BasicSpawner.ts) and publishes what everyone may know in one
// synced field, `m`. This is the host side of the upstream BasicSpawner.cs (Spawner:184-230, 1246-1298) on a
// platform with no host (PORT.md 3.1, 3.9, 8.4):
//
//   - Referee: elected only among players who joined the lobby ("declared" candidates), so a bystander is never
//     handed the roles. The referee that dealt is named in `m.d`; if any other client becomes referee while a match
//     runs, the match is void and everyone goes back to the lobby (the new referee never saw what was dealt).
//   - Input: every rostered player's sealed beat (Beat.ts), applied by the referee on its own fixed step, every
//     BEAT_SECONDS, never straight after one beat arrives. Edges are applied at the synced time they happened, the
//     rules running INPUT_DELAY behind the clock so that late beats still go in in time order (the rules clock never
//     goes back).
//   - Positions: the referee keeps its own, moved toward each reported one no faster than a run, along open floor
//     (PORT.md D12).
//   - Output: `m` is written only on a step, and only when it changed; the sealed leaf (Dealer.ts) on every step.
//   - Bots (the `bots` setting) are ticked by the referee every BOT_TICK seconds of rules time, merged in time order
//     with the players' input; their effects are published on the step like everyone else's.

import { Behaviour, type Player, Vector2 } from "../portkit/src/index.ts";
import { MatchRules, type RosterEntry, type RulesEvent } from "./BasicSpawner.ts";
import { BEAT_TICKS, type Beat, decodeBeat, type Secret } from "./Beat.ts";
import { Dealer } from "./Dealer.ts";
import { Announcement, Btn, MatchState, readSettings, Role, type Settings, Team } from "./GameTypes.ts";
import type { Participant } from "./Player.ts";
import { PlayerLink } from "./PlayerLink.ts";
import { Dist, STATION } from "./ShipMap.ts";

export interface PubSlot {
  /** user id ("bot-<n>" for a bot) */
  u: string;
  /** display name */
  n: string;
  /** 1 for a bot */
  b: number;
}

/** Everything about the match that every client may know. Times are seconds after `t0`, the synced start time. */
export interface PublicMatch {
  st: MatchState;
  /** Match number. */
  r: number;
  /** The referee that dealt this match: session and user id. */
  d: string;
  du: string;
  t0: number;
  /** Who started it (user id): may abort it. */
  by: string;
  sl: PubSlot[];
  /** Per slot: alive, body position (0 when none), reportable, voted this muster, seen to be down (D4), left. */
  al: number[];
  bd: Array<number[] | 0>;
  rp: number[];
  vo: number[];
  sd: number[];
  gn: number[];
  /** Start positions per slot (map units); bot positions per slot (0 for a person or a downed bot). */
  sp: number[][];
  bp: Array<number[] | 0>;
  /** Shift clock end; cut-in end (0: none); next job wave (-1: none); waves issued. */
  dl: number;
  ci: number;
  nw: number;
  wi: number;
  /** Muster: end (0: none), who called it (slot, -1), whose body (slot, -1), ring order (slots), next muster allowed. */
  me: number;
  mr: number;
  mb: number;
  ring: number[];
  er: number;
  /** Fault: kind (0 none) and end of its countdown (0: none). */
  fk: number;
  fe: number;
  /** Announcement: [kind, slot (-1), role revealed (0), ends]. */
  an: number[];
  /** Winner team; technicians' jobs done and total; roles, revealed at the end only. */
  w: number;
  cd: number;
  ct: number;
  ro: number[];
  /** Bumped when a wave hands out jobs. */
  ws: number;
  /** The previous match, for the lobby board. */
  last: { w: number; n: string[]; ro: number[] } | null;
  /** A notice for the boards ("void-referee", "aborted", ...) and when it was given (synced seconds). */
  nt: string;
  ntAt: number;
}

export function emptyMatch(): PublicMatch {
  return {
    st: MatchState.Lobby, r: 0, d: "", du: "", t0: 0, by: "",
    sl: [], al: [], bd: [], rp: [], vo: [], sd: [], gn: [], sp: [], bp: [],
    dl: 0, ci: 0, nw: -1, wi: 0, me: 0, mr: -1, mb: -1, ring: [], er: 0, fk: 0, fe: 0,
    an: [0, -1, 0, 0], w: 0, cd: 0, ct: 0, ro: [], ws: 0, last: null, nt: "", ntAt: 0,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** The muster ring: slot positions round the post, radius 2.8, in map units (PORT.md 5.7). */
export function RingPosition(index: number, count: number): Vector2 {
  const angle = (2 * Math.PI * index) / Math.max(1, count);
  return new Vector2(STATION.MeetingPoint.x + 2.8 * Math.sin(angle), STATION.MeetingPoint.y + 2.8 * Math.cos(angle));
}

/** Per human slot, what the referee keeps between beats. */
interface Track {
  lastSeq: number;
  /** Synced time up to which this player's input has been applied, and queued. */
  lastT: number;
  queuedT: number;
  lastBeatT: number;
  /** Metres the player's position may still move at once (fills at RUN_SPEED up to HOP). */
  budget: number;
  /** The time of the last hatch press judged. */
  hatchT: number;
  useHeld: boolean;
  lastText: string;
  /** Where they stood when the last muster began (they are sent back there afterwards). */
  returnPoint: Vector2 | null;
  /** Where an accepted hatch trip lands, and until when a jump there is expected (pose reports can lag a teleport). */
  landing: Vector2 | null;
  landingUntil: number;
  /** The session whose beats these are (a reload starts a new session and new sequence numbers). */
  sid: string;
  /** Synced time since which the player has not been in the world (-1: present). */
  absentSince: number;
}

/** Seconds a rostered player may be away (a page reload) before they count as having left. */
const LEAVE_GRACE = 5;
/**
 * Seconds the rules run behind the synced clock. A press reaches the referee in the next beat (up to 0.25 s later) plus
 * the room's delay (the app batches state every 0.2 s): input up to this late still goes in at the time it happened,
 * in order with everyone else's and the bots'. Later input goes in at the clock's time.
 */
export const INPUT_DELAY = 0.5;
/** The bots' tick, in rules time (upstream: every frame). */
const BOT_TICK = 0.05;
/** A run in the app: walking speed 3.25 m/s times 1.4, with a little to spare (PORT.md D12). */
export const RUN_SPEED = 4.6;
/** The longest move taken at once: a VR teleport hop (the app's default Teleport Range is 8 m). */
export const HOP = 8.5;

interface Item {
  p: Participant;
  t: number;
  order: number;
  edge: number[] | null;
  ref: { beat: Beat; applied: boolean; T: number };
}

export class Match extends Behaviour {
  static override synced = ["m"];
  /** The only methods another client may ask for (portkit: network calls are refused unless listed). */
  static override networkCallable = ["CmdStart", "CmdAbort"];
  m: PublicMatch = emptyMatch();

  settings!: Settings;
  /** The referee's rules engine; null on every other client. */
  rules: MatchRules | null = null;
  /** The referee's memory of the match it dealt. */
  private tracks: Track[] = [];
  /** Input waiting for the rules clock to reach it. */
  private pending: Item[] = [];
  private order = 0;
  /** The rules clock: synced seconds the rules have run up to (it never goes back). */
  private clock = 0;
  /** The next bot tick, in rules time. */
  private botClock = 0;
  private stepping = false;
  private lastMusterEnd = -Infinity;
  private lastPublished = "";
  private dealer: Dealer | null = null;
  /** Test aid: user ids that must be dealt the hidden role (upstream's "host is the hidden role" switch). Not a setting. */
  forcedSaboteurs: string[] | null = null;
  /** Test aid: the referee's rules events, all matches. */
  readonly history: RulesEvent[] = [];
  /** Steps run (tests). */
  steps = 0;
  /** Told whenever `m` changes on this client (the HUD). */
  onChanged: () => void = () => {};

  override Start(): void {
    this.settings = readSettings(this.Settings);
    this.dealer = this.FindBehaviour<Dealer>("dealer");
  }

  override OnDeserialization(): void {
    this.onChanged();
  }

  // ---- reading ------------------------------------------------------------------------------------------------

  get Now(): number {
    return this.Networking.GetServerTimeInSeconds();
  }

  /** Seconds since the match started, on the synced clock. */
  Rel(): number {
    return this.m.t0 > 0 ? this.Now - this.m.t0 : 0;
  }

  /** The slot of a user on the current roster, or -1. */
  SlotOf(uid: string): number {
    return this.m.sl.findIndex((s) => s.u === uid);
  }

  get InMatch(): boolean {
    return this.m.st === MatchState.Playing || this.m.st === MatchState.Muster || this.m.st === MatchState.Ended;
  }

  /** People in the lobby, in the order they joined (first come), from their own leaves. */
  Lobby(): Player[] {
    const links = this.PlayerBehaviours<PlayerLink>("link").filter((l) => l.j > 0 && l.Player !== null);
    links.sort((a, b) => a.j - b.j || (a.Player!.uid < b.Player!.uid ? -1 : 1));
    return links.map((l) => l.Player!);
  }

  // ---- commands to the referee --------------------------------------------------------------------------------

  RequestStart(): void {
    this.SendCommand("CmdStart");
  }

  RequestAbort(): void {
    this.SendCommand("CmdAbort");
  }

  CmdStart(): void {
    if (!this.Networking.IsReferee || this.m.st !== MatchState.Lobby) return;
    const caller = this.Networking.CallingPlayer;
    if (!caller) return;
    const lobby = this.Lobby();
    const s = this.settings;
    if (s.startBy === "admin" ? !caller.isSpaceAdmin : !lobby.some((p) => p.sid === caller.sid)) return;
    const humans = lobby.slice(0, s.maxPlayers);
    const bots = Math.min(s.bots, s.maxPlayers - humans.length);
    if (humans.length + bots < s.minPlayers || humans.length === 0) return;
    const roster: RosterEntry[] = humans.map((p) => ({ uid: p.uid, name: p.displayName, isBot: false }));
    for (let i = 0; i < bots; i++) roster.push({ uid: `bot-${i + 1}`, name: `Bot ${i + 1}`, isBot: true });
    this.Begin(roster, caller.uid);
  }

  CmdAbort(): void {
    if (!this.Networking.IsReferee || this.m.st === MatchState.Lobby) return;
    const caller = this.Networking.CallingPlayer;
    if (!caller || (caller.uid !== this.m.by && !caller.isSpaceAdmin)) return;
    this.ToLobby("aborted");
  }

  // ---- the referee --------------------------------------------------------------------------------------------

  private Begin(roster: RosterEntry[], by: string): void {
    const rules = new MatchRules(this.settings, STATION, this.Random, {}, (e) => this.history.push(e));
    rules.forcedSaboteurs = this.forcedSaboteurs;
    rules.time = round3(this.Now);
    rules.StartRound(roster);
    this.rules = rules;
    const t0 = rules.startedAt;
    this.tracks = roster.map(() => ({ lastSeq: -1, lastT: t0, queuedT: t0, lastBeatT: t0, budget: HOP, hatchT: t0, useHeld: false, lastText: "", returnPoint: null, landing: null, landingUntil: 0, sid: "", absentSince: -1 }));
    this.pending = [];
    this.clock = t0;
    this.botClock = t0 + BOT_TICK;
    this.lastMusterEnd = -Infinity;
    const me = this.Networking.LocalPlayer;
    this.m = {
      ...emptyMatch(),
      r: this.m.r + 1,
      d: me.sid,
      du: me.uid,
      t0: round3(t0),
      by,
      sl: roster.map((e) => ({ u: e.uid, n: e.name, b: e.isBot ? 1 : 0 })),
      sp: rules.players.map((p) => [round2(p.position.x), round2(p.position.y)]),
      last: this.m.last,
    };
    // Start positions are rounded for the public record; the rules use the same rounded points.
    rules.players.forEach((p, i) => (p.position = new Vector2(this.m.sp[i]![0]!, this.m.sp[i]![1]!)));
    this.Publish(true);
    this.Deal();
  }

  override Update(): void {
    if (!this.Networking.IsReferee) {
      this.rules = null;
      return;
    }
    // A match this client did not deal (another referee's, or its own before a reload) is void: it never saw the
    // roles (PORT.md Q2).
    if (this.m.st !== MatchState.Lobby && !this.rules) {
      this.ToLobby("void-referee");
      return;
    }
    if (!this.rules) return;
    if (this.Time.frameCount % BEAT_TICKS === 0) void this.Step(this.Now);
  }

  override OnMasterTransferred(): void {
    if (!this.Networking.IsReferee) this.rules = null;
  }

  /**
   * One fixed step: open the beats that came in, then run the rules up to INPUT_DELAY ago, every player's input and
   * the bots' ticks merged in time order (the rules clock never goes back), publish, re-seal.
   */
  private async Step(now: number): Promise<void> {
    const rules = this.rules;
    if (!rules || this.stepping) return;
    this.stepping = true;
    try {
      const round = this.m.r;
      const beats = await this.OpenBeats(rules);
      if (this.rules !== rules || this.m.r !== round || !this.Networking.IsReferee) return;
      this.steps++;
      if (rules.roundStarted) this.QueueBeats(rules, beats, now);
      this.Advance(rules, Math.max(this.clock, now - INPUT_DELAY));
      this.CheckGone(rules);
      if (rules.ended && this.clock >= rules.endedAt + this.settings.announceSeconds) {
        this.ToLobby("");
        return;
      }
      this.Publish(false);
      this.Deal();
    } finally {
      this.stepping = false;
    }
  }

  private links(): Map<string, PlayerLink> {
    const out = new Map<string, PlayerLink>();
    for (const link of this.PlayerBehaviours<PlayerLink>("link")) if (link.Player) out.set(link.Player.uid, link);
    return out;
  }

  private async OpenBeats(rules: MatchRules): Promise<Array<{ p: Participant; beat: Beat; sid: string }>> {
    const links = this.links();
    const work: Array<Promise<{ p: Participant; beat: Beat; sid: string } | null>> = [];
    for (const p of rules.players) {
      if (p.isBot || p.gone) continue;
      const track = this.tracks[p.slot]!;
      const link = links.get(p.uid);
      const text = link?.b ?? "";
      if (!link || !text || text === track.lastText) continue;
      track.lastText = text;
      const owner = link.Player!.sid;
      work.push(
        this.Secrets.openWithSender<string>(text)
          .then(({ value, from }) => {
            // Only a beat the leaf's own player sealed counts: a copy of someone else's beat is ignored.
            if (from !== owner) return null;
            const beat = decodeBeat(value);
            return beat ? { p, beat, sid: owner } : null;
          })
          .catch(() => null),
      );
    }
    return (await Promise.all(work)).filter((x): x is { p: Participant; beat: Beat; sid: string } => x !== null);
  }

  /** Applies opened beats: every edge at its own synced time, all players' edges merged in time order. */
  /** Queues opened beats: every edge at its own synced time, and the end of each beat (its position and held bits). */
  private QueueBeats(rules: MatchRules, beats: Array<{ p: Participant; beat: Beat; sid: string }>, now: number): void {
    const t0 = rules.startedAt;
    for (const { p, beat, sid } of beats) {
      const track = this.tracks[p.slot]!;
      if (track.sid !== sid) {
        // A new session for this slot (a reload): its beats are numbered afresh.
        track.sid = sid;
        track.lastSeq = -1;
      }
      if (beat.m !== this.m.r || beat.q <= track.lastSeq) continue;
      track.lastSeq = beat.q;
      const queued = track.queuedT;
      const T = Math.min(now, Math.max(queued, t0 + beat.t));
      const ref = { beat, applied: false, T };
      const edges = beat.e.slice().sort((a, b) => a[2]! - b[2]!);
      for (const e of edges) {
        const at = t0 + e[2]!;
        if (at <= queued) continue; // already queued from an earlier beat
        this.pending.push({ p, t: Math.min(T, at), order: this.order++, edge: e, ref });
      }
      this.pending.push({ p, t: T, order: this.order++, edge: null, ref });
      track.queuedT = T;
    }
  }

  /**
   * Runs the rules up to `horizon`: queued input and bot ticks (every BOT_TICK) in time order, the timers before
   * each. Input that arrives later than INPUT_DELAY is applied at the clock's time, never before it.
   */
  private Advance(rules: MatchRules, horizon: number): void {
    this.pending.sort((a, b) => a.t - b.t || a.p.slot - b.p.slot || a.order - b.order);
    let next = 0;
    for (;;) {
      const item = this.pending[next];
      const itemT = item && item.t <= horizon ? Math.max(this.clock, item.t) : Infinity;
      const botT = this.botClock <= horizon ? Math.max(this.clock, this.botClock) : Infinity;
      if (itemT === Infinity && botT === Infinity) break;
      if (botT < itemT) {
        this.clock = rules.time = botT;
        this.botClock += BOT_TICK;
        rules.UpdateTimers();
        if (rules.roundStarted) rules.UpdateBots(BOT_TICK);
        continue;
      }
      next++;
      this.clock = rules.time = itemT;
      rules.UpdateTimers();
      if (!rules.roundStarted) {
        next = this.pending.length;
        break;
      }
      this.ApplyItem(rules, item!, itemT);
    }
    this.pending = this.pending.slice(next);
    this.clock = rules.time = Math.max(this.clock, horizon);
    rules.UpdateTimers();
  }

  /** One queued item: the beat's position (once), the held channel up to now, then the edge or the beat's held bits. */
  private ApplyItem(rules: MatchRules, item: Item, t: number): void {
    const { p } = item;
    const track = this.tracks[p.slot]!;
    if (!item.ref.applied) {
      item.ref.applied = true;
      this.ApplyPosition(rules, p, track, item.ref.beat, item.ref.T);
    }
    const dt = t - track.lastT;
    if (dt > 0) rules.UpdateHeldInteract(p, dt, track.useHeld);
    track.lastT = Math.max(track.lastT, t);
    const e = item.edge;
    if (e) {
      const button = e[0]!;
      const down = e[1] === 1;
      if (button === Btn.Use) track.useHeld = down;
      if (down) {
        switch (button) {
          case Btn.Eliminate:
            rules.TryUseKill(p);
            break;
          case Btn.Alarm:
            rules.TryUseReport(p);
            break;
          case Btn.Vote:
            rules.TrySubmitVote(p, e[3]! | 0);
            break;
          case Btn.Use:
            rules.TryInteract(p);
            break;
          case Btn.Fault:
            rules.TryStartSabotage(p);
            break;
          default:
            break; // the hatch was judged with the position
        }
      }
      if (button === Btn.Use) rules.UpdateHeldInteract(p, 0, track.useHeld);
    } else {
      // The end of a beat: the held bits are the truth if an edge was lost.
      const held = (item.ref.beat.h & (1 << Btn.Use)) !== 0;
      if (held !== track.useHeld) {
        track.useHeld = held;
        rules.UpdateHeldInteract(p, 0, held);
      }
    }
  }

  /**
   * A beat's position (PORT.md D12). Positions are self-reported (a page cannot read another player's), so the
   * referee keeps its own: it moves to the reported point when a body could have got there, straight along open floor
   * (the rules' walkable test) and within a travel allowance that fills at a run (RUN_SPEED) up to one VR teleport hop
   * (HOP). Otherwise it goes toward the point along open floor as far as the allowance reaches, and no farther: a
   * claimed jump is never taken. Jumps the game itself makes (start, muster ring, return, hatch) are taken at once.
   */
  private ApplyPosition(rules: MatchRules, p: Participant, track: Track, beat: Beat, T: number): void {
    const from = p.position.clone();
    const next = new Vector2(beat.p[0], beat.p[1]);
    for (const e of beat.e) {
      const at = rules.startedAt + e[2]!;
      if (e[0] !== Btn.Hatch || e[1] !== 1 || at <= track.hatchT) continue;
      track.hatchT = at;
      const landing = rules.TryUseHatch(p, from, e[3]! | 0);
      if (landing) {
        track.landing = landing;
        track.landingUntil = T + 2;
        break;
      }
    }
    const dt = Math.max(0, T - track.lastBeatT);
    track.lastBeatT = T;
    track.budget = Math.min(HOP, track.budget + RUN_SPEED * dt);
    if (!p.isAlive) return;
    const near = (a: Vector2 | null | undefined, r = 2) => (a && Dist(next, a) <= r ? a : null);
    const ring = (): Vector2 | null => {
      if (!(rules.meetingActive || T < this.lastMusterEnd + 10)) return null;
      for (let i = 0; i < this.m.ring.length; i++) {
        const at = near(RingPosition(i, this.m.ring.length));
        if (at) return at;
      }
      return null;
    };
    const anchor =
      (T <= track.landingUntil ? near(track.landing) : null) ??
      (T < rules.startedAt + 15 ? near(new Vector2(this.m.sp[p.slot]![0]!, this.m.sp[p.slot]![1]!)) : null) ??
      ring() ??
      (T < this.lastMusterEnd + 15 ? near(track.returnPoint) : null);
    let at = from;
    if (anchor) {
      // a jump the game made: from the point it made it to, the rest is an ordinary move
      at = STATION.ClampToWalkable(anchor, 0);
      track.budget = HOP;
    }
    let target = STATION.IsBlocked(next, 0) ? STATION.ClampToWalkable(next, 0) : next;
    if (Dist(target, next) > 3) target = at; // nowhere near open floor: stay
    const d = Dist(at, target);
    if (d <= track.budget + 1e-6 && STATION.HasClearWalkableSegment(at, target, 0)) {
      track.budget -= d;
      p.position = target;
      return;
    }
    const reached = Match.Toward(at, target, track.budget);
    track.budget = Math.max(0, track.budget - reached.used);
    p.position = reached.at;
  }

  /** At most `allowance` metres from `from` toward `to`, along open floor (straight when clear, else the map's route). */
  static Toward(from: Vector2, to: Vector2, allowance: number): { at: Vector2; used: number } {
    let at = from.clone();
    let left = allowance;
    for (let i = 0; i < 8 && left > 0.01; i++) {
      let step = STATION.HasClearWalkableSegment(at, to, 0) ? to : STATION.NextStep(at, to, 0.3);
      if (!STATION.HasClearWalkableSegment(at, step, 0)) step = STATION.ClampToWalkable(at, 0.3);
      const d = Dist(at, step);
      if (d < 0.01 || !STATION.HasClearWalkableSegment(at, step, 0)) break;
      if (d <= left) {
        at = step;
        left -= d;
      } else {
        at = Vector2.Lerp(at, step, left / d);
        left = 0;
      }
      if (Dist(at, to) < 0.01) break;
    }
    return { at, used: allowance - left };
  }

  /**
   * Upstream OnPlayerLeft: a person on the roster who is no longer in the world has left. Checked every step (so a
   * departure while there was no referee is not missed), after LEAVE_GRACE seconds so a page reload keeps the seat.
   */
  private CheckGone(rules: MatchRules): void {
    const present = new Set(this.Networking.GetPlayers().map((p) => p.uid));
    const now = this.Now;
    for (const p of rules.players) {
      if (p.isBot || p.gone) continue;
      const track = this.tracks[p.slot]!;
      if (present.has(p.uid)) {
        track.absentSince = -1;
        continue;
      }
      if (track.absentSince < 0) track.absentSince = now;
      if (now - track.absentSince < LEAVE_GRACE) continue;
      rules.time = this.clock;
      rules.PlayerLeft(p.slot);
    }
  }

  /** Copies the public part of the rules into `m`, and writes it if it changed. */
  private Publish(force: boolean): void {
    const rules = this.rules;
    if (!rules) return;
    const t0 = rules.startedAt;
    const rel = (t: number) => (t > 0 && Number.isFinite(t) ? round2(t - t0) : 0);
    const ps = rules.players;
    const st = rules.ended ? MatchState.Ended : rules.meetingActive ? MatchState.Muster : MatchState.Playing;
    let ring = this.m.ring;
    if (rules.meetingActive && this.m.st !== MatchState.Muster) {
      // A new muster: the living stand round the post in slot order, and are sent back afterwards.
      ring = ps.filter((p) => p.isAlive && !p.gone).map((p) => p.slot);
      for (const p of ps) if (this.tracks[p.slot]) this.tracks[p.slot]!.returnPoint = p.position.clone();
    }
    if (!rules.meetingActive && this.m.st === MatchState.Muster) this.lastMusterEnd = rules.time;
    // D4: the boards' jobs total keeps a downed technician's jobs until the death is seen; the result shows the real one.
    const progress = rules.ended ? rules.GetCrewTaskProgress() : rules.GetPublicTaskProgress();
    const an = rules.announcement;
    const m: PublicMatch = {
      ...this.m,
      st,
      al: ps.map((p) => (p.isAlive ? 1 : 0)),
      bd: ps.map((p) => (p.bodyPosition && !p.isAlive ? [round2(p.bodyPosition.x), round2(p.bodyPosition.y)] : 0)),
      rp: ps.map((p) => (p.isReportableBody ? 1 : 0)),
      vo: ps.map((p) => (p.hasVoted ? 1 : 0)),
      sd: ps.map((p) => (rules.seenDown.has(p.slot) ? 1 : 0)),
      gn: ps.map((p) => (p.gone ? 1 : 0)),
      bp: ps.map((p) => (p.isBot && p.isAlive ? [round2(p.position.x), round2(p.position.y)] : 0)),
      dl: rel(rules.taskDeadlineEndsAt),
      ci: rules.taskFailurePending ? rel(rules.taskFailureCutInEndsAt) : 0,
      nw: Number.isFinite(rules.nextTimedTaskAt) ? rel(rules.nextTimedTaskAt) : -1,
      wi: rules.timedTaskWavesIssued,
      me: rules.meetingActive ? rel(rules.meetingEndsAt) : 0,
      mr: rules.meetingActive ? rules.meetingReporterNumber - 1 : -1,
      mb: rules.meetingActive ? rules.meetingBodyNumber - 1 : -1,
      ring: rules.meetingActive ? ring : [],
      er: rel(rules.nextEmergencyAllowedAt),
      fk: rules.activeFault,
      fe: rel(rules.activeFaultEndsAt),
      an: [an.kind, an.playerNumber - 1, an.kind === Announcement.MusterResult ? an.role : 0, rel(an.endsAt)],
      w: rules.winner,
      cd: progress.completed,
      ct: progress.total,
      ro: rules.ended ? ps.map((p) => p.role) : [],
      ws: rules.waveSerial,
    };
    const text = JSON.stringify(m);
    if (!force && text === this.lastPublished) return;
    this.lastPublished = text;
    this.m = m;
    this.RequestSerialization();
    this.onChanged();
  }

  /** Seals every player's secret for them; called on every step of the match, changed or not. */
  private Deal(): void {
    const rules = this.rules;
    if (!rules || !this.dealer) return;
    const t0 = rules.startedAt;
    const rel = (t: number) => Math.max(0, Math.round((t - t0) * 100) / 100);
    const saboteurs = rules.players.filter((p) => p.role === Role.Saboteur).map((p) => p.slot);
    const entries: Array<Secret | null> = rules.players.map((p) =>
      p.isBot
        ? null
        : {
            n: this.m.r,
            r: p.role,
            f: p.role === Role.Saboteur ? saboteurs.filter((s) => s !== p.slot) : [],
            a: p.assignedTaskMask,
            c: p.completedTaskMask,
            l: p.lastAssignedTaskId,
            k: p.role === Role.Saboteur ? rel(p.KillReadyAt()) : 0,
            s: p.role === Role.Saboteur ? rel(rules.nextFaultAllowedAt) : 0,
          },
    );
    const bySid = new Map<string, Player>();
    for (const pl of this.Networking.GetPlayers()) bySid.set(pl.uid, pl);
    void this.dealer.Deal(this.m.r, entries, rules.players.map((p) => (p.isBot ? null : (bySid.get(p.uid) ?? null))));
  }

  /** Back to the lobby: after the result, or at once for a void or aborted match. The roster stays in the lobby. */
  private ToLobby(notice: string): void {
    const rules = this.rules;
    const ended = rules?.ended === true;
    const last = ended && rules ? { w: rules.winner, n: rules.players.map((p) => p.name), ro: rules.players.map((p) => p.role) } : this.m.last;
    this.rules = null;
    this.tracks = [];
    this.pending = [];
    this.m = { ...emptyMatch(), r: this.m.r, last, nt: notice, ntAt: notice ? round3(this.Now) : 0 };
    this.lastPublished = JSON.stringify(this.m);
    this.RequestSerialization();
    this.dealer?.Clear();
    this.onChanged();
  }

  // ---- for tests and the debug hooks ------------------------------------------------------------------------------

  /** The referee's view of who holds which role (null elsewhere). */
  RolesForTest(): Record<string, number> | null {
    if (!this.rules) return null;
    const out: Record<string, number> = {};
    for (const p of this.rules.players) out[p.uid] = p.role;
    return out;
  }

  static TeamName(team: number): string {
    return team === Team.Technicians ? "technicians" : team === Team.Saboteurs ? "saboteurs" : "nobody";
  }
}
