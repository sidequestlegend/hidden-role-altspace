// Translated from the upstream Assets/Scripts/Player.cs: the state of one participant and the rules that read it
// (Player:63-142, 304-537, 647-720). Upstream keeps all of it in networked properties that every client receives;
// here it is the referee's memory. What may be public is copied into the match leaf by Match.ts, what belongs to one
// player is sealed to them by Dealer.ts, and the rest never leaves the referee (PORT.md 3.2).
//
// Sprites, animation and the camera (Player:144-302, 722-1069) are not ported.

import { Vector2 } from "../portkit/src/index.ts";
import { ABSTAIN, MatchState, Role, Team } from "./GameTypes.ts";

export class Participant {
  /** 0-based slot on the match roster; the upstream PlayerNumber is slot + 1. */
  readonly slot: number;
  readonly uid: string;
  readonly name: string;
  readonly isBot: boolean;
  /** NetworkedPosition: the referee's own, following what a person reports at most at a run (PORT.md D12), or a bot's. */
  position: Vector2;
  role: Role = Role.Unassigned;
  state: MatchState = MatchState.Lobby;
  winningTeam: Team = Team.None;
  isAlive = true;
  isReportableBody = false;
  /** Where the body lies (the position when eliminated). */
  bodyPosition: Vector2 | null = null;
  hasVoted = false;
  votedTargetNumber = ABSTAIN;
  assignedTaskCount = 0;
  assignedTaskMask = 0;
  completedTaskMask = 0;
  lastAssignedTaskId = -1;
  taskDeadlineFailed = false;
  /** Synced seconds of the last elimination this player made. */
  lastKillTime: number;
  /** The player has left the world (upstream despawns them; the slot stays so numbers keep their meaning). */
  gone = false;
  /** Wave jobs a downed technician would have been given while nobody had yet seen them down (the published total counts them, D4). */
  unseenWaveJobs = 0;
  private readonly killCooldownSeconds: number;

  constructor(slot: number, uid: string, name: string, isBot: boolean, position: Vector2, killCooldownSeconds: number) {
    this.slot = slot;
    this.uid = uid;
    this.name = name;
    this.isBot = isBot;
    this.position = position.clone();
    this.killCooldownSeconds = killCooldownSeconds;
    this.lastKillTime = -killCooldownSeconds;
  }

  get PlayerNumber(): number {
    return this.slot + 1;
  }

  get DisplayName(): string {
    return this.name;
  }

  get IsSaboteur(): boolean {
    return this.role === Role.Saboteur;
  }

  /** Player.CanVote */
  get CanVote(): boolean {
    return this.state === MatchState.Muster && this.isAlive && this.role !== Role.Observer && !this.taskDeadlineFailed && !this.gone;
  }

  /** Player.CanDoTasks */
  get CanDoTasks(): boolean {
    return (
      this.state === MatchState.Playing &&
      this.isAlive &&
      (this.role === Role.Technician || this.role === Role.Saboteur) &&
      this.assignedTaskCount > 0 &&
      !this.taskDeadlineFailed
    );
  }

  /** Player.CanMove */
  get CanMove(): boolean {
    return this.state === MatchState.Lobby || (this.state === MatchState.Playing && this.isAlive && !this.taskDeadlineFailed);
  }

  KillCooldownRemaining(now: number): number {
    return Math.max(0, this.killCooldownSeconds - (now - this.lastKillTime));
  }

  IsKillReady(now: number): boolean {
    return this.KillCooldownRemaining(now) <= 0;
  }

  /** The synced time at which the next elimination is allowed. */
  KillReadyAt(): number {
    return this.lastKillTime + this.killCooldownSeconds;
  }

  get CompletedTaskCount(): number {
    return CountTasks(this.completedTaskMask & this.assignedTaskMask);
  }

  get AllTasksComplete(): boolean {
    return this.assignedTaskCount > 0 && this.CompletedTaskCount >= this.assignedTaskCount;
  }

