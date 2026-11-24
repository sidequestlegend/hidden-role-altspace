// Rung 1, golden vectors: the TypeScript rules against the upstream C# rule methods themselves (vectors/upstream.json,
// made by golden/Harness.cs with `npm run golden`: the methods are copied out of the upstream files unchanged and
// compiled with dotnet). Both sides play the same inputs in the same order. The only difference allowed is the one the
// port decided on: D1 (an eliminated technician's unfinished jobs leave the total), checked separately below.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Vector2 } from "../portkit/src/index.ts";
import { CreateTaskAssignmentMask, GetEjectedPlayerNumber, MatchRules, SaboteurCount, Shuffle } from "../src/BasicSpawner.ts";
import { DEFAULT_SETTINGS, MatchState, Role, Team } from "../src/GameTypes.ts";
import { Participant } from "../src/Player.ts";
import { f } from "../src/ShipMapData.ts";
import { STATION } from "../src/ShipMap.ts";
import { seeded } from "./rng.ts";

const V = JSON.parse(readFileSync(fileURLToPath(new URL("../vectors/upstream.json", import.meta.url)), "utf8")) as {
  votes: string;
  win: string;
  deal: number[][];
  cooldown: Array<[string, boolean]>;
  channels: string[];
  blocked: string;
  segmentInputs: string[][];
  segments: string;
  walks: string[][];
  nav: string[][];
  randomPoints: string[][];
  nextHatch: number[];
};

const num = (s: string) => f(Number(s));

test("G9 vote tally: every ballot set of five voters, as upstream", () => {
  const choices = [0, -1, 1, 2, 3, 4];
  let out = "";
  for (let code = 0; code < 7776; code++) {
    const votes = new Map<number, number>();
    let c = code;
    for (let voter = 1; voter <= 5; voter++) {
      const pick = choices[c % 6]!;
      c = Math.floor(c / 6);
      if (pick !== 0) votes.set(voter, pick);
    }
    const r = GetEjectedPlayerNumber(votes);
    out += r === -1 ? "S" : String(r);
  }
  assert.equal(out.length, V.votes.length);
  assert.equal(out, V.votes);
  // Spot checks of the rule in words: a tie, abstain highest, one ballot alone, no ballots.
  assert.equal(GetEjectedPlayerNumber(new Map([[1, 2], [2, 3]])), -1);
  assert.equal(GetEjectedPlayerNumber(new Map([[1, -1], [2, -1], [3, 2]])), -1);
  assert.equal(GetEjectedPlayerNumber(new Map([[1, 4]])), 4);
  assert.equal(GetEjectedPlayerNumber(new Map()), -1);
});

function winCase(roles: number[], alive: boolean[], completed: number[], pending: boolean, deadline: number, waves: number, deadJobsCount: boolean): string {
  const rules = new MatchRules({ ...DEFAULT_SETTINGS, jobWaves: 2 }, STATION, seeded(1), { deadJobsCount });
  rules.time = 100;
  rules.players = roles.map((role, i) => {
    const p = new Participant(i, `u${i}`, `P${i}`, false, Vector2.zero, 10);
    p.role = role as Role;
    p.state = MatchState.Playing;
    p.isAlive = alive[i]!;
    p.assignedTaskMask = 7;
    p.assignedTaskCount = 3;
    p.completedTaskMask = completed[i]!;
    return p;
  });
  rules.taskFailurePending = pending;
  rules.taskDeadlineEndsAt = deadline;
  rules.timedTaskWavesIssued = waves;
  const ended = rules.CheckWinCondition();
  if (!ended) return "-";
  if (rules.ended) return rules.winner === Team.Technicians ? "T" : "H";
  return "X";
}

