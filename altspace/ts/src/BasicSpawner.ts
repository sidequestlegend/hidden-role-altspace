// Translated from the upstream Assets/Scripts/Network/BasicSpawner.cs: the match rules the host ran
// (Spawner:184-230, 854-1702, 1923-2308, 2712-2770). Here they are the referee's, in `MatchRules`, a plain class with
// no networking: Match.ts feeds it the players' input and copies its public results to the room.
//
// `time` stands for Time.time: the caller sets it (synced seconds) before each call, so every rule reads the moment
// the input happened, not the moment it arrived. Session code, the debug panel, prefab spawning and marker visuals
// (Spawner:232-852, 313-696, 2309-2619) are not ported; the bots are in Bots.ts.
//
// Deliberate differences from upstream, each named in PORT.md "Deliberate differences":
//   D1  an eliminated technician's unfinished jobs leave the total, so one early elimination no longer makes the job
//       win impossible (upstream counted them forever, F29/F30); the total everyone is shown keeps them until the
//       elimination has been seen (D4), so the jobs bar does not give a kill away;
//   D2  the fourth fault (upstream's fourth sabotage type) has a countdown like the first, instead of no effect (F60);
//   D6  the muster post and the alarm need a match in play: upstream's round flag stayed set after the end (C12);
//   D5  nobody is forced into the hidden role (upstream made the host the hidden role by default, F7);
//   D12 a person's ranges get `rangeSlack` added (positions are the referee's own, moved no faster than a run: Match.ts).

import { Vector2 } from "../portkit/src/index.ts";
import { BotBrains } from "./Bots.ts";
import { ABSTAIN, Announcement, Fault, Interaction, JobKind, MatchState, Role, type Settings, Team } from "./GameTypes.ts";
import { CountTasks, Participant } from "./Player.ts";
import type { JobStation } from "./ShipMapData.ts";
import { f } from "./ShipMapData.ts";
import { Dist, type Rng, type ShipMap } from "./ShipMap.ts";

const CALIBRATION_START = f(0.7);

/** ChannelState: an interaction in progress. */
export interface ChannelState {
  kind: Interaction;
  targetId: number;
  progress: number;
  wasHeld: boolean;
}

/** What happened, for the referee's own use (tests, the board's last line). Never sent anywhere. */
export interface RulesEvent {
  t: number;
  kind:
    | "start"
    | "eliminate"
    | "alarm"
    | "muster"
    | "vote"
    | "result"
    | "job"
    | "wave"
    | "fault"
    | "reset"
    | "hatch"
    | "cutin"
    | "end"
    | "left";
  actor?: number;
  target?: number;
  detail?: string;
}

/** Changes from upstream that tests can switch back, to show each one is the only difference. */
export interface Quirks {
  /** Upstream F29: every technician's jobs count, alive or not (D1 off). */
  deadJobsCount: boolean;
}

export interface RosterEntry {
  uid: string;
  name: string;
  isBot: boolean;
}

/** GetEjectedPlayerNumber: a single highest choice wins; a tie, abstain highest, or no ballots removes nobody. */
export function GetEjectedPlayerNumber(votes: ReadonlyMap<number, number>): number {
  if (votes.size === 0) return ABSTAIN;
  const counts = new Map<number, number>();
  for (const target of votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
  let topTargetNumber = ABSTAIN;
  let topVotes = 0;
  let tied = false;
  for (const [target, count] of counts) {
    if (count > topVotes) {
      topTargetNumber = target;
      topVotes = count;
      tied = false;
    } else if (count === topVotes) {
      tied = true;
    }
  }
  return tied ? ABSTAIN : topTargetNumber;
}

/** Shuffle: Fisher-Yates from the end, as upstream. */
export function Shuffle<T>(items: T[], random: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const swapIndex = random.RangeInt(0, i + 1);
    const t = items[i]!;
    items[i] = items[swapIndex]!;
    items[swapIndex] = t;
  }
}

/** CreateTaskAssignmentMask: `count` distinct stations of the first min(stations, 30), by partial Fisher-Yates. */
export function CreateTaskAssignmentMask(random: Rng, count: number, stations: number): number {
  const available = Math.min(stations, 30);
  const assigned = Math.max(0, Math.min(count, available));
  const ids: number[] = [];
  for (let id = 0; id < available; id++) ids.push(id);
  for (let i = 0; i < assigned; i++) {
    const selected = random.RangeInt(i, ids.length);
    const t = ids[i]!;
    ids[i] = ids[selected]!;
    ids[selected] = t;
  }
  let mask = 0;
  for (let i = 0; i < assigned; i++) mask |= 1 << ids[i]!;
  return mask;
}

