// The local player's side of the game: what upstream's RuntimeHud.cs showed on the screen (Hud:241-383, 407-835,
// 888-945) and what the Fusion client sent its host (Spawner:744-777), on a platform where every client is its own
// display and its own body:
//
//   - input: keys (E use, Q eliminate, R alarm, F fault, V hatch), controller buttons, and the personal panel's
//     buttons, all turned into the same six logical buttons, sent as a sealed beat every BEAT_SECONDS (Beat.ts);
//   - the local player's own body: start positions, the muster ring and back, the observer lounge, the movement lock
//     in musters and at the end, hatch trips (PORT.md 5.8, 5.10, C7, C8);
//   - the boards: the hub (lobby and roster), the muster board (votes), the lounge board, the personal panel (role,
//     jobs nearest first, cooldowns, hints), world markers (bodies, bots, own consoles) and the blackout shell.
//
// Nothing here is synced. Everything it shows comes from the public match (`Match.m`) and the local player's own
// sealed entry (`Dealer.mine`).

import { Behaviour, Color, type GameObject, type TextRef, Quaternion, Vector2, Vector3 } from "../portkit/src/index.ts";
import { BEAT_TICKS, type Edge, EDGE_WINDOW, encodeBeat, type Secret } from "./Beat.ts";
import type { Dealer } from "./Dealer.ts";
import { ABSTAIN, Announcement, Btn, Fault, FAULT_NAMES, JOB_KIND_NAMES, JobKind, MatchState, readSettings, Role, ROLE_NAMES, type Settings, Team, TEAM_NAMES } from "./GameTypes.ts";
import { emptyMatch, type Match, type PublicMatch, RingPosition } from "./Match.ts";
import type { PlayerLink } from "./PlayerLink.ts";
import { Dist, STATION } from "./ShipMap.ts";
import type { JobStation } from "./ShipMapData.ts";

/** The lounge is a sealed room this far below the station unless the snippet says where (PORT.md 5.7). */
const LOUNGE_OFFSET = new Vector3(0, -70, 0);
const WAVE_ALERT_SECONDS = 6;
const CLOCK_WARNING_SECONDS = 30;
const GOLD = new Color(1, 0.78, 0.2, 1);
const TEAL = new Color(0.2, 0.85, 0.8, 1);
const PLUM = new Color(0.62, 0.38, 0.85, 1);
const DIM = new Color(0.25, 0.28, 0.32, 1);
const AMBER = new Color(1, 0.55, 0.1, 1);
const CLIP_ALERT = 0;
const CLIP_ALARM = 1;
/** Where the boarding pad stands, outside the station's south wall (map units): "Leave" goes there. */
export const ENTRY_POINT = new Vector2(6, -57.6);
/** A console click on a hold job keeps Use down this much longer than the job needs, then lets go. */
const HOLD_MARGIN = 0.35;

function parseVector(text: string | undefined, fallback: Vector3): Vector3 {
  const parts = (text ?? "").trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? new Vector3(parts[0]!, parts[1]!, parts[2]!) : fallback;
}

function compass(from: Vector2, to: Vector2): string {
  const d = to.sub(from);
  if (d.magnitude < 0.5) return "here";
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const angle = (Math.atan2(d.x, d.y) * 180) / Math.PI;
  return names[(Math.round(angle / 45) + 8) % 8]!;
}

function seconds(value: number): string {
  return `${Math.max(0, Math.ceil(value))}s`;
}

export class RuntimeHud extends Behaviour {
  // ---- from bindings.json -------------------------------------------------------------------------------------
  hubText!: TextRef;
  musterText!: TextRef;
  loungeText!: TextRef;
  panelText!: TextRef;
  voteLabels: TextRef[] = [];
  personalPanel: GameObject | null = null;
  shell: GameObject | null = null;
  bodies: GameObject[] = [];
  botMarkers: GameObject[] = [];
  consoles: GameObject[] = [];
  /** The jobs-done bars (the hub board's and the personal panel's): fills scaled along x from their left end. */
  jobBars: GameObject[] = [];
  /** The personal panel's work bar: how far the job (or reset) in hand has got, as this client sees it. */
  workBar: GameObject | null = null;
  /** The timing band drawn on the work bar while a timing job sweeps. */
  workBand: GameObject | null = null;
  /** Turned to face this player while a muster runs. */
  musterBoard: GameObject | null = null;
  creditsPanel: GameObject | null = null;

  // ---- local state --------------------------------------------------------------------------------------------
  settings!: Settings;
  private match!: Match;
  private dealer!: Dealer;
  private origin = Vector3.zero;
  private yaw = 0;
  private lounge = Vector3.zero;
  private held = 0;
  private edges: Edge[] = [];
  private seq = 0;
  private sealing = false;
  private useLatched = false;
  /** A console click on a hold job (or a reset) lets Use go at this local time (0: no). */
  private autoReleaseAt = 0;
  /** Local time Use last went down, and the taps counted at one console (the work bar). */
  private useDownAt = 0;
  private tapStation = -1;
  private taps = 0;
  private lastWork = -1;
  private creditsOpen = false;
  /** What the local effects were last applied for. */
  private applied = { round: -1, state: MatchState.Lobby as number, alive: true, inMatch: false, placedRound: -1, slot: -1 };
  private returnPoint: Vector2 | null = null;
  private lastObserverCheck = 0;
  private lastSecret: Secret | null = null;
  private waveAlertUntil = 0;
  private lastHeadSent: Vector3 | null = null;
  private lastCutIn = 0;
  /** Teleports this client made, in map units (tests read them). */
  readonly moves: Array<{ why: string; at: Vector2 }> = [];
  /** The texts as last set (tests read them). */
  readonly texts = { hub: "", muster: "", lounge: "", panel: "" };

