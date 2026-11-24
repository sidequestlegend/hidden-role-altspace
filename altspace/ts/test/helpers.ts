// Test helpers: people in a fake room with the game on their pages, driven the way a person drives it. A Driver
// walks its client's head through the station (pose updates, at most 6 m/s, along the map's own steering points),
// follows the teleports the game makes, and presses keys; its autopilot works the player's own jobs, read from the
// player's own sealed entry, exactly as a person reading the panel would.
//
// Nothing in a test reaches into another player's page for a secret, except where a test says it does (to pick
// who to vote for, or to check what the referee holds).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Vector2, Vector3 } from "../portkit/src/index.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import { MatchState, JobKind, Role } from "../src/GameTypes.ts";
import game from "../src/index.ts";
import type { Dealer } from "../src/Dealer.ts";
import type { Match } from "../src/Match.ts";
import type { PlayerLink } from "../src/PlayerLink.ts";
import type { RuntimeHud } from "../src/RuntimeHud.ts";
import { Dist, STATION } from "../src/ShipMap.ts";

export const bindings = JSON.parse(readFileSync(fileURLToPath(new URL("../bindings.json", import.meta.url)), "utf8"));
export const SLUG = game.slug;
export const STEP_MS = 100;

export function newWorld(seed = 1): TestWorld {
  return new TestWorld(game, bindings, { seed });
}

export const match = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<Match>(c, "match", inst);
export const dealer = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<Dealer>(c, "dealer", inst);
export const hud = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<RuntimeHud>(c, "hud", inst);
export function link(world: TestWorld, c: FakeClient, inst = "0"): PlayerLink {
  return hud(world, c, inst).PlayerBehaviour<PlayerLink>(world.instance(c, inst).networking.LocalPlayer, "link")!;
}

/** The client that is referee of the instance, if any. */
export function referee(world: TestWorld, inst = "0"): FakeClient | null {
  return world.clients.find((c) => world.started(c, inst) && world.instance(c, inst).networking.IsReferee) ?? null;
}

export async function until(world: TestWorld, what: string, done: () => boolean, maxMs = 30000): Promise<void> {
  if (await world.room.runUntil(done, maxMs, 50)) return;
  throw new Error(`timed out waiting for ${what}`);
}

/** Every started client sees state `st`. */
export async function waitState(world: TestWorld, st: number, inst = "0", maxMs = 30000): Promise<void> {
  await until(world, `state ${st}`, () => world.clients.filter((c) => world.started(c, inst)).every((c) => match(world, c, inst).m.st === st), maxMs);
}

/** A person at the game. */
export class Driver {
  readonly world: TestWorld;
  readonly c: FakeClient;
  readonly inst: string;
  pos = new Vector2(0, 0);
  private seenTeleports = 0;
  private plan: Array<() => boolean> = [];
  private held = new Set<string>();
  auto: "none" | "jobs" | "hunt" | "reset" = "none";
  huntTarget: Driver | null = null;
  private stuck = 0;
  private steer: { goal: Vector2; point: Vector2; at: number } | null = null;
  private busyUntil = 0;
  /** Jobs this driver saw finish (for the log). */
  jobsDone = 0;

  constructor(world: TestWorld, c: FakeClient, inst = "0") {
    this.world = world;
    this.c = c;
    this.inst = inst;
  }

  get name(): string {
    return this.c.name;
  }
  get hud(): RuntimeHud {
    return hud(this.world, this.c, this.inst);
  }
  get match(): Match {
    return match(this.world, this.c, this.inst);
  }
  get slot(): number {
    return this.hud.MySlot();
  }
  get role(): number {
    return this.hud.MyRole();
  }
  get alive(): boolean {
    const m = this.match.m;
    return this.slot >= 0 && m.al[this.slot] === 1;
  }

  /** Puts the head at a map point (as a person walking there would report it). */
  place(at: Vector2): void {
    this.pos = at.clone();
    this.c.pose(this.hud.ToWorld(this.pos, 1.6));
  }

  private followTeleports(): void {
    while (this.seenTeleports < this.c.teleports.length) {
      const t = this.c.teleports[this.seenTeleports++]!;
      this.pos = this.hud.ToMap(t.position);
      this.steer = null;
    }
  }