/** How many hidden roles a roster of `count` gets: the setting, at least 1, always fewer than the others. */
export function SaboteurCount(setting: number, count: number): number {
  const most = Math.max(1, Math.ceil(count / 2) - 1);
  return Math.max(1, Math.min(setting, most, count));
}

export class MatchRules {
  readonly s: Settings;
  readonly map: ShipMap;
  readonly random: Rng;
  readonly quirks: Quirks;
  readonly bots: BotBrains;
  /** Time.time: synced seconds, set by the caller. */
  time = 0;
  players: Participant[] = [];
  roundStarted = false;
  ended = false;
  startedAt = 0;
  endedAt = 0;
  meetingActive = false;
  meetingEndsAt = 0;
  meetingReporterNumber = 0;
  meetingBodyNumber = 0;
  activeFault: Fault = Fault.None;
  activeFaultEndsAt = 0;
  nextFaultAllowedAt = 0;
  nextEmergencyAllowedAt = 0;
  nextTimedTaskAt = Infinity;
  timedTaskWavesIssued = 0;
  taskDeadlineEndsAt = 0;
  taskFailurePending = false;
  taskFailureCutInEndsAt = 0;
  readonly votes = new Map<number, number>();
  readonly channels = new Map<number, ChannelState>();
  announcement: { kind: Announcement; playerNumber: number; role: Role; endsAt: number } = { kind: Announcement.None, playerNumber: 0, role: Role.Unassigned, endsAt: 0 };
  winner: Team = Team.None;
  /** Slots whose elimination everyone has been told of (D4: the roster shows a death only from then on). */
  readonly seenDown = new Set<number>();
  /** Bumped when a job wave hands out jobs (the alert tone). */
  waveSerial = 0;
  status = "";
  readonly events: RulesEvent[] = [];
  /** Test aid only (upstream's "host is the hidden role" switch, F7): these user ids are dealt the hidden role. */
  forcedSaboteurs: string[] | null = null;
  /** Told of every event (Match.ts keeps them for tests). */
  private readonly log: (event: RulesEvent) => void;

  constructor(settings: Settings, map: ShipMap, random: Rng, quirks: Partial<Quirks> = {}, log: (event: RulesEvent) => void = () => {}) {
    this.s = settings;
    this.map = map;
    this.random = random;
    this.quirks = { deadJobsCount: false, ...quirks };
    this.log = log;
    this.bots = new BotBrains(this);
  }

  private note(event: Omit<RulesEvent, "t">): void {
    const e = { t: this.time, ...event };
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    this.log(e);
  }

  /** GetSpawnedPlayers: everyone on the roster who has not left. */
  Spawned(): Participant[] {
    return this.players.filter((p) => !p.gone);
  }

  FindPlayerByNumber(number: number): Participant | null {
    return this.Spawned().find((p) => p.PlayerNumber === number) ?? null;
  }

  private slack(p: Participant): number {
    return p.isBot ? 0 : this.s.rangeSlack;
  }

  // ---- round flow ---------------------------------------------------------------------------------------------