  override Start(): void {
    this.settings = readSettings(this.Settings);
    this.match = this.FindBehaviour<Match>("match")!;
    this.dealer = this.FindBehaviour<Dealer>("dealer")!;
    this.origin = parseVector(this.Settings.get("position"), Vector3.zero);
    this.yaw = parseVector(this.Settings.get("rotation"), Vector3.zero).y;
    this.lounge = parseVector(this.Settings.get("observer-position"), this.origin.add(LOUNGE_OFFSET));
    this.dealer.onMine = (secret) => {
      this.OnSecret(secret);
      this.Refresh();
    };
    this.match.onChanged = () => this.Refresh();
    this.Refresh();
  }

  // ---- coordinates --------------------------------------------------------------------------------------------

  /** Map units (x right, y up the map) to the world (x, z), with the snippet's position and Y rotation. */
  ToWorld(p: Vector2, height = 0): Vector3 {
    const local = Quaternion.Euler(0, this.yaw, 0).rotate(new Vector3(p.x, 0, p.y));
    return new Vector3(this.origin.x + local.x, this.origin.y + height, this.origin.z + local.z);
  }

  ToMap(w: Vector3): Vector2 {
    const local = Quaternion.Euler(0, -this.yaw, 0).rotate(new Vector3(w.x - this.origin.x, 0, w.z - this.origin.z));
    return new Vector2(local.x, local.z);
  }

  /** The local player's position in map units, or null before the page knows it. */
  MyMapPosition(): Vector2 | null {
    const w = this.Input.Position;
    return w ? this.ToMap(w) : null;
  }

  private InsideStation(w: Vector3): boolean {
    if (w.y < this.origin.y - 3 || w.y > this.origin.y + 8) return false;
    // inside, or within a metre of, a room or corridor (the boarding pad outside the south wall is not inside)
    const p = this.ToMap(w);
    return [...STATION.RoomBounds, ...STATION.Corridors].some((r) => p.x >= r.xMin - 1 && p.x <= r.xMax + 1 && p.y >= r.yMin - 1 && p.y <= r.yMax + 1);
  }

  private Teleport(why: string, at: Vector2, faceToward: Vector2 | null = null, world: Vector3 | null = null): void {
    const target = world ?? this.ToWorld(at);
    let yawDeg = this.yaw;
    if (faceToward) {
      const d = faceToward.sub(at);
      yawDeg = this.yaw + (Math.atan2(d.x, d.y) * 180) / Math.PI;
    }
    this.moves.push({ why, at: world ? this.ToMap(world) : at.clone() });
    this.Input.TeleportTo(target, yawDeg, true);
  }

  private Lock(locked: boolean): void {
    this.Input.SetAbility("Move", !locked);
  }

  // ---- who am I -----------------------------------------------------------------------------------------------

  get M(): PublicMatch {
    return this.match?.m ?? emptyMatch();
  }

  /** The local player's slot on the current roster, or -1. */
  MySlot(): number {
    return this.match.SlotOf(this.Networking.LocalPlayer.uid);
  }

  /** The sealed entry, if it belongs to this match. */
  Mine(): Secret | null {
    const s = this.dealer.mine;
    return s && s.n === this.M.r ? s : null;
  }

  MyRole(): number {
    const m = this.M;
    const slot = this.MySlot();
    if (slot >= 0 && m.ro.length) return m.ro[slot]!;
    return this.Mine()?.r ?? Role.Unassigned;
  }

  private Link(): PlayerLink | null {
    return this.PlayerBehaviour<PlayerLink>(this.Networking.LocalPlayer, "link");
  }

  get Joined(): boolean {
    return (this.Link()?.j ?? 0) > 0;
  }

  private Active(m: PublicMatch): boolean {
    return m.st === MatchState.Playing || m.st === MatchState.Muster;
  }

  // ---- input --------------------------------------------------------------------------------------------------

  /** A logical button went down (true) or up. `arg` is the vote target or the hatch index. */
  Press(button: number, down: boolean, arg = 0): void {
    const bit = 1 << button;
    if (button === Btn.Use && down && (this.held & bit) === 0) {
      this.useDownAt = this.Time.time;
      this.CountTap();
    }
    if (button === Btn.Use && !down) this.autoReleaseAt = 0;
    if (down) this.held |= bit;
    else this.held &= ~bit;
    const m = this.M;
    if (!this.Active(m) || this.MySlot() < 0) return;
    this.edges.push([button, down ? 1 : 0, this.match.Rel(), arg]);
    if (this.edges.length > 32) this.edges.splice(0, this.edges.length - 32);
  }

