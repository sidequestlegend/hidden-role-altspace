// Translated from the bot code inside the upstream BasicSpawner.cs (Spawner:810-852, 1712-1921, 1981-2032, 2261-2308).
// Bots are an option here (the `bots` setting, 0 by default): the referee runs them, as the host did upstream, so a
// match can be played with fewer than four people, and the tests use them. A bot acts through the same rule calls
// a person's input reaches (MatchRules.TryUseKill and the rest), with the upstream numbers and chances.
//
// Changes: the referee steps bots 20 times a second (upstream: every frame, so the per-frame chances of 55% at a panel
// and 1% at a hatch are per 50 ms here); a bot asks the map for a new steering point at most every 0.25 s instead of
// every frame (the search tests dozens of lines across the map); and the steering point comes from a shortest route
// over the map's waypoints (ShipMap.NextStep), because upstream's greedy pick strands a bot on a waypoint (D15).

import { Vector2 } from "../portkit/src/index.ts";
import type { MatchRules } from "./BasicSpawner.ts";
import { ABSTAIN, Fault, MatchState, Role } from "./GameTypes.ts";
import type { Participant } from "./Player.ts";
import { f } from "./ShipMapData.ts";
import { Dist } from "./ShipMap.ts";

const STEER_SECONDS = 0.25;
/** Upstream's player radius is 0.5; at that size some corridor mouths of the map are closed to a bot (D15). */
const COLLISION_RADIUS = 0.3;

export class BotBrains {
  private readonly r: MatchRules;
  readonly targets = new Map<number, Vector2>();
  readonly taskCooldowns = new Map<number, number>();
  readonly actionCooldowns = new Map<number, number>();
  private readonly steering = new Map<number, { goal: Vector2; point: Vector2; until: number }>();
  private readonly stuck = new Map<number, number>();
  nextBotVoteAt = 0;

  constructor(rules: MatchRules) {
    this.r = rules;
  }

  Clear(): void {
    this.targets.clear();
    this.taskCooldowns.clear();
    this.actionCooldowns.clear();
    this.steering.clear();
    this.stuck.clear();
  }

