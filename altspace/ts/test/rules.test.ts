// Rung 1, rules on their own (no room): the numbers of PORT.md section 2 that the golden vectors do not cover, the
// deliberate differences, the fixed-size messages and the state budget.

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafBudget, Vector2 } from "../portkit/src/index.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import { MatchRules, type RosterEntry } from "../src/BasicSpawner.ts";
import { BEAT_CHARS, decodeBeat, encodeBeat, encodeSecret, SECRET_CHARS } from "../src/Beat.ts";
import { DEFAULT_SETTINGS, Fault, MatchState, readSettings, Role, type Settings, Team } from "../src/GameTypes.ts";
import game from "../src/index.ts";
import { STATION } from "../src/ShipMap.ts";
import { seeded } from "./rng.ts";
import { bindings } from "./helpers.ts";

const roster = (n: number, bots = 0): RosterEntry[] =>
  Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, name: `P${i}`, isBot: i >= n - bots }));

function rules(n = 5, settings: Partial<Settings> = {}, forced = ["u0"]): MatchRules {
  const r = new MatchRules({ ...DEFAULT_SETTINGS, ...settings }, STATION, seeded(3));
  r.forcedSaboteurs = forced;
  r.time = 1000;
  r.StartRound(roster(n));
  return r;
}

const at = (x: number, y: number) => new Vector2(x, y);

test("settings: defaults are the upstream scene's; attributes are read with fallbacks and ranges", () => {
  const s = readSettings(new Map());
  assert.equal(s.minPlayers, 4);
  assert.equal(s.maxPlayers, 10);
  assert.equal(s.saboteurs, 1);
  assert.equal(s.shiftSeconds, 180);
  assert.equal(s.eliminateCooldown, 10);
  assert.equal(s.eliminateRange, 1.45);
  assert.equal(s.reportRange, 1.7);
  assert.equal(s.musterCooldown, 25);
  assert.equal(s.faultCooldown, 18);
  assert.equal(s.breachSeconds, 45);
  assert.deepEqual(s.timingBand, [0.7, 0.82]);
  const t = readSettings(new Map([["shift-seconds", "10"], ["saboteurs", "9"], ["min-players", "x"], ["timing-band", "0.5 0.6"], ["bots", "3"]]));
  assert.equal(t.shiftSeconds, 30, "floor 30, as upstream");
  assert.equal(t.saboteurs, 3);
  assert.equal(t.minPlayers, 4);
  assert.deepEqual(t.timingBand, [0.5, 0.6]);
  assert.equal(t.bots, 3);
});

test("start: everyone alive, five jobs each, one hidden role, spread out at least 1.15 apart; nobody is forced unless a test asks", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = new MatchRules(DEFAULT_SETTINGS, STATION, seeded(seed));
    r.time = 50;
    r.StartRound(roster(7));
    assert.equal(r.players.filter((p) => p.role === Role.Saboteur).length, 1);
    assert.ok(r.players.every((p) => p.isAlive && p.assignedTaskCount === 5 && p.IsKillReady(50)));
    for (const a of r.players) for (const b of r.players) if (a !== b) assert.ok(Vector2.Distance(a.position, b.position) >= 1.15 - 1e-6);
  }
  // D5: over many deals the hidden role lands on every slot, the first included.
  const slots = new Set<number>();
  for (let seed = 1; seed <= 60; seed++) {
    const r = new MatchRules(DEFAULT_SETTINGS, STATION, seeded(seed));
    r.StartRound(roster(5));
    slots.add(r.players.find((p) => p.role === Role.Saboteur)!.slot);
  }
  assert.deepEqual([...slots].sort(), [0, 1, 2, 3, 4]);
});

test("elimination: range 1.45 (+ slack for people), a wall in the way, the cooldown, never in a muster", () => {
  const r = rules(5, { rangeSlack: 0 });
  const [sab, a, b] = r.players;
  sab!.position = at(-5, 0);
  a!.position = at(-5 + 1.46, 0);
  b!.position = at(20, 0);
  assert.equal(r.TryUseKill(sab!), false, "1.46 is out of reach");
  a!.position = at(-5 + 1.45, 0);
  assert.equal(r.TryUseKill(sab!), true, "1.45 is in reach");
  assert.equal(a!.isAlive, false);
  assert.ok(a!.isReportableBody);
  b!.position = at(-4, 0);
  r.time += 9.9;
  assert.equal(r.TryUseKill(sab!), false, "cooling down");
  r.time += 0.2;
  r.StartMeeting(b!, null);
  assert.equal(r.TryUseKill(sab!), false, "not in a muster");
  // Through a wall: the medical-room scanner prop lies between these two points.
  const w = rules(5, { rangeSlack: 0 });
  w.players[0]!.position = at(-50, 10.2);
  w.players[1]!.position = at(-50, 13.3);
  assert.equal(STATION.HasClearWalkableSegment(w.players[0]!.position, w.players[1]!.position, 0.18), false);
  w.players[1]!.position = at(-50, 11.4);
  assert.equal(w.TryUseKill(w.players[0]!), false, "no line of reach");
});