  override OnKeyPressed(key: string): void {
    switch (key) {
      case "E":
        this.Press(Btn.Use, true);
        break;
      case "Q":
        this.Press(Btn.Eliminate, true);
        this.Press(Btn.Eliminate, false);
        break;
      case "R":
        this.Press(Btn.Alarm, true);
        this.Press(Btn.Alarm, false);
        break;
      case "F":
        this.Press(Btn.Fault, true);
        this.Press(Btn.Fault, false);
        break;
      case "V":
        this.UseHatch();
        break;
      default:
        break;
    }
  }

  override OnKeyReleased(key: string): void {
    if (key === "E") this.Press(Btn.Use, false);
  }

  /** VR: right A uses, right B raises the alarm, left X eliminates, left Y works a hatch or a fault panel. */
  override OnButtonPressed(button: number, side: number): void {
    if (side === 1 && button === 2) this.Press(Btn.Use, true);
    else if (side === 1 && button === 3) this.Tap(Btn.Alarm);
    else if (side === 0 && button === 2) this.Tap(Btn.Eliminate);
    else if (side === 0 && button === 3) {
      const here = this.MyMapPosition();
      const hatch = here ? STATION.NearestHatch(here) : null;
      if (hatch && hatch.distance <= this.settings.hatchRange) this.UseHatch();
      else this.Tap(Btn.Fault);
    }
  }

  override OnButtonReleased(button: number, side: number): void {
    if (side === 1 && button === 2) this.Press(Btn.Use, false);
  }

  private Tap(button: number, arg = 0): void {
    this.Press(button, true, arg);
    this.Press(button, false, arg);
  }

  /**
   * The hatch: the local client knows its own role and the map, so it makes the trip itself and says so in the beat
   * (upstream TryUseVent moved the player on the host). The referee checks the trip.
   */
  UseHatch(): void {
    const m = this.M;
    const slot = this.MySlot();
    const here = this.MyMapPosition();
    if (m.st !== MatchState.Playing || slot < 0 || !here || m.al[slot] !== 1 || m.ci > 0) {
      this.Tap(Btn.Hatch, -1);
      return;
    }
    const near = STATION.NearestHatch(here);
    if (this.MyRole() !== Role.Saboteur || !near || near.distance > this.settings.hatchRange) {
      this.Tap(Btn.Hatch, -1);
      return;
    }
    const next = STATION.GetNextHatch(near.hatch);
    this.Tap(Btn.Hatch, near.hatch.Index);
    this.Teleport("hatch", STATION.ClampToWalkable(next.Position, 0.5));
  }

  // Panel and board buttons (bindings.json events).
  ClickUse(): void {
    this.useLatched = !this.useLatched;
    this.Press(Btn.Use, this.useLatched);
  }
  ClickEliminate(): void { this.Tap(Btn.Eliminate); }
  ClickAlarm(): void { this.Tap(Btn.Alarm); }
  ClickFault(): void { this.Tap(Btn.Fault); }
  ClickHatch(): void { this.UseHatch(); }
  ClickAbstain(): void { this.Vote(ABSTAIN); }
  ClickVote0(): void { this.Vote(1); }
  ClickVote1(): void { this.Vote(2); }
  ClickVote2(): void { this.Vote(3); }
  ClickVote3(): void { this.Vote(4); }
  ClickVote4(): void { this.Vote(5); }
  ClickVote5(): void { this.Vote(6); }
  ClickVote6(): void { this.Vote(7); }
  ClickVote7(): void { this.Vote(8); }
  ClickVote8(): void { this.Vote(9); }
  ClickVote9(): void { this.Vote(10); }

  /** The vote board's button for roster slot n-1 (player number n), or Abstain (-1). */
  Vote(playerNumber: number): void {
    if (this.M.st !== MatchState.Muster) return;
    this.Tap(Btn.Vote, playerNumber);
  }

  /** A click on a station object (StationButton): consoles, fault panels, the post, markers, the boarding pad. */
  ClickStation(kind: string, index: number): void {
    switch (kind) {
      case "job":
        this.ClickConsole(index);
        break;
      case "panel":
        this.ClickFaultPanel();
        break;
      case "post":
        // the post calls a muster with Use (upstream: E at the button)
        this.Tap(Btn.Use);
        break;
      case "body":
        // a body is reported with the alarm (upstream: R near it)
        this.Tap(Btn.Alarm);
        break;
      case "bot":
        this.Tap(Btn.Eliminate);
        break;
      case "board":
        this.Board();
        break;
      case "leave":
        this.Leave();
        break;
      case "credits":
        this.creditsOpen = !this.creditsOpen;
        this.creditsPanel?.SetActive(this.creditsOpen);
        break;
      default:
        break;
    }
  }

  /**
   * A console: Use as the job's kind needs it, so a click works a job the way the key does. Hold: down, and let go
   * once the hold is done; tap: one press; timing: the first click starts the sweep, the second lets go (inside the
   * band to finish it). The rules pick the nearest assigned job in range, as they do for the key.
   */
  ClickConsole(index: number): void {
    const station = STATION.JobStations[index];
    if (!station) return;
    const held = (this.held & (1 << Btn.Use)) !== 0;
    if (station.Kind === JobKind.Tap) {
      if (held) this.Press(Btn.Use, false);
      this.Tap(Btn.Use);
    } else if (station.Kind === JobKind.Timing) {
      this.Press(Btn.Use, !held);
    } else if (!held) {
      this.Press(Btn.Use, true);
      this.autoReleaseAt = this.Time.time + this.settings.holdSeconds + HOLD_MARGIN;
    } else {
      this.Press(Btn.Use, false);
    }
    this.useLatched = false;
  }