  ReturnToLobby(spawnPosition: Vector2): void {
    this.position = spawnPosition.clone();
    this.role = Role.Unassigned;
    this.state = MatchState.Lobby;
    this.winningTeam = Team.None;
    this.isAlive = true;
    this.isReportableBody = false;
    this.bodyPosition = null;
    this.hasVoted = false;
    this.votedTargetNumber = ABSTAIN;
    this.assignedTaskCount = 0;
    this.assignedTaskMask = 0;
    this.completedTaskMask = 0;
    this.lastAssignedTaskId = -1;
    this.taskDeadlineFailed = false;
    this.lastKillTime = -this.killCooldownSeconds;
  }

  BeginRound(role: Role, spawnPosition: Vector2, taskMask: number): void {
    this.position = spawnPosition.clone();
    this.role = role;
    this.state = MatchState.Playing;
    this.winningTeam = Team.None;
    this.isAlive = role !== Role.Observer;
    this.isReportableBody = false;
    this.bodyPosition = null;
    this.hasVoted = false;
    this.votedTargetNumber = ABSTAIN;
    this.assignedTaskMask = role === Role.Technician || role === Role.Saboteur ? taskMask & 0x3fffffff : 0;
    this.assignedTaskCount = CountTasks(this.assignedTaskMask);
    this.completedTaskMask = 0;
    this.lastAssignedTaskId = -1;
    this.taskDeadlineFailed = false;
    this.unseenWaveJobs = 0;
    // Upstream sets LastKillTime = -cooldown, which on its clock (Time.time from 0) means "ready at once". On the
    // synced clock the same meaning is "ready now": set by MatchRules.StartRound with the start time.
  }

  EnterMeeting(): void {
    this.state = MatchState.Muster;
    this.hasVoted = false;
    this.votedTargetNumber = ABSTAIN;
  }

  ResumeAfterMeeting(): void {
    if (this.state !== MatchState.Ended) this.state = MatchState.Playing;
    this.hasVoted = false;
    this.votedTargetNumber = ABSTAIN;
  }

  EndRound(winningTeam: Team): void {
    this.state = MatchState.Ended;
    this.winningTeam = winningTeam;
    this.hasVoted = false;
  }

  /** Player.Kill: down where they stand, a body to report. */
  Kill(): void {
    this.isAlive = false;
    this.isReportableBody = true;
    this.bodyPosition = this.position.clone();
  }

  /** Player.Exile: locked out by the vote, no body. */
  Exile(): void {
    this.isAlive = false;
    this.isReportableBody = false;
  }

  MarkBodyReported(): void {
    this.isReportableBody = false;
  }

  MarkVoted(targetNumber: number): void {
    this.hasVoted = true;
    this.votedTargetNumber = targetNumber;
  }

  MarkKillUsed(now: number): void {
    this.lastKillTime = now;
  }

  HasAssignedTask(taskId: number): boolean {
    return taskId >= 0 && taskId < 30 && (this.assignedTaskMask & (1 << taskId)) !== 0;
  }

  HasCompletedTask(taskId: number): boolean {
    return this.HasAssignedTask(taskId) && (this.completedTaskMask & (1 << taskId)) !== 0;
  }

  CompleteTask(taskId: number): boolean {
    if (!this.CanDoTasks || !this.HasAssignedTask(taskId) || this.HasCompletedTask(taskId)) return false;
    this.completedTaskMask |= 1 << taskId;
    return true;
  }

  AssignTask(taskId: number): boolean {
    if (this.role !== Role.Technician || taskId < 0 || taskId >= 30 || this.HasAssignedTask(taskId)) return false;
    this.assignedTaskMask |= 1 << taskId;
    this.assignedTaskCount = CountTasks(this.assignedTaskMask);
    this.lastAssignedTaskId = taskId;
    return true;
  }

  SetTaskFailureCutIn(): void {
    this.taskDeadlineFailed = true;
    if (this.state === MatchState.Muster) this.ResumeAfterMeeting();
  }
}

/** Player.CountTasks */
export function CountTasks(taskMask: number): number {
  let count = 0;
  for (let taskId = 0; taskId < 30; taskId++) if ((taskMask & (1 << taskId)) !== 0) count++;
  return count;
}