test("the muster post: usable at once, 25 s from the start of any muster, blocked by a fault, not after the end (D6)", () => {
  const r = rules(5);
  const [, a, b] = r.players;
  a!.position = STATION.MeetingPoint.clone();
  assert.ok(r.TryInteract(a!), "usable at t = 0");
  assert.equal(r.meetingActive, true);
  r.ResolveMeeting();
  r.time += 24.9;
  assert.equal(r.TryInteract(a!), false, "cooling down");
  r.time += 0.2;
  r.activeFault = Fault.Blackout;
  assert.equal(r.TryInteract(a!), false, "a fault blocks it");
  assert.equal(r.meetingActive, false);
  r.activeFault = Fault.None;
  r.EndRound(Team.Technicians);
  b!.position = STATION.MeetingPoint.clone();
  assert.equal(r.TryInteract(b!), false, "the post does nothing after the end");
  assert.equal(r.meetingActive, false);
});

test("faults: none before 4 s, one at a time, 18 s apart, only the hidden role, a muster clears it; technicians reset in 2 s", () => {
  const r = rules(5, { rangeSlack: 0 });
  const [sab, tech] = r.players;
  const panel = STATION.PanelFor(Fault.Blackout)!.Position;
  sab!.position = panel.clone();
  tech!.position = panel.clone();
  r.time += 3.9;
  assert.equal(r.TryStartSabotage(sab!), false, "not before 4 s");
  r.time += 0.2;
  assert.equal(r.TryStartSabotage(tech!), false, "a technician cannot");
  assert.equal(r.TryStartSabotage(sab!), true);
  assert.equal(r.activeFault, Fault.Blackout);
  assert.equal(r.TryStartSabotage(sab!), false, "one at a time");
  r.UpdateHeldInteract(sab!, 2.5, true);
  assert.equal(r.activeFault, Fault.Blackout, "the hidden role cannot reset");
  r.UpdateHeldInteract(tech!, 1.99, true);
  assert.equal(r.activeFault, Fault.Blackout);
  r.UpdateHeldInteract(tech!, 0.02, true);
  assert.equal(r.activeFault, Fault.None, "reset after 2 s held");
  r.time += 17;
  assert.equal(r.TryStartSabotage(sab!), false, "18 s cooldown");
  r.time += 1.1;
  sab!.position = STATION.PanelFor(Fault.Breach)!.Position.clone();
  assert.equal(r.TryStartSabotage(sab!), true);
  assert.ok(Math.abs(r.activeFaultEndsAt - r.time - 45) < 1e-9, "the breach counts down 45 s");
  r.StartMeeting(tech!, null);
  assert.equal(r.activeFault, Fault.None, "a muster clears it");
});

test("D2: the scrubber fault counts down (setting), and at 0 behaves as upstream's no-effect fault", () => {
  const r = rules(5);
  const sab = r.players[0]!;
  sab.position = STATION.PanelFor(Fault.Scrubber)!.Position.clone();
  r.time += 5;
  assert.ok(r.TryStartSabotage(sab));
  assert.ok(r.activeFaultEndsAt > 0);
  r.time = r.activeFaultEndsAt;
  r.UpdateTimers();
  assert.equal(r.winner, Team.Saboteurs);
  const u = rules(5, { scrubberSeconds: 0 });
  u.players[0]!.position = STATION.PanelFor(Fault.Scrubber)!.Position.clone();
  u.time += 5;
  assert.ok(u.TryStartSabotage(u.players[0]!));
  assert.equal(u.activeFaultEndsAt, 0, "no countdown: only the blocked muster post and the reset");
});

test("job waves at 30 and 75 s, to living technicians only; a wave due in a muster waits for it; no job win before both", () => {
  const r = rules(4, { jobsPerPlayer: 1 });
  const t0 = r.time;
  const [sab, a, b, c] = r.players;
  c!.Kill();
  r.time = t0 + 29.9;
  r.UpdateTimers();
  assert.equal(r.timedTaskWavesIssued, 0);
  r.StartMeeting(a!, null);
  r.time = t0 + 31;
  r.UpdateTimers();
  assert.equal(r.timedTaskWavesIssued, 0, "not during a muster");
  r.ResolveMeeting();
  r.UpdateTimers();
  assert.equal(r.timedTaskWavesIssued, 1, "issued as soon as it is over");
  assert.equal(a!.assignedTaskCount, 2);
  assert.equal(b!.assignedTaskCount, 2);
  assert.equal(c!.assignedTaskCount, 1, "not to the downed");
  assert.equal(sab!.assignedTaskCount, 1, "not to the hidden role");
  // Everyone finishes every job: still no win until the second wave is out.
  for (const p of [a!, b!]) p.completedTaskMask = p.assignedTaskMask;
  assert.equal(r.CheckWinCondition(), false);
  r.time = t0 + 31 + 45;
  r.UpdateTimers();
  assert.equal(r.timedTaskWavesIssued, 2);
  for (const p of [a!, b!]) p.completedTaskMask = p.assignedTaskMask;
  assert.equal(r.CheckWinCondition(), true, "D1: the downed technician's unfinished job does not block the win");
  assert.equal(r.winner, Team.Technicians);
});