  /** A fault panel: the saboteur starts a fault there; a technician holds Use to reset it (2 s). */
  ClickFaultPanel(): void {
    if (this.MyRole() === Role.Saboteur) {
      this.Tap(Btn.Fault);
      return;
    }
    if ((this.held & (1 << Btn.Use)) !== 0) {
      this.Press(Btn.Use, false);
      return;
    }
    this.Press(Btn.Use, true);
    this.autoReleaseAt = this.Time.time + this.settings.resetSeconds + HOLD_MARGIN;
    this.useLatched = false;
  }

  ClickCredits(): void {
    this.ClickStation("credits", 0);
  }

  ClickLeave(): void {
    this.Leave();
  }

  /** The boarding pad outside the station: into the Commons, beside the hub board. */
  Board(): void {
    const n = STATION.SpawnPoints.length;
    const spot = STATION.GetSpawnPoint(Math.min(n - 1, Math.floor(this.Random.Range(0, n))), Vector2.zero);
    this.Teleport("board", spot, STATION.MeetingPoint);
  }

  /** "Leave the station" on the hub board: out to the boarding pad, unless the player is alive in a running match. */
  Leave(): void {
    const slot = this.MySlot();
    if (slot >= 0 && this.Active(this.M) && this.M.al[slot] === 1) return;
    this.Teleport("leave", ENTRY_POINT, new Vector2(ENTRY_POINT.x, ENTRY_POINT.y + 5));
  }

  ClickJoin(): void {
    const link = this.Link();
    if (!link) return;
    const m = this.M;
    const slot = this.MySlot();
    // A player on the roster of a running match stays in it (and stays a referee candidate) until it ends.
    if (link.j > 0 && slot >= 0 && this.Active(m)) return;
    const on = link.j === 0;
    link.SetJoined(on);
    this.Networking.SetRefereeCandidate(on);
    this.Refresh();
  }

  ClickStart(): void {
    if (this.M.st === MatchState.Lobby) this.match.RequestStart();
  }

  ClickAbort(): void {
    if (this.M.st !== MatchState.Lobby) this.match.RequestAbort();
  }

  // ---- every tick ---------------------------------------------------------------------------------------------

  override Update(): void {
    const m = this.M;
    const slot = this.MySlot();
    // Keep offering to referee while on the roster of a running match, whatever the join button says.
    if (slot >= 0 && this.Active(m) && this.Joined) this.Networking.SetRefereeCandidate(true);
    if (this.autoReleaseAt > 0 && this.Time.time >= this.autoReleaseAt) this.Press(Btn.Use, false);
    this.Effects(m, slot);
    this.WorkBar(m, slot);
    if (this.Time.frameCount % BEAT_TICKS === 0) {
      void this.SendBeat(m, slot);
      this.Refresh();
    }
    this.FollowHead();
  }

  /** The sealed beat, on the fixed schedule, from every rostered person for the whole match. */
  private async SendBeat(m: PublicMatch, slot: number): Promise<void> {
    if (!this.Active(m) || slot < 0 || m.sl[slot]!.b === 1 || this.sealing) return;
    const referee = this.Networking.Master;
    const link = this.Link();
    // Only to the referee that dealt this match: a new referee voids it, and must not be sent anyone's input meanwhile.
    if (!referee || referee.sid !== m.d || !link || !this.Secrets.canSealFor(referee.sid)) return;
    const rel = this.match.Rel();
    this.edges = this.edges.filter((e) => e[2] >= rel - EDGE_WINDOW);
    const here = this.MyMapPosition() ?? new Vector2(m.sp[slot]?.[0] ?? 0, m.sp[slot]?.[1] ?? 0);
    const text = encodeBeat({ m: m.r, q: ++this.seq, t: rel, p: [here.x, here.y], h: this.held, e: this.edges });
    this.sealing = true;
    try {
      const box = await this.Secrets.seal(referee.sid, text);
      link.SendBeat(box);
    } catch {
      /* the referee's key went away: the match is about to be void */
    } finally {
      this.sealing = false;
    }
  }