function winCases(deadJobsCount: boolean): { out: string; inputs: Array<{ roles: number[]; alive: boolean[]; completed: number[] }> } {
  let out = "";
  const inputs: Array<{ roles: number[]; alive: boolean[]; completed: number[] }> = [];
  for (let n = 1; n <= 4; n++) {
    for (let code = 0; code < 1 << (3 * n); code++) {
      const roles: number[] = [];
      const alive: boolean[] = [];
      const completed: number[] = [];
      for (let i = 0; i < n; i++) {
        const bits = (code >> (3 * i)) & 7;
        roles.push(bits & 1 ? Role.Saboteur : Role.Technician);
        alive.push((bits & 2) !== 0);
        completed.push(bits & 4 ? 7 : 3);
      }
      for (const pending of [false, true])
        for (const deadline of [0, 150, 50])
          for (const waves of [2, 1]) {
            out += winCase(roles, alive, completed, pending, deadline, waves, deadJobsCount);
            inputs.push({ roles, alive, completed });
          }
    }
  }
  return { out, inputs };
}

test("G12 win check: every combination of roles, deaths, jobs, clock and waves, as upstream (with D1 switched back)", () => {
  const { out } = winCases(true);
  assert.equal(out.length, V.win.length);
  assert.equal(out, V.win);
});

test("D1: with the port's rule, the only different outcomes are job wins that a downed technician's unfinished jobs blocked", () => {
  const upstream = V.win;
  const { out, inputs } = winCases(false);
  let changed = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === upstream[i]) continue;
    changed++;
    const c = inputs[i]!;
    assert.equal(upstream[i], "-", "upstream found no win");
    assert.equal(out[i], "T", "the port finds the technicians' job win");
    assert.ok(c.roles.some((r, k) => r === Role.Technician && !c.alive[k] && c.completed[k] !== 7), "a downed technician had jobs left");
  }
  assert.ok(changed > 0, "the difference shows up in the table");
});

test("G10 dealing and role counts: seeded shuffles and five jobs of 22 each, as upstream; one hidden role at 4-10", () => {
  let k = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (let n = 4; n <= 10; n++) {
      const rng = seeded(seed * 100 + n);
      const order = Array.from({ length: n }, (_, i) => i + 1);
      Shuffle(order, rng);
      const masks = order.map(() => CreateTaskAssignmentMask(rng, 5, 22));
      assert.deepEqual([...order, ...masks], V.deal[k++], `seed ${seed}, ${n} players`);
      for (const m of masks) assert.equal(m.toString(2).split("").filter((b) => b === "1").length, 5);
    }
  }
  // Upstream: the hidden-role count setting is 1 and is clamped to 1..players (Spawner:1281) = 1 at every size. The port's setting, capped below half.
  for (let n = 4; n <= 10; n++) assert.equal(SaboteurCount(1, n), 1);
  assert.equal(SaboteurCount(3, 4), 1);
  assert.equal(SaboteurCount(3, 6), 2);
  assert.equal(SaboteurCount(3, 10), 3);
  assert.equal(SaboteurCount(2, 2), 1);
});

test("cooldown: the elimination is ready 10 s after the last one, as upstream", () => {
  let k = 0;
  for (const last of [-10, 0, 3.5, 7]) {
    for (const now of [0, 5, 9.99, 10, 13.5, 17, 20]) {
      const p = new Participant(0, "u", "P", false, Vector2.zero, 10);
      p.lastKillTime = f(last);
      const [remaining, ready] = V.cooldown[k++]!;
      assert.ok(Math.abs(p.KillCooldownRemaining(f(now)) - Number(remaining)) < 1e-5, `${last} ${now}`);
      assert.equal(p.IsKillReady(f(now)), ready, `${last} ${now}`);
    }
  }
});

/** The same list as Harness.ChannelCases. */
function channelCases(): Array<[number, boolean, number[], boolean[]]> {
  const out: Array<[number, boolean, number[], boolean[]]> = [];
  for (const d of [1.3, 1.34, 1.35, 1.36, 2]) out.push([0, false, [0, d], [true, true]]);
  out.push([0, false, [0, 0.675, 0.675], [true, true, true]]);
  out.push([0, false, [0, 0.7, 0.2, 0, 0.7], [true, true, false, true, true]]);
  const ticks = Array.from({ length: 40 }, () => 0.05);
  const held = ticks.map(() => true);
  out.push([0, true, ticks, held]);
  for (const presses of [3, 4, 5]) {
    const dts: number[] = [];
    const h: boolean[] = [];
    for (let i = 0; i < presses; i++) dts.push(0.1, 0.1), h.push(true, false);
    out.push([1, false, dts, h]);
  }
  out.push([1, true, ticks, held]);
  for (const d of [1.5, 1.518, 1.55, 1.65, 1.8, 1.81, 1.83, 2.19, 3.75, 4.0]) out.push([2, false, [0, d, 0], [true, true, false]]);
  out.push([2, false, [0, 1.0, 0, 0, 1.65, 0], [true, true, false, true, true, false]]);
  out.push([2, true, ticks, held]);
  return out;
}