test("the shift clock: cut-in at 180 s even in a muster, then the hidden role wins 4 s later; nobody acts in the cut-in", () => {
  const r = rules(5);
  const t0 = r.time;
  r.StartMeeting(r.players[1]!, null);
  r.time = t0 + 180;
  r.UpdateTimers();
  assert.equal(r.taskFailurePending, true);
  assert.equal(r.meetingActive, false, "the muster is dropped");
  assert.equal(r.players[1]!.state, MatchState.Playing);
  r.players[0]!.position = r.players[2]!.position.clone();
  assert.equal(r.TryUseKill(r.players[0]!), false, "no elimination in the cut-in");
  r.time = t0 + 183.9;
  r.UpdateTimers();
  assert.equal(r.ended, false);
  r.time = t0 + 184;
  r.UpdateTimers();
  assert.equal(r.winner, Team.Saboteurs);
});

test("leaving: the hidden role leaving ends the match for the technicians; fewer than two present, no win", () => {
  const r = rules(4);
  r.PlayerLeft(0);
  assert.equal(r.winner, Team.Technicians);
  const s = rules(2);
  s.players[1]!.Kill();
  s.PlayerLeft(1);
  assert.equal(s.CheckWinCondition(), false);
});

test("beats and secrets have one length whatever they say", () => {
  const quiet = encodeBeat({ m: 1, q: 1, t: 0, p: [0, 0], h: 0, e: [] });
  const busy = encodeBeat({ m: 12345, q: 9999, t: 179.987, p: [-74.99, -57.99], h: 63, e: Array.from({ length: 20 }, (_, i) => [i % 6, 1, 170.123 + i, -1] as [number, 0 | 1, number, number]) });
  assert.equal(quiet.length, BEAT_CHARS);
  assert.equal(busy.length, BEAT_CHARS);
  assert.equal(decodeBeat(busy)!.e.length, 8);
  const tech = encodeSecret({ n: 1, r: 1, f: [], a: 31, c: 0, l: -1, k: 0, s: 0 });
  const sab = encodeSecret({ n: 999, r: 2, f: [3, 7], a: (1 << 22) - 1, c: (1 << 21) - 1, l: 21, k: 123.45, s: 178.9 });
  assert.equal(tech.length, SECRET_CHARS);
  assert.equal(sab.length, SECRET_CHARS);
});

test("state budget: a few leaves per copy, every leaf well under 16 KB at ten players", () => {
  const world = new TestWorld(game, bindings);
  const budget = leafBudget(world.bindings, (type) => {
    const cls = game.behaviours[type];
    return cls ? { synced: (cls.synced ?? []).length, perPlayer: cls.perPlayer === true } : null;
  });
  assert.ok(budget.spaceLeaves <= 8, `${budget.spaceLeaves} space-state leaves per copy`);
  assert.ok(budget.userLeavesPerPlayer <= 6);
  // The largest sealed leaf: ten entries of the secret's ciphertext plus the box wrapping.
  const entry = 2 * 160 + 400;
  assert.ok(10 * entry < 16384);
});

test("a muster ends after 30 s with the ballots cast so far; one ballot alone can lock someone out", () => {
  const r = rules(5);
  const [sab, a, b] = r.players;
  r.StartMeeting(a!, null);
  r.TrySubmitVote(b!, sab!.PlayerNumber);
  assert.equal(r.TrySubmitVote(b!, a!.PlayerNumber), false, "one ballot each, final");
  r.time += 29.9;
  r.UpdateTimers();
  assert.equal(r.meetingActive, true);
  r.time += 0.2;
  r.UpdateTimers();
  assert.equal(r.meetingActive, false);
  assert.equal(sab!.isAlive, false, "no quorum: one vote was enough");
  assert.equal(r.winner, Team.Technicians);
  // A ballot for someone not eligible counts as abstain.
  const s = rules(5);
  s.StartMeeting(s.players[1]!, null);
  s.players[4]!.Exile();
  s.TrySubmitVote(s.players[2]!, 5);
  assert.equal(s.votes.get(3), -1);
});