  /** The local player's body follows the match: start, muster ring and back, lounge, locks (PORT.md 5.8, 5.10). */
  private Effects(m: PublicMatch, slot: number): void {
    const a = this.applied;
    const inMatch = slot >= 0 && m.st !== MatchState.Lobby && m.sl[slot]?.b !== 1;
    const alive = inMatch && m.al[slot] === 1;
    // A new match, or a reload in the middle of one: go to the start point once.
    if (inMatch && m.st === MatchState.Playing && a.placedRound !== m.r) {
      a.placedRound = m.r;
      const placed = this.Storage.get<number>("placed", -1);
      if (placed !== m.r * 1000 + slot) {
        this.Storage.set("placed", m.r * 1000 + slot);
        if (alive) this.Teleport("start", new Vector2(m.sp[slot]![0]!, m.sp[slot]![1]!), STATION.MeetingPoint);
      }
      this.seq = 0;
      this.edges = [];
      this.Lock(false);
    }
    // Eliminated or locked out: to the lounge, out of sight and earshot (C8).
    if (inMatch && a.alive && !alive && a.round === m.r) {
      this.ToLounge(slot);
    }
    // A muster begins: the living go to the ring round the post and stand still (C7).
    if (m.st === MatchState.Muster && a.state !== MatchState.Muster && alive) {
      this.returnPoint = this.MyMapPosition();
      const index = Math.max(0, m.ring.indexOf(slot));
      const at = RingPosition(index, m.ring.length || 1);
      this.Teleport("ring", at, STATION.MeetingPoint);
      this.Lock(true);
    }
    // The muster is over and the match goes on: back to where they stood.
    if (a.state === MatchState.Muster && m.st === MatchState.Playing && m.r === a.round) {
      if (alive) {
        if (this.settings.returnAfterMuster && this.returnPoint) this.Teleport("return", this.returnPoint);
        this.Lock(false);
      }
      this.returnPoint = null;
    }
    // The shift clock ran out, or the match ended: everyone stands still for the cut-in and the result.
    if (inMatch && (m.ci > 0 || m.st === MatchState.Ended)) this.Lock(true);
    if (m.ci > 0 && this.lastCutIn !== m.r) {
      this.lastCutIn = m.r;
      this.Host.playClip("speaker", CLIP_ALARM);
    }
    // Back to the lobby (after the result, a void or an abort): everyone in the match or the lounge to the hub.
    if (m.st === MatchState.Lobby && a.state !== MatchState.Lobby) {
      this.Lock(false);
      const w = this.Input.Position;
      if (a.inMatch || (w && Vector3.Distance(w, this.lounge) < 20)) {
        const spot = STATION.GetSpawnPoint(Math.max(0, a.slot), Vector2.zero);
        this.Teleport("hub", spot, STATION.MeetingPoint);
      }
      this.returnPoint = null;
    }
    // Observers and the eliminated are kept out of the station while a match runs (PORT.md 5.8).
    if (m.st !== MatchState.Lobby && !alive) {
      const now = this.Time.time;
      if (now - this.lastObserverCheck >= 1) {
        this.lastObserverCheck = now;
        const w = this.Input.Position;
        if (w && this.InsideStation(w)) this.ToLounge(slot);
      }
    }
    a.round = m.r;
    a.state = m.st;
    a.alive = alive;
    a.inMatch = inMatch;
    if (slot >= 0) a.slot = slot;
  }

  private ToLounge(slot: number): void {
    const spot = this.lounge.add(new Vector3(((Math.max(0, slot) % 5) - 2) * 1.5, 0, slot >= 5 ? 1.5 : -1.5));
    this.Teleport("lounge", Vector2.zero, null, spot);
    this.Lock(false);
  }

  /** The personal panel floats below the head, and the blackout shell sits round it. Sent only when it moved. */
  private FollowHead(): void {
    const head = this.Input.Poses?.head ?? null;
    const w = head ? head.position : this.Input.Position;
    if (!w) return;
    if (this.lastHeadSent && Vector3.Distance(this.lastHeadSent, w) < 0.05) return;
    this.lastHeadSent = w.clone();
    const forward = head ? head.rotation.rotate(Vector3.forward) : Vector3.forward;
    const flat = new Vector3(forward.x, 0, forward.z).normalized;
    if (this.personalPanel) {
      const yaw = (Math.atan2(flat.x, flat.z) * 180) / Math.PI;
      this.personalPanel.transform.SetPositionAndRotation(w.add(flat.scale(0.55)).add(new Vector3(0, -0.35, 0)), Quaternion.Euler(25, yaw, 0));
    }
    if (this.shell) this.shell.transform.position = w.clone();
  }

  private OnSecret(secret: Secret): void {
    const before = this.lastSecret;
    this.lastSecret = secret;
    // A job handed out by a wave: the alert for 6 s and the tone (F32). Only the receiver knows.
    if (before && before.n === secret.n && secret.l >= 0 && secret.l !== before.l) {
      this.waveAlertUntil = this.Time.time + WAVE_ALERT_SECONDS;
      this.Host.playClip("speaker", CLIP_ALERT);
    }
  }

  // ---- what the boards show -----------------------------------------------------------------------------------

  /** Rewrites every text and marker from the public match and the local secret. Text is sent only when it changed. */
  Refresh(): void {
    if (!this.match) return;
    const m = this.M;
    const slot = this.MySlot();
    const rel = this.match.Rel();
    this.texts.hub = this.HubText(m, rel);
    this.texts.lounge = this.LoungeText(m, rel);
    this.texts.muster = this.MusterText(m, rel);
    this.texts.panel = this.PanelText(m, slot, rel);
    this.hubText.text = this.texts.hub;
    this.loungeText.text = this.texts.lounge;
    this.musterText.text = this.texts.muster;
    this.panelText.text = this.texts.panel;
    for (let i = 0; i < this.voteLabels.length; i++) {
      const s = m.sl[i];
      const canPick = m.st === MatchState.Muster && s && m.al[i] === 1 && m.gn[i] !== 1;
      this.voteLabels[i]!.text = canPick ? s.n : "";
    }
    this.Markers(m, slot);
  }