  /** StartRound. `roster` is in slot order; every entry plays. */
  StartRound(roster: RosterEntry[]): void {
    this.players = roster.map((e, slot) => new Participant(slot, e.uid, e.name, e.isBot, this.map.GetSpawnPoint(slot, Vector2.zero), this.s.eliminateCooldown));
    const players = this.players.slice();
    if (players.length === 0) return;
    this.roundStarted = true;
    this.ended = false;
    this.startedAt = this.time;
    this.endedAt = 0;
    this.meetingActive = false;
    this.meetingReporterNumber = 0;
    this.meetingBodyNumber = 0;
    this.activeFault = Fault.None;
    this.activeFaultEndsAt = 0;
    this.nextFaultAllowedAt = this.time + this.s.firstFaultSeconds;
    this.nextEmergencyAllowedAt = this.time;
    this.nextTimedTaskAt = this.time + Math.max(1, this.s.firstWaveSeconds);
    this.timedTaskWavesIssued = 0;
    this.taskDeadlineEndsAt = this.time + Math.max(30, this.s.shiftSeconds);
    this.taskFailurePending = false;
    this.taskFailureCutInEndsAt = 0;
    this.announcement = { kind: Announcement.None, playerNumber: 0, role: Role.Unassigned, endsAt: 0 };
    this.winner = Team.None;
    this.seenDown.clear();
    this.bots.Clear();
    this.channels.clear();
    this.votes.clear();

    Shuffle(players, this.random);
    if (this.forcedSaboteurs) {
      // The test aid: the named players go to the front (upstream's host-first switch, Spawner:2244-2259, generalised). Nothing else moves.
      const forced = players.filter((p) => this.forcedSaboteurs!.includes(p.uid));
      const rest = players.filter((p) => !this.forcedSaboteurs!.includes(p.uid));
      players.splice(0, players.length, ...forced, ...rest);
    }
    const saboteurs = this.forcedSaboteurs ? Math.max(1, this.forcedSaboteurs.filter((u) => players.some((p) => p.uid === u)).length) : SaboteurCount(this.s.saboteurs, players.length);
    const spawns = this.CreateRoundSpawnPositions(players.length);
    for (let i = 0; i < players.length; i++) {
      const role = i < saboteurs ? Role.Saboteur : Role.Technician;
      const mask = CreateTaskAssignmentMask(this.random, this.s.jobsPerPlayer, this.map.JobStations.length);
      players[i]!.BeginRound(role, spawns[i]!, mask);
      players[i]!.lastKillTime = this.time - this.s.eliminateCooldown;
      if (players[i]!.isBot) this.bots.Seed(players[i]!);
    }
    this.status = `Shift started: ${players.length - saboteurs} technician(s), ${saboteurs} saboteur(s)`;
    this.note({ kind: "start", detail: `${players.length}/${saboteurs}` });
  }

  /** CreateRoundSpawnPositions */
  CreateRoundSpawnPositions(count: number): Vector2[] {
    const assigned: Vector2[] = [];
    for (let i = 0; i < count; i++) assigned.push(this.GetSeparatedRandomWalkablePosition(assigned));
    return assigned;
  }

  /** GetSeparatedRandomWalkablePosition: at least 1.15 from those already placed, 64 tries. */
  GetSeparatedRandomWalkablePosition(existing: readonly Vector2[]): Vector2 {
    const minimumDistance = f(1.15);
    for (let attempt = 0; attempt < 64; attempt++) {
      const candidate = this.map.GetRandomWalkablePosition(this.random);
      if (existing.every((e) => !(Dist(candidate, e) < minimumDistance))) return candidate;
    }
    return this.map.GetRandomWalkablePosition(this.random);
  }

  /** Update(): timers, waves and (in the Match behaviour's tick) the bots. */
  UpdateTimers(): void {
    if (!this.roundStarted) return;
    if (this.taskFailurePending) {
      if (this.time >= this.taskFailureCutInEndsAt) this.EndRound(Team.Saboteurs);
      return;
    }
    if (this.taskDeadlineEndsAt > 0 && this.time >= this.taskDeadlineEndsAt) {
      this.BeginTaskFailureCutIn();
      return;
    }
    if (this.meetingActive) {
      if (this.time >= this.meetingEndsAt) this.ResolveMeeting();
      return;
    }
    if (this.activeFault !== Fault.None && this.activeFaultEndsAt > 0 && this.time >= this.activeFaultEndsAt) {
      this.status = "The fault ran out.";
      this.EndRound(Team.Saboteurs);
      return;
    }
    this.UpdateTimedTaskAssignments();
  }

  /** The bots' part of Update(), with the same early returns. `dt` is Time.deltaTime. */
  UpdateBots(dt: number): void {
    if (!this.roundStarted || this.taskFailurePending) return;
    if (this.taskDeadlineEndsAt > 0 && this.time >= this.taskDeadlineEndsAt) return;
    if (this.meetingActive) {
      this.bots.UpdateBotVoting();
      return;
    }
    if (this.activeFault !== Fault.None && this.activeFaultEndsAt > 0 && this.time >= this.activeFaultEndsAt) return;
    this.bots.UpdateBots(dt);
  }