  /** The bot lines of StartRound (Spawner:1289-1294), in the same order of random draws. */
  Seed(bot: Participant): void {
    const r = this.r;
    this.targets.set(bot.PlayerNumber, this.GetNextBotTarget(bot));
    this.taskCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(1, r.s.botTaskPause));
    this.actionCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(0.5, 2));
  }

  MeetingStarted(): void {
    this.nextBotVoteAt = this.r.time + this.r.s.botVoteDelay;
  }

  private bots(): Participant[] {
    return this.r.Spawned().filter((p) => p.isBot);
  }

  /** UpdateBots */
  UpdateBots(dt: number): void {
    const r = this.r;
    for (const bot of this.bots()) {
      if (!bot.isAlive || bot.state !== MatchState.Playing) continue;
      if (bot.role === Role.Saboteur) {
        this.UpdateBotSaboteur(bot, dt);
        continue;
      }
      if (bot.role === Role.Technician && r.activeFault !== Fault.None) {
        const panel = r.map.PanelFor(r.activeFault);
        if (panel) {
          if (Dist(bot.position, panel.Position) <= r.s.faultRange) {
            const next = this.taskCooldowns.get(bot.PlayerNumber);
            if (next === undefined || r.time >= next) {
              const previous = r.activeFault;
              r.UpdateHeldInteract(bot, dt, true);
              if (previous !== r.activeFault) this.taskCooldowns.set(bot.PlayerNumber, r.time + r.s.botTaskPause);
            } else {
              r.CancelHeldInteract(bot);
            }
            continue;
          }
          r.CancelHeldInteract(bot);
          this.MoveBotToward(bot, panel.Position, dt);
          continue;
        }
      }
      if (bot.role === Role.Technician && !bot.AllTasksComplete) {
        const near = r.TryGetNearestIncompleteTask(bot);
        if (near) {
          if (near.distance <= r.s.jobRange) {
            const next = this.taskCooldowns.get(bot.PlayerNumber);
            if (next === undefined || r.time >= next) {
              const before = bot.CompletedTaskCount;
              r.UpdateHeldInteract(bot, dt, true);
              if (bot.CompletedTaskCount > before) {
                this.taskCooldowns.set(bot.PlayerNumber, r.time + r.s.botTaskPause);
                this.targets.set(bot.PlayerNumber, this.GetNextBotTarget(bot));
              }
            } else {
              r.CancelHeldInteract(bot);
            }
            continue;
          }
          let target = this.targets.get(bot.PlayerNumber);
          if (!target || bot.HasCompletedTask(r.map.JobIdAt(target)) || Dist(bot.position, target) < f(0.2)) {
            target = near.station.Position;
            this.targets.set(bot.PlayerNumber, target);
          }
          r.CancelHeldInteract(bot);
          this.MoveBotToward(bot, target, dt);
          continue;
        }
      }
      r.CancelHeldInteract(bot);
      let target = this.targets.get(bot.PlayerNumber);
      if (!target || Dist(bot.position, target) < f(0.2)) {
        target = this.GetNextBotTarget(bot);
        this.targets.set(bot.PlayerNumber, target);
      }
      this.MoveBotToward(bot, target, dt);
    }
  }

  /** The upstream bot routine for the hidden role (Spawner:1810-1868). */
  private UpdateBotSaboteur(bot: Participant, dt: number): void {
    const r = this.r;
    r.CancelHeldInteract(bot);
    if (bot.IsKillReady(r.time) && r.FindKillTarget(bot) !== null && r.TryUseKill(bot)) {
      this.actionCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(0.8, 1.8));
      return;
    }
    const nextThink = this.actionCooldowns.get(bot.PlayerNumber);
    if (nextThink === undefined || r.time >= nextThink) {
      this.actionCooldowns.set(bot.PlayerNumber, r.time + Math.max(0.1, r.s.botThinkSeconds));
      if (r.activeFault === Fault.None && r.time >= r.nextFaultAllowedAt && r.random.value <= r.s.botFaultChance) {
        this.targets.set(bot.PlayerNumber, this.GetRandomSabotageTarget());
      }
    }
    if (r.activeFault === Fault.None && r.time >= r.nextFaultAllowedAt) {
      const near = r.map.NearestPanel(bot.position);
      if (near && near.distance <= r.s.faultRange && r.random.value <= 0.55) {
        r.TryStartSabotage(bot);
        this.actionCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(3, 6));
        return;
      }
    }
    if (bot.KillCooldownRemaining(r.time) > 2) {
      const hatch = r.map.NearestHatch(bot.position);
      if (hatch && hatch.distance <= r.s.hatchRange && r.random.value <= 0.01) {
        const to = r.TryUseHatch(bot, bot.position, hatch.hatch.Index);
        if (to) {
          bot.position = to;
          this.steering.delete(bot.PlayerNumber);
        }
        return;
      }
    }
    const crew = this.TryGetClosestAliveTechnician(bot);
    if (crew) {
      this.MoveBotToward(bot, crew.position, dt);
      return;
    }
    let target = this.targets.get(bot.PlayerNumber);
    if (!target || Dist(bot.position, target) < f(0.2)) {
      target = this.GetRandomBotTarget();
      this.targets.set(bot.PlayerNumber, target);
    }
    this.MoveBotToward(bot, target, dt);
  }

  /** UpdateBotVoting: one bot votes every 0.45 s, the first 1.5 s into the muster. */
  UpdateBotVoting(): void {
    const r = this.r;
    if (r.time < this.nextBotVoteAt) return;
    this.nextBotVoteAt = r.time + r.s.botVoteInterval;
    for (const bot of this.bots()) {
      if (!bot.CanVote || r.votes.has(bot.PlayerNumber)) continue;
      r.TrySubmitVote(bot, this.PickBotVoteTarget(bot));
      break;
    }
  }

  /** MoveBotToward, with the steering point kept for STEER_SECONDS. */
  MoveBotToward(bot: Participant, target: Vector2, dt: number): void {
    const r = this.r;
    if (!bot.CanMove) return;
    const before = bot.position;
    let steer = this.steering.get(bot.PlayerNumber);
    if (!steer || r.time >= steer.until || !steer.goal.equals(target) || Dist(bot.position, steer.point) < f(0.2)) {
      steer = { goal: target.clone(), point: r.map.NextStep(bot.position, target, COLLISION_RADIUS), until: r.time + STEER_SECONDS };
      this.steering.set(bot.PlayerNumber, steer);
    }
    let direction = steer.point.sub(bot.position);
    if (direction.sqrMagnitude > 1) direction = direction.normalized;
    bot.position = r.map.MoveToward(bot.position, direction.scale(r.s.botMoveSpeed * dt), COLLISION_RADIUS);
    if (direction.sqrMagnitude <= 0.01 || Dist(before, bot.position) > 0.01) {
      this.stuck.set(bot.PlayerNumber, 0);
      return;
    }
    // Stuck on a corner for a while: step onto the nearest open grid point (D15).
    const stuck = (this.stuck.get(bot.PlayerNumber) ?? 0) + 1;
    this.stuck.set(bot.PlayerNumber, stuck);
    if (stuck >= 10) {
      this.stuck.set(bot.PlayerNumber, 0);
      bot.position = r.map.NearestOpen(bot.position, COLLISION_RADIUS);
      this.steering.delete(bot.PlayerNumber);
      return;
    }
    let sidestep = new Vector2(-direction.y, direction.x);
    if (r.random.value < 0.5) sidestep = sidestep.scale(-1);
    bot.position = r.map.ResolveMove(bot.position, sidestep.scale(r.s.botMoveSpeed * dt), COLLISION_RADIUS);
    this.steering.delete(bot.PlayerNumber);
  }

  /** GetNextBotTarget */
  GetNextBotTarget(bot: Participant): Vector2 {
    if (bot.role === Role.Technician && !bot.AllTasksComplete) {
      const station = this.TryGetRandomIncompleteTask(bot);
      if (station) return station;
    }
    return this.GetRandomBotTarget();
  }

  GetRandomBotTarget(): Vector2 {
    return this.r.map.GetRandomWalkablePosition(this.r.random);
  }

  GetRandomSabotageTarget(): Vector2 {
    const panels = this.r.map.FaultPanels;
    if (panels.length === 0) return this.GetRandomBotTarget();
    return panels[this.r.random.RangeInt(0, panels.length)]!.Position;
  }

  TryGetRandomIncompleteTask(p: Participant): Vector2 | null {
    const stations = this.r.map.JobStations.filter((s) => p.HasAssignedTask(s.Id) && !p.HasCompletedTask(s.Id));
    if (stations.length === 0) return null;
    return stations[this.r.random.RangeInt(0, stations.length)]!.Position;
  }

  TryGetClosestAliveTechnician(seeker: Participant): Participant | null {
    let target: Participant | null = null;
    let closest = Number.MAX_VALUE;
    for (const p of this.r.Spawned()) {
      if (p === seeker || !p.isAlive || p.role !== Role.Technician) continue;
      const d = Dist(seeker.position, p.position);
      if (d < closest) {
        target = p;
        closest = d;
      }
    }
    return target;
  }

  /** PickBotVoteTarget: 25% abstain, else a random living other participant. */
  PickBotVoteTarget(voter: Participant): number {
    const candidates = this.r.Spawned().filter((p) => p !== voter && p.isAlive && p.role !== Role.Observer);
    if (candidates.length === 0 || this.r.random.value < 0.25) return ABSTAIN;
    return candidates[this.r.random.RangeInt(0, candidates.length)]!.PlayerNumber;
  }
}