  /** The roster as everyone may see it. D4: a player shows as down only once that has been announced. */
  private RosterLine(m: PublicMatch, i: number): string {
    const s = m.sl[i]!;
    let state: string;
    if (m.st === MatchState.Ended) state = ROLE_NAMES[m.ro[i] ?? 0]!.toLowerCase();
    else if (m.gn[i] === 1) state = "left";
    else if (m.al[i] === 1 || m.sd[i] !== 1) state = m.st === MatchState.Muster ? (m.vo[i] === 1 ? "voted" : "voting") : "on shift";
    else state = m.bd[i] ? "down" : "locked out";
    return `${s.n}${s.b ? " (bot)" : ""}: ${state}`;
  }

  private ClockLine(m: PublicMatch, rel: number): string {
    if (m.ci > 0) return "SHIFT OVER";
    if (m.dl <= 0) return "";
    const left = m.dl - rel;
    return `${left <= CLOCK_WARNING_SECONDS ? "!! " : ""}Shift clock: ${seconds(left)}`;
  }

  private HubText(m: PublicMatch, rel: number): string {
    const lines: string[] = ["HIDDEN ROLE  -  station shift"];
    if (m.st === MatchState.Lobby) {
      const lobby = this.match.Lobby();
      const bots = Math.min(this.settings.bots, this.settings.maxPlayers - Math.min(lobby.length, this.settings.maxPlayers));
      lines.push(`Lobby: ${lobby.length} of ${this.settings.maxPlayers}${bots ? ` + ${bots} bot(s)` : ""} (need ${this.settings.minPlayers})`);
      lobby.slice(0, this.settings.maxPlayers).forEach((p, i) => lines.push(`${i + 1}. ${p.displayName}`));
      if (lobby.length > this.settings.maxPlayers) lines.push(`waiting: ${lobby.length - this.settings.maxPlayers}`);
      if (!this.Networking.Master) lines.push("Press Join to play.");
      if (m.nt === "void-referee") lines.push("The last match was void: its referee left.");
      if (m.nt === "aborted") lines.push("The last match was stopped.");
      if (m.last) {
        lines.push(`Last match: ${TEAM_NAMES[m.last.w]} won.`);
        lines.push(m.last.n.map((n, i) => `${n} (${ROLE_NAMES[m.last!.ro[i] ?? 0]})`).join(", "));
      }
      return lines.join("\n");
    }
    if (m.st === MatchState.Ended) {
      lines.push(`${TEAM_NAMES[m.w]} win.`);
    } else {
      lines.push(this.ClockLine(m, rel));
      lines.push(`Jobs done: ${m.cd} / ${m.ct}`);
      if (m.fk) lines.push(`FAULT: ${FAULT_NAMES[m.fk]}${m.fe > 0 ? ` ${seconds(m.fe - rel)}` : ""}`);
    }
    for (let i = 0; i < m.sl.length; i++) lines.push(this.RosterLine(m, i));
    return lines.filter((l) => l !== "").join("\n");
  }

  private LoungeText(m: PublicMatch, rel: number): string {
    if (m.st === MatchState.Lobby) return "Observer lounge\nNo match is running.";
    const lines = ["Observer lounge", "You are out of the match: watch from here.", this.ClockLine(m, rel), `Jobs done: ${m.cd} / ${m.ct}`];
    if (m.st === MatchState.Muster) lines.push(`Muster: ${seconds(m.me - rel)} left`);
    if (m.st === MatchState.Ended) lines.push(`${TEAM_NAMES[m.w]} win.`);
    for (let i = 0; i < m.sl.length; i++) lines.push(this.RosterLine(m, i));
    return lines.filter((l) => l !== "").join("\n");
  }

  private MusterText(m: PublicMatch, rel: number): string {
    const an = m.an;
    if (an[0] === Announcement.MusterResult && an[3]! > rel) {
      const who = an[1]! >= 0 ? m.sl[an[1]!]?.n : null;
      return who ? `${who} was locked out.\nThey were a ${ROLE_NAMES[an[2]!]!.toLowerCase()}.` : "Nobody was locked out.";
    }
    if (m.st !== MatchState.Muster) return "Muster board";
    const caller = m.sl[m.mr]?.n ?? "Someone";
    const head = m.mb >= 0 ? `ALARM: ${caller} found ${m.sl[m.mb]?.n ?? "someone"} down.` : `MUSTER called by ${caller}.`;
    const lines = [head, `Vote: ${seconds(m.me - rel)} left`];
    for (let i = 0; i < m.sl.length; i++) {
      if (m.al[i] !== 1 || m.gn[i] === 1) continue;
      lines.push(`${m.sl[i]!.n}: ${m.vo[i] === 1 ? "voted" : "..."}`);
    }
    return lines.join("\n");
  }