  UpdateTimedTaskAssignments(): void {
    if (this.timedTaskWavesIssued >= this.s.jobWaves || this.time < this.nextTimedTaskAt) return;
    let assigned = 0;
    for (const p of this.Spawned()) {
      if (p.role === Role.Technician && !p.isAlive && !this.seenDown.has(p.slot)) p.unseenWaveJobs++;
      if (p.state !== MatchState.Playing || !p.isAlive || p.role !== Role.Technician) continue;
      if (this.TryAssignRandomTask(p)) assigned++;
    }
    this.timedTaskWavesIssued++;
    this.nextTimedTaskAt = this.timedTaskWavesIssued >= this.s.jobWaves ? Infinity : this.time + Math.max(1, this.s.waveIntervalSeconds);
    if (assigned > 0) {
      this.waveSerial++;
      this.status = `New jobs: ${assigned} technician(s) received one`;
    }
    this.note({ kind: "wave", detail: String(assigned) });
  }

  TryAssignRandomTask(p: Participant): boolean {
    const available = this.map.JobStations.filter((s) => s.Id < 30 && !p.HasAssignedTask(s.Id));
    if (available.length === 0) return false;
    const job = available[this.random.RangeInt(0, available.length)]!;
    return p.AssignTask(job.Id);
  }

  BeginTaskFailureCutIn(): void {
    if (this.taskFailurePending) return;
    this.taskFailurePending = true;
    this.taskFailureCutInEndsAt = this.time + Math.max(1, this.s.shiftFailSeconds);
    this.meetingActive = false;
    this.channels.clear();
    this.votes.clear();
    this.ClearActiveSabotage();
    for (const p of this.Spawned()) p.SetTaskFailureCutIn();
    this.status = "The shift clock ran out.";
    this.note({ kind: "cutin" });
  }

  EndRound(team: Team): void {
    this.meetingActive = false;
    this.nextTimedTaskAt = Infinity;
    this.taskDeadlineEndsAt = 0;
    this.taskFailurePending = false;
    this.ClearActiveSabotage();
    this.channels.clear();
    this.votes.clear();
    // D6: the round is over; nothing can bring it back (upstream left _roundStarted set).
    this.roundStarted = false;
    this.ended = true;
    this.endedAt = this.time;
    this.winner = team;
    for (const p of this.Spawned()) p.EndRound(team);
    this.announcement = { kind: Announcement.MatchResult, playerNumber: 0, role: Role.Unassigned, endsAt: this.time + this.s.announceSeconds };
    this.status = `${team === Team.Technicians ? "Technicians" : "Saboteurs"} win.`;
    this.note({ kind: "end", detail: String(team) });
  }

  // ---- win check ----------------------------------------------------------------------------------------------

  CheckWinCondition(): boolean {
    if (this.taskFailurePending) return false;
    const players = this.Spawned();
    if (players.length < 2) return false;
    let aliveTech = 0;
    let aliveSab = 0;
    for (const p of players) {
      if (!p.isAlive) continue;
      if (p.role === Role.Technician) aliveTech++;
      else if (p.role === Role.Saboteur) aliveSab++;
    }
    if (aliveSab === 0) {
      this.EndRound(Team.Technicians);
      return true;
    } else if (aliveSab >= aliveTech) {
      this.EndRound(Team.Saboteurs);
      return true;
    }
    if (this.taskDeadlineEndsAt > 0 && this.time >= this.taskDeadlineEndsAt) {
      this.BeginTaskFailureCutIn();
      return true;
    }
    if (this.AreCrewTasksComplete()) {
      this.EndRound(Team.Technicians);
      return true;
    }
    return false;
  }

  AreCrewTasksComplete(): boolean {
    if (this.timedTaskWavesIssued < this.s.jobWaves) return false;
    const { completed, total } = this.GetCrewTaskProgress();
    return total > 0 && completed >= total;
  }

  /** GetCrewTaskProgress over the technicians present. D1: an eliminated technician counts only what they finished. */
  GetCrewTaskProgress(): { completed: number; total: number } {
    let completed = 0;
    let total = 0;
    for (const p of this.Spawned()) {
      if (p.role !== Role.Technician) continue;
      completed += p.CompletedTaskCount;
      total += p.isAlive || this.quirks.deadJobsCount ? p.assignedTaskCount : p.CompletedTaskCount;
    }
    return { completed, total };
  }

  /**
   * The jobs done and total that everyone is shown (the boards' bars). D4: a technician who is down but not yet seen
   * to be (no muster since, body not reported) still counts as alive, with the wave jobs they would have been given;
   * once seen, this is GetCrewTaskProgress. The win check never uses this.
   */
  GetPublicTaskProgress(): { completed: number; total: number } {
    let completed = 0;
    let total = 0;
    for (const p of this.Spawned()) {
      if (p.role !== Role.Technician) continue;
      completed += p.CompletedTaskCount;
      if (p.isAlive) total += p.assignedTaskCount;
      else if (!this.seenDown.has(p.slot)) total += p.assignedTaskCount + p.unseenWaveJobs;
      else total += this.quirks.deadJobsCount ? p.assignedTaskCount : p.CompletedTaskCount;
    }
    return { completed, total };
  }