test("G11 jobs: hold 1.35 s, four taps, release inside 70-82% of 2.2 s, and the bots' versions, as upstream", () => {
  const stationOf = { 0: 0, 1: 9, 2: 2 } as Record<number, number>;
  channelCases().forEach(([kind, bot, dts, held], k) => {
    const rules = new MatchRules({ ...DEFAULT_SETTINGS, rangeSlack: 0 }, STATION, seeded(1));
    rules.roundStarted = true;
    const station = STATION.JobStations[stationOf[kind]!]!;
    assert.equal(station.Kind, kind);
    const p = new Participant(0, "u", "P", bot, station.Position, 10);
    p.role = Role.Technician;
    p.state = MatchState.Playing;
    p.assignedTaskMask = 1 << station.Id;
    p.assignedTaskCount = 1;
    rules.players = [p];
    let result = "";
    for (let i = 0; i < dts.length; i++) {
      rules.UpdateHeldInteract(p, f(dts[i]!), held[i]!);
      if (p.completedTaskMask) {
        result = `${i} ${rules.channels.get(1)?.progress ?? -1}`;
        break;
      }
    }
    if (!result) result = `-1 ${rules.channels.get(1)?.progress ?? -1}`;
    const [wantStep, wantProgress] = V.channels[k]!.split(" ");
    const [gotStep, gotProgress] = result.split(" ");
    assert.equal(gotStep, wantStep, `case ${k}: kind ${kind}, ${dts}`);
    assert.equal(f(Number(gotProgress)), num(wantProgress!), `case ${k}: progress`);
  });
});

test("G1 walkable test on the whole map at radii 0.18 and 0.5, as upstream (and the port's grid changes nothing)", () => {
  let out = "";
  for (const r of [0.18, 0.5])
    for (let x = -75; x <= 75; x += 0.5)
      for (let y = -58; y <= 58; y += 0.5) {
        const p = new Vector2(f(x), f(y));
        const b = STATION.IsBlocked(p, f(r));
        assert.equal(b, STATION.IsBlockedSlow(p, f(r)));
        out += b ? "1" : "0";
      }
  assert.equal(out, V.blocked);
});

test("G2, G3, G5: line of reach, sliding moves and steering, as upstream", () => {
  V.segmentInputs.forEach((s, i) => {
    const [ax, ay, bx, by] = s.map(num);
    assert.equal(STATION.HasClearWalkableSegment(new Vector2(ax!, ay!), new Vector2(bx!, by!), f(0.18)) ? "1" : "0", V.segments[i], `segment ${i}`);
  });
  for (const walk of V.walks) {
    let p = new Vector2(num(walk[0]!), num(walk[1]!));
    for (let s = 2; s < walk.length; s += 4) {
      p = STATION.ResolveMove(p, new Vector2(num(walk[s]!), num(walk[s + 1]!)), f(0.5));
      assert.equal(p.x, num(walk[s + 2]!));
      assert.equal(p.y, num(walk[s + 3]!));
    }
  }
  let k = 0;
  for (const s of STATION.SpawnPoints)
    for (const j of STATION.JobStations) {
      const t = STATION.GetNavigationTarget(s, j.Position);
      const [x, y] = V.nav[k++]!.map(num);
      assert.equal(t.x, x);
      assert.equal(t.y, y);
    }
});

test("G7, G14: random start points and the hatch order, as upstream", () => {
  const rng = seeded(7);
  for (const want of V.randomPoints) {
    const p = STATION.GetRandomWalkablePosition(rng);
    assert.equal(p.x, num(want[0]!));
    assert.equal(p.y, num(want[1]!));
  }
  assert.deepEqual(STATION.Hatches.map((h) => STATION.GetNextHatch(h).Index), V.nextHatch);
});