  key(key: string, down: boolean): void {
    // The page hears the key where the head is now.
    this.c.pose(this.hud.ToWorld(this.pos, 1.6));
    if (down) this.held.add(key);
    else this.held.delete(key);
    this.c.input({ type: "key", key, pressed: down });
  }

  tapKey(key: string): void {
    this.key(key, true);
    this.key(key, false);
  }

  /** Queues a walk to a map point. */
  go(target: Vector2, within = 0.4): this {
    this.plan.push(() => this.walk(target, within));
    return this;
  }

  /** Queues holding a key for `seconds`. */
  hold(key: string, seconds: number): this {
    let start = -1;
    this.plan.push(() => {
      const now = this.world.room.now;
      if (start < 0) {
        start = now;
        this.key(key, true);
      }
      if (now - start >= seconds * 1000 - 1) {
        this.key(key, false);
        return true;
      }
      return false;
    });
    return this;
  }

  /** Queues a press and release. */
  press(key: string): this {
    this.plan.push(() => {
      this.tapKey(key);
      return true;
    });
    return this;
  }

  wait(seconds: number): this {
    let until = -1;
    this.plan.push(() => {
      if (until < 0) until = this.world.room.now + seconds * 1000;
      return this.world.room.now >= until;
    });
    return this;
  }

  /** Queues anything. */
  then(fn: () => boolean | void): this {
    this.plan.push(() => fn() !== false);
    return this;
  }

  get idle(): boolean {
    return this.plan.length === 0;
  }

  /** One step of STEP_MS. */
  step(): void {
    this.followTeleports();
    while (this.plan.length) {
      if (!this.plan[0]!()) break;
      this.plan.shift();
    }
    if (this.plan.length === 0) this.autopilot();
    this.c.pose(this.hud.ToWorld(this.pos, 1.6));
  }

  private walk(target: Vector2, within: number): boolean {
    if (Dist(this.pos, target) <= within) return true;
    const m = this.match.m;
    if (m.st === MatchState.Muster || m.ci > 0) return false; // frozen
    const now = this.world.room.now;
    if (!this.steer || now - this.steer.at > 250 || !this.steer.goal.equals(target) || Dist(this.pos, this.steer.point) < 0.2) {
      this.steer = { goal: target.clone(), point: STATION.NextStep(this.pos, target, 0.3), at: now };
    }
    const d = this.steer.point.sub(this.pos);
    const stepLen = Math.min(d.magnitude, 6 * (STEP_MS / 1000));
    const move = d.magnitude > 0 ? d.normalized.scale(stepLen) : Vector2.zero;
    const before = this.pos.clone();
    this.pos = STATION.MoveToward(this.pos, move, 0.3);
    if (Dist(before, this.pos) < stepLen * 0.2) {
      if (++this.stuck >= 5) {
        this.stuck = 0;
        this.pos = STATION.NearestOpen(this.pos, 0.3);
      }
      this.steer = null;
    } else this.stuck = 0;
    return Dist(this.pos, target) <= within;
  }