  // ---- actions ------------------------------------------------------------------------------------------------

  /** Player.TryUseKill + TryKill + FindKillTarget. */
  TryUseKill(killer: Participant): boolean {
    if (killer.state !== MatchState.Playing || !killer.isAlive || !killer.IsSaboteur || !killer.IsKillReady(this.time)) return false;
    // F41: no elimination in a muster or once the shift clock has run out (upstream skipped every button then).
    if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return false;
    const target = this.FindKillTarget(killer);
    if (!target) {
      this.status = "Nobody in reach";
      return false;
    }
    target.Kill();
    this.CancelHeldInteract(target);
    killer.MarkKillUsed(this.time);
    this.status = `${killer.DisplayName} eliminated ${target.DisplayName}`;
    this.note({ kind: "eliminate", actor: killer.slot, target: target.slot });
    this.CheckWinCondition();
    return true;
  }

  FindKillTarget(killer: Participant): Participant | null {
    let closest: Participant | null = null;
    let closestDistance = f(this.s.eliminateRange + this.slack(killer));
    for (const p of this.Spawned()) {
      if (p === killer || !p.isAlive || p.role !== Role.Technician) continue;
      const d = Dist(killer.position, p.position);
      if (d <= closestDistance && this.map.HasClearWalkableSegment(killer.position, p.position, 0.18)) {
        closest = p;
        closestDistance = d;
      }
    }
    return closest;
  }

  /** Player.TryUseReport + TryReport. */
  TryUseReport(reporter: Participant): boolean {
    if (reporter.state !== MatchState.Playing || !reporter.isAlive) return false;
    if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return false;
    const body = this.FindReportableBody(reporter);
    if (!body) {
      this.status = "No one down in reach";
      return false;
    }
    this.note({ kind: "alarm", actor: reporter.slot, target: body.slot });
    this.StartMeeting(reporter, body);
    return true;
  }

  FindReportableBody(reporter: Participant): Participant | null {
    let closest: Participant | null = null;
    let closestDistance = f(this.s.reportRange + this.slack(reporter));
    for (const p of this.players) {
      if (p === reporter || !p.isReportableBody || !p.bodyPosition) continue;
      const d = Dist(reporter.position, p.bodyPosition);
      if (d <= closestDistance && this.map.HasClearWalkableSegment(reporter.position, p.bodyPosition, 0.18)) {
        closest = p;
        closestDistance = d;
      }
    }
    return closest;
  }

  /** TryInteract: the press of Use. Only the muster post acts on the press; the rest is the held channel. */
  TryInteract(player: Participant): boolean {
    if (!this.roundStarted || this.meetingActive || this.taskFailurePending || !player.isAlive) return false;
    if (this.activeFault !== Fault.None && player.role === Role.Technician) {
      const panel = this.map.PanelFor(this.activeFault);
      if (panel && Dist(player.position, panel.Position) <= this.s.faultRange + this.slack(player)) {
        this.status = `Hold Use to reset: ${panel.Name}`;
        return true;
      }
    }
    if (this.activeFault === Fault.None && this.TryCallEmergencyMeeting(player)) return true;
    if (player.CanDoTasks) {
      if (this.activeFault === Fault.Jam) {
        this.status = "Jobs are blocked while the sonar is jammed";
        return false;
      }
      const near = this.TryGetNearestIncompleteTask(player);
      if (near && near.distance <= this.s.jobRange + this.slack(player)) return true;
    }
    return false;
  }

  TryCallEmergencyMeeting(reporter: Participant): boolean {
    if (!reporter.isAlive || reporter.role === Role.Observer) return false;
    // D6: a match in play only (upstream's check let a muster restart a finished round).
    if (reporter.state !== MatchState.Playing) return false;
    if (this.time < this.nextEmergencyAllowedAt) return false;
    if (Dist(reporter.position, this.map.MeetingPoint) > this.s.musterRange + this.slack(reporter)) return false;
    this.note({ kind: "muster", actor: reporter.slot });
    this.StartMeeting(reporter, null);
    return true;
  }