  private PanelText(m: PublicMatch, slot: number, rel: number): string {
    if (m.st === MatchState.Lobby) {
      return this.Joined ? "You are in the lobby.\nStart when enough have joined." : "Not in the lobby.\nPress Join on the hub board.";
    }
    if (slot < 0) return "Observing this match.\nJoin the lobby for the next one.";
    const role = this.MyRole();
    const mine = this.Mine();
    const lines: string[] = [];
    if (m.st === MatchState.Ended) {
      lines.push(`${TEAM_NAMES[m.w]} win.`, `You were a ${ROLE_NAMES[role]!.toLowerCase()}.`);
      return lines.join("\n");
    }
    lines.push(role === Role.Unassigned ? "Waiting for your role..." : `You are a ${ROLE_NAMES[role]!.toUpperCase()}`);
    if (role === Role.Saboteur && mine && mine.f.length) lines.push(`With: ${mine.f.map((s) => m.sl[s]?.n ?? "?").join(", ")}`);
    lines.push(this.ClockLine(m, rel));
    if (m.al[slot] !== 1) {
      lines.push("You are out. Watch from the lounge.");
      return lines.filter((l) => l !== "").join("\n");
    }
    if (this.waveAlertUntil > this.Time.time) lines.push("NEW JOB ASSIGNED");
    if (m.fk) lines.push(`FAULT: ${FAULT_NAMES[m.fk]}${m.fe > 0 ? ` ${seconds(m.fe - rel)}` : ""}${role === Role.Technician ? " - reset it at its panel" : ""}`);
    const here = this.MyMapPosition();
    if (mine && here) {
      const open = STATION.JobStations.filter((s) => (mine.a & (1 << s.Id)) !== 0 && (mine.c & (1 << s.Id)) === 0)
        .map((s) => ({ s, d: Dist(here, s.Position) }))
        .sort((a, b) => a.d - b.d);
      lines.push(role === Role.Saboteur ? `Cover jobs (${open.length} left):` : `Jobs (${open.length} left):`);
      for (const { s, d } of open.slice(0, 7)) lines.push(`${compass(here, s.Position)} ${s.Name} (${JOB_KIND_NAMES[s.Kind]}) - ${s.Room ? STATION.Rooms.find((r) => r.Id === s.Room)?.Name : ""} ${d.toFixed(0)} m`);
      if (open.length > 7) lines.push(`+${open.length - 7} more`);
      const near = open[0];
      if (near && near.d <= this.settings.jobRange + 0.15 && m.fk !== Fault.Jam) lines.push(this.JobHint(near.s.Kind));
      if (role === Role.Saboteur) {
        const k = mine.k - rel;
        lines.push(k > 0 ? `Eliminate: ${seconds(k)}` : "Eliminate: ready (Q)");
        const s = mine.s - rel;
        lines.push(m.fk ? "Fault: one is running" : s > 0 ? `Fault: ${seconds(s)}` : "Fault: ready (F at a panel)");
        const hatch = STATION.NearestHatch(here);
        if (hatch) lines.push(`Hatch: ${hatch.distance.toFixed(1)} m${hatch.distance <= this.settings.hatchRange ? " (V)" : ""}`);
      }
      const post = Dist(here, STATION.MeetingPoint);
      if (post <= this.settings.musterRange + 0.3) lines.push(m.er > rel ? `Muster post: ${seconds(m.er - rel)}` : m.fk ? "Muster post: blocked by the fault" : "Muster post: ready (E)");
      lines.push(`In: ${STATION.GetRoomName(here)}`);
    }
    return lines.filter((l) => l !== "").join("\n");
  }

  private JobHint(kind: number): string {
    const held = (this.held & (1 << Btn.Use)) !== 0;
    if (kind === JobKind.Hold) return held ? "Holding..." : "Hold E for the job";
    if (kind === JobKind.Tap) return `Tap E ${this.settings.tapCount} times`;
    return `Release E inside the band (${Math.round(this.settings.timingBand[0] * 100)}-${Math.round(this.settings.timingBand[1] * 100)}%)`;
  }

  /** Bodies and bots for everyone; consoles and the blackout shell for the local player only. */
  private Markers(m: PublicMatch, slot: number): void {
    // The jobs-done bar (upstream's crew task bar): everyone sees it while a match runs.
    const done = this.Active(m) || m.st === MatchState.Ended ? (m.ct > 0 ? Math.min(1, m.cd / m.ct) : 0) : 0;
    for (const bar of this.jobBars) this.SetFill(bar, done);
    // The muster board turns to face whoever looks at it (it is this page's own copy).
    if (this.musterBoard && m.st === MatchState.Muster) {
      const w = this.Input.Position;
      if (w) {
        const at = this.ToWorld(STATION.MeetingPoint);
        const yaw = (Math.atan2(at.x - w.x, at.z - w.z) * 180) / Math.PI;
        const want = Math.round(yaw / 5) * 5;
        if (Math.abs(this.musterBoard.transform.eulerAngles.y - want) > 0.5) this.musterBoard.transform.rotation = Quaternion.Euler(0, want, 0);
      }
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const b = m.st !== MatchState.Lobby ? m.bd[i] : 0;
      const body = this.bodies[i]!;
      if (b) body.transform.position = this.ToWorld(new Vector2(b[0]!, b[1]!), 0.05);
      if (body.activeSelf !== !!b) body.SetActive(!!b);
    }
    const botSlots = m.sl.map((s, i) => (s.b ? i : -1)).filter((i) => i >= 0);
    for (let i = 0; i < this.botMarkers.length; i++) {
      const at = botSlots[i] !== undefined && m.st !== MatchState.Lobby ? m.bp[botSlots[i]!] : 0;
      const bot = this.botMarkers[i]!;
      if (at) bot.transform.position = this.ToWorld(new Vector2(at[0]!, at[1]!));
      if (bot.activeSelf !== !!at) bot.SetActive(!!at);
    }
    const mine = this.Mine();
    const role = this.MyRole();
    const here = this.MyMapPosition();
    const alive = slot >= 0 && m.al[slot] === 1 && this.Active(m);
    let nearest = -1;
    if (mine && here && alive) {
      let best = Infinity;
      for (const s of STATION.JobStations) {
        if ((mine.a & (1 << s.Id)) === 0 || (mine.c & (1 << s.Id)) !== 0) continue;
        const d = Dist(here, s.Position);
        if (d < best) {
          best = d;
          nearest = s.Id;
        }
      }
    }
    for (let i = 0; i < this.consoles.length; i++) {
      const own = !!mine && alive && (mine.a & (1 << i)) !== 0 && (mine.c & (1 << i)) === 0;
      const inRange = own && here && Dist(here, STATION.JobStations[i]!.Position) <= this.settings.jobRange;
      const color = !own ? DIM : inRange ? GOLD : role === Role.Saboteur ? PLUM : i === nearest ? AMBER : TEAL;
      this.Host.setColor(this.consoles[i]!.key, "_BaseColor", color);
    }
    // C18: the blackout shell on living technicians only; `vision-range` (off by default) for everyone alive.
    const blackout = alive && m.fk === Fault.Blackout && role === Role.Technician;
    const radius = blackout ? this.settings.blackoutVision : alive && this.settings.visionRange > 0 ? this.settings.visionRange : 0;
    if (this.shell) {
      if (radius > 0) this.shell.transform.localScale = new Vector3(radius * 2, radius * 2, radius * 2);
      if (this.shell.activeSelf !== radius > 0) this.shell.SetActive(radius > 0);
    }
  }