  /** The autopilot: work own jobs, hunt a target, or reset a running fault. */
  private autopilot(): void {
    const m = this.match.m;
    if (m.st !== MatchState.Playing || !this.alive || m.ci > 0) return;
    const now = this.world.room.now;
    if (now < this.busyUntil) return;
    if (this.auto === "hunt" && this.huntTarget) {
      if (!this.huntTarget.alive) return;
      if (Dist(this.pos, this.huntTarget.pos) <= 1.0) {
        this.tapKey("Q");
        this.busyUntil = now + 400;
        return;
      }
      this.walk(this.huntTarget.pos, 0.8);
      return;
    }
    if (this.auto === "reset" && m.fk) {
      const panel = STATION.PanelFor(m.fk)!;
      if (Dist(this.pos, panel.Position) > 0.6) {
        this.walk(panel.Position, 0.5);
        return;
      }
      this.hold("E", 2.3);
      return;
    }
    if (this.auto === "jobs" || this.auto === "reset") {
      const mine = this.hud.Mine();
      if (!mine) return;
      let best: { id: number; kind: number; at: Vector2; d: number } | null = null;
      for (const s of STATION.JobStations) {
        if ((mine.a & (1 << s.Id)) === 0 || (mine.c & (1 << s.Id)) !== 0) continue;
        const d = Dist(this.pos, s.Position);
        if (!best || d < best.d) best = { id: s.Id, kind: s.Kind, at: s.Position, d };
      }
      if (!best) return;
      if (best.d > 0.7) {
        this.walk(best.at, 0.6);
        return;
      }
      if (m.fk === 3) return; // the sonar jam blocks jobs
      // Work it the way its kind asks, then wait for the referee's word (the next sealed rewrite).
      if (best.kind === JobKind.Hold) this.hold("E", 1.6);
      else if (best.kind === JobKind.Tap) for (let i = 0; i < 4; i++) this.hold("E", 0.1).wait(0.1);
      else this.hold("E", 1.65);
      const id = best.id;
      this.wait(0.2).then(() => {
        const after = this.hud.Mine();
        if (after && (after.c & (1 << id)) !== 0) this.jobsDone++;
      });
      this.busyUntil = now + 600;
    }
  }
}

/** Everyone steps together, STEP_MS at a time, until `done` or `maxMs`. */
export async function runCrowd(world: TestWorld, drivers: Driver[], done: () => boolean, maxMs: number): Promise<boolean> {
  const limit = world.room.now + maxMs;
  while (!done()) {
    if (world.room.now >= limit) return false;
    for (const d of drivers) if (world.clients.includes(d.c)) d.step();
    await world.run(STEP_MS);
  }
  return true;
}

export interface Table {
  world: TestWorld;
  people: FakeClient[];
  drivers: Driver[];
}

/** People open the world, join the lobby, and the first presses Start. Returns once every page shows the match. */
export async function startMatch(
  world: TestWorld,
  count: number,
  options: { attrs?: Record<string, string>; forced?: string[]; inst?: string; names?: string[] } = {},
): Promise<Table> {
  const inst = options.inst ?? "0";
  const people: FakeClient[] = [];
  for (let i = 0; i < count; i++) {
    const name = options.names?.[i] ?? `P${i + 1}`;
    people.push(world.join({ name, uid: `${inst}-u${i + 1}`, elements: [{ ...(options.attrs ?? {}), ...(inst !== "0" ? { room: inst } : {}) }] }));
  }
  await until(world, `${inst}: everyone started`, () => people.every((c) => world.started(c, inst) && world.instance(c, inst).networking.GetPlayerCount() >= count));
  await world.run(500);
  for (const c of people) {
    assert.ok(c.click(SLUG, inst, "joinButton"), `${c.name} cannot click Join`);
    await world.run(150);
  }
  await until(world, "everyone in the lobby and a referee", () => {
    const ref = referee(world, inst);
    return !!ref && match(world, people[0]!, inst).Lobby().length === count && people.every((c) => match(world, c, inst).Lobby().length === count);
  });
  const ref = referee(world, inst)!;
  if (options.forced) match(world, ref, inst).forcedSaboteurs = options.forced;
  // Everyone stands in the hub before the start.
  const drivers = people.map((c) => new Driver(world, c, inst));
  drivers.forEach((d, i) => d.place(STATION.GetSpawnPoint(i, Vector2.zero)));
  assert.ok(people[0]!.click(SLUG, inst, "startButton"));
  await until(world, "the match on every page", () => people.every((c) => match(world, c, inst).m.st === MatchState.Playing));
  // Each page opens its own sealed entry.
  await until(world, "every role delivered", () => people.every((c) => hud(world, c, inst).MyRole() !== Role.Unassigned), 10000);
  for (const d of drivers) d.step();
  return { world, people, drivers };
}

export function roleOf(world: TestWorld, d: Driver): number {
  return d.hud.MyRole();
}

/** Where a client stands, in world units, as the page last knew it. */
export function worldPos(world: TestWorld, c: FakeClient, inst = "0"): Vector3 | null {
  return world.instance(c, inst).behaviour<RuntimeHud>("hud").Input.Position;
}