  /** UpdateHeldInteract: one stretch of `deltaTime` with Use held or not. */
  UpdateHeldInteract(player: Participant, deltaTime: number, isHeld: boolean): void {
    if (!this.roundStarted || this.meetingActive || !player.isAlive || this.taskFailurePending) {
      this.CancelHeldInteract(player);
      return;
    }
    if (this.activeFault !== Fault.None && player.role === Role.Technician) {
      const panel = this.map.PanelFor(this.activeFault);
      if (panel && Dist(player.position, panel.Position) <= this.s.faultRange + this.slack(player)) {
        if (!isHeld) {
          this.CancelHeldInteract(player);
          return;
        }
        this.AdvanceChannel(player, Interaction.Reset, this.activeFault, this.s.resetSeconds, deltaTime, () => this.TryFixSabotage(player));
        return;
      }
    }
    if (player.CanDoTasks && this.activeFault !== Fault.Jam) {
      const near = this.TryGetNearestIncompleteTask(player);
      if (near && near.distance <= this.s.jobRange + this.slack(player)) {
        this.UpdateTaskChannel(player, near.station, deltaTime, isHeld);
        return;
      }
    }
    this.CancelHeldInteract(player);
  }

  private UpdateTaskChannel(player: Participant, station: JobStation, deltaTime: number, isHeld: boolean): void {
    switch (station.Kind) {
      case JobKind.Tap:
        this.UpdateCircuitTask(player, station, deltaTime, isHeld);
        break;
      case JobKind.Timing:
        this.UpdateCalibrationTask(player, station, deltaTime, isHeld);
        break;
      default:
        if (!isHeld) {
          this.CancelHeldInteract(player);
          return;
        }
        this.AdvanceChannel(player, Interaction.Job, station.Id, this.s.holdSeconds, deltaTime, () => this.TryCompleteTask(player));
        break;
    }
  }

  private UpdateCircuitTask(player: Participant, station: JobStation, deltaTime: number, isHeld: boolean): void {
    let channel = this.channels.get(player.PlayerNumber);
    if (!channel || channel.kind !== Interaction.Job || channel.targetId !== station.Id) {
      if (!isHeld) return;
      channel = { kind: Interaction.Job, targetId: station.Id, progress: 0, wasHeld: false };
    }
    if (player.isBot) channel.progress = f(channel.progress + f(deltaTime / f(0.35)));
    else if (isHeld && !channel.wasHeld) channel.progress = f(channel.progress + 1);
    channel.wasHeld = isHeld;
    this.CommitTaskChannel(player, channel, this.s.tapCount);
  }

  private UpdateCalibrationTask(player: Participant, station: JobStation, deltaTime: number, isHeld: boolean): void {
    const cycle = f(Math.max(0.5, this.s.timingCycleSeconds));
    let channel = this.channels.get(player.PlayerNumber);
    if (!channel || channel.kind !== Interaction.Job || channel.targetId !== station.Id) {
      if (!isHeld) return;
      channel = { kind: Interaction.Job, targetId: station.Id, progress: 0, wasHeld: false };
    }
    if (player.isBot) {
      channel.progress = f(channel.progress + f(deltaTime));
      if (channel.progress >= f(cycle * CALIBRATION_START)) {
        this.CompleteTaskChannel(player);
        return;
      }
    } else if (isHeld) {
      channel.progress = Repeat(f(channel.progress + f(deltaTime)), cycle);
    } else if (channel.wasHeld) {
      const normalized = f(channel.progress / cycle);
      if (normalized >= f(this.s.timingBand[0]) && normalized <= f(this.s.timingBand[1])) {
        this.CompleteTaskChannel(player);
        return;
      }
      channel.progress = 0;
    }
    channel.wasHeld = isHeld;
    this.channels.set(player.PlayerNumber, channel);
  }

  private CommitTaskChannel(player: Participant, channel: ChannelState, required: number): void {
    if (channel.progress >= required) {
      this.CompleteTaskChannel(player);
      return;
    }
    this.channels.set(player.PlayerNumber, channel);
  }

  private CompleteTaskChannel(player: Participant): void {
    this.channels.delete(player.PlayerNumber);
    this.TryCompleteTask(player);
  }