  /** A bar's fill, scaled along x from its left end (0 hides it). */
  private SetFill(fill: GameObject, amount: number): void {
    const x = Math.round(Math.max(0, Math.min(1, amount)) * 100) / 100;
    if (Math.abs(fill.transform.localScale.x - Math.max(x, 0.001)) > 0.004) fill.transform.localScale = new Vector3(Math.max(x, 0.001), 1, 1);
    if (fill.activeSelf !== x > 0) fill.SetActive(x > 0);
  }

  private CountTap(): void {
    const here = this.MyMapPosition();
    const near = here ? this.NearestOpenJob(here) : null;
    const id = near && near.d <= this.settings.jobRange + this.settings.rangeSlack ? near.s.Id : -1;
    if (id !== this.tapStation) {
      this.tapStation = id;
      this.taps = 0;
    }
    if (id >= 0) this.taps++;
  }

  private NearestOpenJob(here: Vector2): { s: JobStation; d: number } | null {
    const mine = this.Mine();
    if (!mine) return null;
    let best: { s: JobStation; d: number } | null = null;
    for (const s of STATION.JobStations) {
      if ((mine.a & (1 << s.Id)) === 0 || (mine.c & (1 << s.Id)) !== 0) continue;
      const d = Dist(here, s.Position);
      if (!best || d < best.d) best = { s, d };
    }
    return best;
  }

  /**
   * The work bar on the personal panel: how far the job in hand has got, worked out here from this player's own
   * input (the referee's count is not published). Hold: time held over the hold time; tap: presses at this console
   * over the count; timing: the sweep, with the band drawn; a reset at a fault panel: time held over 2 s.
   */
  private WorkBar(m: PublicMatch, slot: number): void {
    let amount = 0;
    let band = false;
    const here = this.MyMapPosition();
    const alive = slot >= 0 && m.st === MatchState.Playing && m.al[slot] === 1;
    const held = (this.held & (1 << Btn.Use)) !== 0;
    const now = this.Time.time;
    if (alive && here) {
      const reach = this.settings.rangeSlack;
      const panel = m.fk ? STATION.PanelFor(m.fk) : null;
      if (panel && this.MyRole() === Role.Technician && Dist(here, panel.Position) <= this.settings.faultRange + reach) {
        amount = held ? (now - this.useDownAt) / this.settings.resetSeconds : 0;
      } else if (m.fk !== Fault.Jam) {
        const near = this.NearestOpenJob(here);
        if (near && near.d <= this.settings.jobRange + reach) {
          if (near.s.Kind === JobKind.Hold) amount = held ? (now - this.useDownAt) / this.settings.holdSeconds : 0;
          else if (near.s.Kind === JobKind.Tap) amount = this.tapStation === near.s.Id ? this.taps / this.settings.tapCount : 0;
          else {
            band = true;
            const cycle = Math.max(0.5, this.settings.timingCycleSeconds);
            amount = held ? ((now - this.useDownAt) % cycle) / cycle : 0;
          }
        }
      }
    }
    const shown = Math.round(Math.min(1, amount) * 50) / 50;
    if (shown !== this.lastWork) {
      this.lastWork = shown;
      if (this.workBar) this.SetFill(this.workBar, shown);
    }
    if (this.workBand && this.workBand.activeSelf !== band) this.workBand.SetActive(band);
  }

  /** The work bar's fill as last sent (tests). */
  get WorkAmount(): number {
    return Math.max(0, this.lastWork);
  }

  /** True while the blackout shell is up on this client (tests). */
  get BlackoutOn(): boolean {
    return !!this.shell && this.shell.activeSelf;
  }

  static TeamWord(team: number): string {
    return team === Team.Saboteurs ? "saboteurs" : "technicians";
  }
}