  private AdvanceChannel(player: Participant, kind: Interaction, targetId: number, required: number, deltaTime: number, onComplete: () => boolean): void {
    let channel = this.channels.get(player.PlayerNumber);
    if (!channel || channel.kind !== kind || channel.targetId !== targetId) channel = { kind, targetId, progress: 0, wasHeld: false };
    channel.progress = f(channel.progress + f(deltaTime));
    this.channels.set(player.PlayerNumber, channel);
    if (channel.progress < f(required)) return;
    this.channels.delete(player.PlayerNumber);
    onComplete();
  }

  CancelHeldInteract(player: Participant | null): void {
    if (player) this.channels.delete(player.PlayerNumber);
  }

  TryCompleteTask(p: Participant): boolean {
    if (!this.roundStarted || this.meetingActive || this.taskFailurePending || !p.CanDoTasks) return false;
    if (this.activeFault === Fault.Jam) {
      this.status = "Jobs are blocked while the sonar is jammed";
      return false;
    }
    const near = this.TryGetNearestIncompleteTask(p);
    if (!near || near.distance > this.s.jobRange + this.slack(p)) {
      this.status = "No unfinished job in reach";
      return false;
    }
    if (!p.CompleteTask(near.station.Id)) return false;
    this.status = `${p.DisplayName} finished ${near.station.Name}`;
    this.note({ kind: "job", actor: p.slot, target: near.station.Id });
    this.CheckWinCondition();
    return true;
  }

  TryGetNearestIncompleteTask(p: Participant): { station: JobStation; distance: number } | null {
    let best: JobStation | null = null;
    let distance = Number.MAX_VALUE;
    for (const s of this.map.JobStations) {
      if (!p.HasAssignedTask(s.Id) || p.HasCompletedTask(s.Id)) continue;
      const d = Dist(p.position, s.Position);
      if (d < distance) {
        best = s;
        distance = d;
      }
    }
    return best ? { station: best, distance } : null;
  }

  /** Player.TryUseSabotage + TryStartSabotage. */
  TryStartSabotage(saboteur: Participant): boolean {
    if (saboteur.state !== MatchState.Playing || !saboteur.isAlive || !saboteur.IsSaboteur) return false;
    if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return false;
    if (this.activeFault !== Fault.None) {
      this.status = "A fault is already running";
      return false;
    }
    if (this.time < this.nextFaultAllowedAt) {
      this.status = "Faults are cooling down";
      return false;
    }
    const near = this.map.NearestPanel(saboteur.position);
    if (!near || near.distance > this.s.faultRange + this.slack(saboteur)) {
      this.status = "No fault panel in reach";
      return false;
    }
    this.activeFault = near.panel.Type as Fault;
    const seconds = this.FaultCountdown(this.activeFault);
    this.activeFaultEndsAt = seconds > 0 ? this.time + seconds : 0;
    this.nextFaultAllowedAt = this.time + this.s.faultCooldown;
    this.status = `${near.panel.Name}!`;
    this.note({ kind: "fault", actor: saboteur.slot, target: this.activeFault });
    return true;
  }

  /** The countdown of a fault in seconds, 0 for none. D2: the fourth fault has one too. */
  FaultCountdown(fault: Fault): number {
    const panel = this.map.PanelFor(fault);
    if (!panel || !panel.HasCountdown) return 0;
    return fault === Fault.Scrubber ? this.s.scrubberSeconds : this.s.breachSeconds;
  }

  private TryFixSabotage(technician: Participant): boolean {
    if (this.activeFault === Fault.None) return false;
    const panel = this.map.PanelFor(this.activeFault);
    if (!panel) return false;
    if (Dist(technician.position, panel.Position) > this.s.faultRange + this.slack(technician)) return false;
    const was = this.activeFault;
    this.ClearActiveSabotage();
    this.status = `${technician.DisplayName} reset the ${panel.Name}`;
    this.note({ kind: "reset", actor: technician.slot, target: was });
    return true;
  }

  ClearActiveSabotage(): void {
    this.activeFault = Fault.None;
    this.activeFaultEndsAt = 0;
  }

  /**
   * Player.TryUseVent + TryUseVent, for a hatch the player says they stood at. The player's own client makes the move
   * (PORT.md 3.10); this decides whether the jump is allowed, and returns where it lands, or null.
   */
  TryUseHatch(saboteur: Participant, from: Vector2, hatchIndex: number): Vector2 | null {
    if (saboteur.state !== MatchState.Playing || !saboteur.isAlive || !saboteur.IsSaboteur) return null;
    if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return null;
    const near = this.map.NearestHatch(from);
    if (!near || near.hatch.Index !== hatchIndex || near.distance > this.s.hatchRange + this.slack(saboteur)) {
      this.status = "No hatch in reach";
      return null;
    }
    const next = this.map.GetNextHatch(near.hatch);
    this.note({ kind: "hatch", actor: saboteur.slot, target: next.Index });
    return this.map.ClampToWalkable(next.Position, 0.5);
  }

  /** TrySubmitVote */
  TrySubmitVote(voter: Participant, targetNumber: number): boolean {
    if (!this.meetingActive || !voter.CanVote) return false;
    if (this.votes.has(voter.PlayerNumber)) return false;
    if (targetNumber !== ABSTAIN && !this.IsValidVoteTarget(targetNumber)) targetNumber = ABSTAIN;
    this.votes.set(voter.PlayerNumber, targetNumber);
    voter.MarkVoted(targetNumber);
    this.note({ kind: "vote", actor: voter.slot });
    if (this.votes.size >= this.GetEligibleVoterCount()) this.ResolveMeeting();
    return true;
  }

  IsValidVoteTarget(targetNumber: number): boolean {
    const t = this.FindPlayerByNumber(targetNumber);
    return t !== null && t.isAlive && t.role !== Role.Observer;
  }

  GetEligibleVoterCount(): number {
    return this.Spawned().filter((p) => p.CanVote).length;
  }

  StartMeeting(reporter: Participant, body: Participant | null): void {
    this.meetingActive = true;
    this.meetingEndsAt = this.time + this.s.musterSeconds;
    this.bots.MeetingStarted();
    this.nextEmergencyAllowedAt = this.time + this.s.musterCooldown;
    this.votes.clear();
    this.channels.clear();
    this.ClearActiveSabotage();
    let bodyNumber = 0;
    if (body) {
      body.MarkBodyReported();
      bodyNumber = body.PlayerNumber;
    }
    this.meetingReporterNumber = reporter.PlayerNumber;
    this.meetingBodyNumber = bodyNumber;
    // D4: at a muster everyone sees who is missing.
    for (const p of this.players) if (!p.isAlive) this.seenDown.add(p.slot);
    for (const p of this.Spawned()) p.EnterMeeting();
    this.announcement = { kind: Announcement.None, playerNumber: 0, role: Role.Unassigned, endsAt: 0 };
    this.status = body ? `${reporter.DisplayName} sounded the alarm over ${body.DisplayName}.` : `${reporter.DisplayName} called a muster.`;
  }

  ResolveMeeting(): void {
    if (!this.meetingActive) return;
    this.meetingActive = false;
    const ejectedNumber = GetEjectedPlayerNumber(this.votes);
    const ejected = ejectedNumber === ABSTAIN ? null : this.FindPlayerByNumber(ejectedNumber);
    if (ejected) {
      ejected.Exile();
      this.seenDown.add(ejected.slot);
      this.CancelHeldInteract(ejected);
      this.status = `${ejected.DisplayName} is locked out by the vote.`;
    } else {
      this.status = "The vote clears everyone.";
    }
    this.announcement = {
      kind: Announcement.MusterResult,
      playerNumber: ejected ? ejected.PlayerNumber : 0,
      role: ejected ? ejected.role : Role.Unassigned,
      endsAt: this.time + this.s.announceSeconds,
    };
    this.note({ kind: "result", target: ejected ? ejected.slot : -1 });
    this.votes.clear();
    if (this.CheckWinCondition()) return;
    for (const p of this.Spawned()) p.ResumeAfterMeeting();
  }

  /** OnPlayerLeft: the player is gone; during a round the win check runs. */
  PlayerLeft(slot: number): void {
    const p = this.players[slot];
    if (!p || p.gone) return;
    p.gone = true;
    // Upstream despawned the player's object, body and all: nothing is left to report or draw.
    p.isReportableBody = false;
    p.bodyPosition = null;
    this.CancelHeldInteract(p);
    this.note({ kind: "left", actor: slot });
    if (this.roundStarted) this.CheckWinCondition();
  }

  // ---- what the referee publishes and seals -------------------------------------------------------------------

  /** Seconds until the next fault is allowed, as a synced time. */
  get FaultReadyAt(): number {
    return this.nextFaultAllowedAt;
  }
}

/** Mathf.Repeat */
export function Repeat(t: number, length: number): number {
  return f(Math.min(Math.max(0, f(t - f(Math.floor(f(t / length)) * length))), length));
}

export { CountTasks };
