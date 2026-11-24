// Rung 1, the review's findings (REVIEW-FINDINGS.md, "hidden-role"): each test failed before its fix.
//
//   1  the downed and observers stay out of earshot of the living (Leave, Enter, the keep-out)
//   2  a reported position no walk could reach is not taken (the referee's own position walks at most a run)
//   3  the jobs total does not drop the moment a technician is downed (D4)
//   4  no debugging hook (the hidden-role "force") on a published page
//   6  a body whose player left cannot be reported
//   7  the rules clock never runs backwards: input and bots in one time order
//   8  the licence texts: the game's MIT notice in the built script, every text the notices name in the kit

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Vector2 } from "../portkit/src/index.ts";
import { MatchRules, type RosterEntry } from "../src/BasicSpawner.ts";
import { DEFAULT_SETTINGS, MatchState, Role, type Settings } from "../src/GameTypes.ts";
import { EARSHOT, ENTRY_POINT } from "../src/RuntimeHud.ts";
import { Dist, STATION } from "../src/ShipMap.ts";
import { Driver, match, newWorld, referee, runCrowd, SLUG, startMatch } from "./helpers.ts";
import { seeded } from "./rng.ts";

const roster = (n: number): RosterEntry[] => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, name: `P${i}`, isBot: false }));

function rules(n = 5, settings: Partial<Settings> = {}): MatchRules {
  const r = new MatchRules({ ...DEFAULT_SETTINGS, ...settings }, STATION, seeded(3));
  r.forcedSaboteurs = ["u0"];
  r.time = 1000;
  r.StartRound(roster(n));
  return r;
}

const lastMove = (d: Driver) => d.hud.moves.at(-1);

test("1: the downed and observers stay out of earshot while a match runs: Leave and Enter refused, every way back sent to the bunkroom at once", async () => {
  const world = newWorld(81);
  const t = await startMatch(world, 4, { forced: ["0-u4"] });
  const [a, victim, , sab] = t.drivers;
  await runCrowd(world, t.drivers, () => match(world, a!.c).Rel() > 11, 20000);
  const jobsLine = () => /Jobs done: \d+ \/ (\d+)/.exec(a!.hud.texts.hub)![1];
  sab!.auto = "hunt";
  sab!.huntTarget = victim!;
  // (the total as the hub board showed it while the victim was alive: read on every step until the elimination)
  let totalBefore = 0;
  const note = () => (totalBefore = Math.max(totalBefore, Number(jobsLine())));
  assert.ok(await runCrowd(world, t.drivers, () => (note(), !victim!.alive), 120000), "the saboteur caught a technician");
  sab!.auto = "none";
  assert.ok(await runCrowd(world, t.drivers, () => victim!.hud.moves.some((mv) => mv.why === "lounge"), 3000));
  await runCrowd(world, t.drivers, () => false, 200);
  assert.ok(victim!.head().y < -60, `the downed player is in the bunkroom, 70 m below: ${victim!.head()} ${JSON.stringify(victim!.hud.moves)} ${JSON.stringify(victim!.c.teleports.slice(-2))}`);
  // 3: nobody has seen the death yet: the jobs total on the hub board has not moved.
  await runCrowd(world, t.drivers, () => false, 1000);
  assert.equal(Number(jobsLine()), totalBefore, "the jobs total keeps the downed technician's jobs until the death is seen");

  // Leave (the bunkroom's board) and Enter (the boarding pad) are refused while the match runs.
  const n = victim!.hud.moves.length;
  assert.ok(victim!.c.click(SLUG, "0", "loungeLeaveButton"));
  victim!.hud.ClickStation("board", 0);
  victim!.hud.Leave();
  await runCrowd(world, t.drivers, () => false, 600);
  assert.equal(victim!.hud.moves.length, n, `no move: ${JSON.stringify(victim!.hud.moves.slice(n))}`);
  assert.match(victim!.hud.texts.lounge, /when the match ends/i);

  // However the downed get back near the station (a respawn, a portal, a walk), they are sent back at once.
  const places: Array<[string, Vector2, number]> = [
    ["the boarding pad", ENTRY_POINT, 0],
    ["30 m south of the station's south wall", new Vector2(ENTRY_POINT.x, ENTRY_POINT.y - 30), 0],
    ["on the roof", new Vector2(0, 0), 4],
    ["45 m above the Commons", new Vector2(0, 0), 45],
    ["in the Commons", new Vector2(2, 2), 0],
  ];
  for (const [label, at, lift] of places) {
    victim!.place(at, lift);
    const before = victim!.hud.moves.length;
    await runCrowd(world, t.drivers, () => victim!.hud.moves.length > before, 400);
    assert.equal(lastMove(victim!)?.why, "lounge", `${label}: back to the bunkroom within 0.4 s`);
  }
  // Out of earshot (beyond the farthest any voice carries) is left alone.
  victim!.place(new Vector2(ENTRY_POINT.x, ENTRY_POINT.y - EARSHOT - 5), 0);
  const quiet = victim!.hud.moves.length;
  await runCrowd(world, t.drivers, () => false, 1500);
  assert.equal(victim!.hud.moves.length, quiet, "out of earshot: no move");

  // An observer who arrives at the boarding pad mid-match is sent to the bunkroom too, and cannot Enter.
  const late = world.join({ name: "Late", uid: "0-u9" });
  await world.settle();
  const o = new Driver(world, late);
  o.place(ENTRY_POINT);
  t.drivers.push(o);
  assert.ok(await runCrowd(world, t.drivers, () => o.hud.moves.some((mv) => mv.why === "lounge"), 3000), "the observer is kept out");
  const m = o.hud.moves.length;
  o.hud.ClickStation("board", 0);
  await runCrowd(world, t.drivers, () => false, 600);
  assert.equal(o.hud.moves.length, m, "Enter is refused for an observer mid-match");

  // Back in the lobby, Leave works again.
  assert.ok(t.people[0]!.click(SLUG, "0", "abortButton"), "the starter stops the match");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, a!.c).m.st === MatchState.Lobby, 10000));
  await runCrowd(world, t.drivers, () => false, 1000);
  victim!.hud.Leave();
  await runCrowd(world, t.drivers, () => false, 300);
  assert.equal(lastMove(victim!)?.why, "leave");
  assert.deepEqual(world.problems(), []);
});

test("2: a reported position no walk could reach is not taken: the referee's position runs at most 4.6 m/s on open floor", async () => {
  const world = newWorld(47);
  const t = await startMatch(world, 4, { forced: ["0-u1"] });
  const [sab, victim, other] = t.drivers;
  const rules = () => match(world, referee(world)!).rules!;
  // The victim works in the room farthest from the saboteur.
  const far = STATION.JobStations.slice().sort((x, y) => Dist(sab!.pos, y.Position) - Dist(sab!.pos, x.Position))[0]!;
  victim!.go(far.Position, 0.4);
  assert.ok(await runCrowd(world, t.drivers, () => victim!.idle, 120000));
  await runCrowd(world, t.drivers, () => match(world, t.people[0]!).Rel() > 11, 20000);
  const from = rules().players[sab!.slot]!.position.clone();
  const route = Dist(from, victim!.pos);
  assert.ok(route > 30, `the victim is far away (${route.toFixed(1)} m)`);
  // The saboteur's head appears next to the victim and strikes: refused now and 2.5 s later (the old rule trusted it after 1.5 s).
  const t0 = world.room.now;
  sab!.place(victim!.pos.add(new Vector2(0.6, 0)));
  sab!.tapKey("Q");
  await runCrowd(world, t.drivers, () => false, 2500);
  sab!.tapKey("Q");
  await runCrowd(world, t.drivers, () => false, 1000);
  assert.equal(victim!.alive, true, "the elimination from a position no walk could reach was refused");
  const seen = rules().players[sab!.slot]!.position;
  const elapsed = (world.room.now - t0) / 1000;
  assert.ok(Dist(from, seen) <= 4.6 * elapsed + 8.5 + 0.01, `the referee's position moved ${Dist(from, seen).toFixed(1)} m in ${elapsed.toFixed(1)} s`);
  assert.ok(Dist(seen, sab!.pos) > 5, "and is not where the page claims");
  assert.equal(STATION.IsBlocked(seen, 0), false, "it stays on open floor");
  // It walks there at a run along open floor; then it is where the page says (what a modified page can still do: move as a runner would).
  assert.ok(await runCrowd(world, t.drivers, () => Dist(rules().players[sab!.slot]!.position, sab!.pos) < 0.2, 60000), "the referee's position arrives");
  sab!.tapKey("Q");
  assert.ok(await runCrowd(world, t.drivers, () => !victim!.alive, 3000), "allowed once a run could have got there");

  // A position inside a prop is not taken either: a body cannot stand there.
  const prop = STATION.Obstacles.find((o) => STATION.ObstacleNames[STATION.Obstacles.indexOf(o)] !== "" && o.width > 1.2 && o.height > 1.2)!;
  const inside = new Vector2(prop.center.x, prop.center.y);
  other!.go(STATION.ClampToWalkable(new Vector2(prop.xMin - 1.5, prop.center.y), 0.3), 0.3);
  assert.ok(await runCrowd(world, t.drivers, () => other!.idle, 120000));
  other!.place(inside);
  await runCrowd(world, t.drivers, () => false, 2500);
  assert.equal(STATION.IsBlocked(rules().players[other!.slot]!.position, 0), false, "the referee's position is never inside a prop");

  // A VR teleport hop (up to 8 m along a clear line) is taken at once: from the Commons.
  other!.go(new Vector2(-8, -6), 0.2);
  assert.ok(await runCrowd(world, t.drivers, () => other!.idle, 120000));
  await runCrowd(world, t.drivers, () => Dist(rules().players[other!.slot]!.position, other!.pos) < 0.05, 5000);
  const start = rules().players[other!.slot]!.position.clone();
  let hop: Vector2 | null = null;
  for (let k = 0; k < 32 && !hop; k++) {
    const angle = (k * Math.PI) / 16;
    const to = start.add(new Vector2(Math.cos(angle) * 7, Math.sin(angle) * 7));
    if (!STATION.IsBlocked(to, 0.3) && STATION.HasClearWalkableSegment(start, to, 0.3)) hop = to;
  }
  assert.ok(hop, "a clear 7 m line from there");
  await runCrowd(world, t.drivers, () => false, 2500);
  other!.place(hop!);
  assert.ok(await runCrowd(world, t.drivers, () => Dist(rules().players[other!.slot]!.position, hop!) < 0.05, 1500), "the hop is taken within a step");
  assert.deepEqual(world.problems(), []);
});

test("3: the published jobs total keeps a downed technician's jobs until the death is seen, waves included (D4); the win check is D1's", () => {
  const r = rules(5);
  const before = r.GetPublicTaskProgress().total;
  assert.equal(before, r.GetCrewTaskProgress().total);
  r.players[1]!.Kill();
  assert.equal(r.GetPublicTaskProgress().total, before, "unchanged at the elimination");
  assert.ok(r.GetCrewTaskProgress().total < before, "the win check drops the unfinished jobs at once (D1)");
  r.time = r.startedAt + 30;
  r.UpdateTimers();
  assert.equal(r.timedTaskWavesIssued, 1);
  assert.equal(r.GetPublicTaskProgress().total, before + 4, "a wave counts the unseen technician as well");
  r.StartMeeting(r.players[2]!, r.players[1]!);
  assert.deepEqual(r.GetPublicTaskProgress(), r.GetCrewTaskProgress(), "once seen, the total is D1's");
});

test("4: a published page exposes no debugging hook (the referee's force), a test page does", async () => {
  const world = newWorld(83);
  const published = world.join({ name: "Pub", uid: "0-u1" });
  const testPage = world.join({ name: "Test", uid: "0-u2" });
  (testPage.env.win as { __pk1_debug?: boolean }).__pk1_debug = true;
  await world.settle();
  const registry = (c: typeof published) => (c.env.win as { __pk1: { debug: Record<string, Record<string, unknown>> } }).__pk1.debug;
  assert.deepEqual(Object.keys(registry(published)), [], "nothing on the published page");
  assert.equal(typeof registry(testPage)[`${SLUG}:0`]?.force, "function", "the test page has the hooks");
});

test("6: a body whose player left the world can no longer be reported (upstream despawned it)", () => {
  const r = rules(5);
  const [, a, b, c] = r.players;
  a!.position = new Vector2(-5, 0);
  b!.position = new Vector2(-4, 0);
  c!.position = new Vector2(-4.5, 0.5);
  a!.Kill();
  r.PlayerLeft(a!.slot);
  assert.equal(a!.isReportableBody, false);
  assert.equal(a!.bodyPosition, null, "no body left to draw");
  assert.equal(r.TryUseReport(b!), false, "nothing to report");
  // A body whose player is still in the world can be.
  c!.Kill();
  assert.equal(r.TryUseReport(b!), true);
});

test("7: the rules clock never runs backwards: an elimination just before a bot's muster counts, and every event is in time order", async () => {
  const world = newWorld(89);
  const t = await startMatch(world, 3, { attrs: { bots: "1" }, forced: ["0-u1"] });
  const [sab, victim] = t.drivers;
  victim!.go(new Vector2(-6, -4), 0.3);
  assert.ok(await runCrowd(world, t.drivers, () => victim!.idle, 60000));
  sab!.go(new Vector2(-5.2, -4), 0.2);
  assert.ok(await runCrowd(world, t.drivers, () => sab!.idle, 60000));
  await runCrowd(world, t.drivers, () => match(world, t.people[0]!).Rel() > 11, 20000);
  const ref = match(world, referee(world)!);
  const rules = ref.rules!;
  const bot = rules.players.find((p) => p.isBot)!;
  // The bot calls a muster 0.1 s after the saboteur's key goes down (it stands at the post when it does).
  let qAt = Infinity;
  let fired = -1;
  rules.bots.UpdateBots = () => {
    if (fired < 0 && rules.time >= qAt + 0.1) {
      fired = rules.time;
      bot.position = STATION.MeetingPoint.clone();
      rules.TryCallEmergencyMeeting(bot);
    }
  };
  qAt = match(world, sab!.c).Now;
  sab!.tapKey("Q");
  assert.ok(await runCrowd(world, t.drivers, () => fired >= 0 && match(world, t.people[0]!).m.st === MatchState.Muster, 5000), "the bot's muster began");
  const h = ref.history.slice(ref.history.findIndex((e) => e.kind === "start"));
  const kill = h.find((e) => e.kind === "eliminate");
  assert.ok(kill, `the elimination at ${(qAt - rules.startedAt).toFixed(2)} s counts though the bot's muster at ${(fired - rules.startedAt).toFixed(2)} s was due first on the referee's page: ${JSON.stringify(h.map((e) => [e.kind, +(e.t - rules.startedAt).toFixed(2)]))}`);
  assert.ok(Math.abs(kill!.t - qAt) < 0.02, `applied at the time it happened (${(kill!.t - qAt).toFixed(3)} s after the press)`);
  assert.equal(victim!.hud.MyRole(), Role.Technician);
  for (let i = 1; i < h.length; i++) assert.ok(h[i]!.t >= h[i - 1]!.t, `events in time order: ${h[i - 1]!.kind} at ${h[i - 1]!.t}, then ${h[i]!.kind} at ${h[i]!.t}`);
  assert.deepEqual(world.problems(), []);
});

test("8: the built script carries the game's MIT notice and portkit's; the kit's notices name every font copyright and ship every licence text", () => {
  const here = fileURLToPath(new URL("..", import.meta.url));
  const out = mkdtempSync(join(tmpdir(), "hr-build-"));
  try {
    execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "portkit/tools/build.ts", "--game", ".", "--out", out], { cwd: here, stdio: "pipe" });
    const script = readFileSync(join(out, `pk-${SLUG}.js`), "utf8");
    const head = script.slice(0, script.indexOf("*/", script.indexOf("The portkit runtime")) + 2);
    assert.match(head, /Copyright \(c\) 2026 chocowriter/, "the upstream copyright line");
    assert.match(head, /Copyright \(c\) 2026 the authors of this port/);
    assert.match(head, /Copyright \(c\) 2026 the portkit authors/);
    assert.equal(head.split("Permission is hereby granted").length - 1, 2, "both MIT notices in full, in the banner");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  const kit = join(here, "..", "Assets", "Kit");
  const notices = readFileSync(join(kit, "THIRD-PARTY-NOTICES.md"), "utf8");
  assert.match(notices, /Copyright \(c\) 2012 Red Hat, Inc\./, "Liberation Sans' copyright line");
  assert.match(notices, /Digitized data copyright \(c\) 2010 Google Corporation/);
  for (const name of notices.match(/Licenses\/[\w.-]+\.txt/g) ?? []) assert.ok(existsSync(join(kit, name)), `${name} is in the kit`);
  assert.ok(existsSync(join(here, "..", "Assets", "TextMesh Pro", "Fonts", "LiberationSans - OFL.txt")), "the OFL text portkit packs with the font");
  assert.equal(readFileSync(join(here, "..", "THIRD-PARTY-NOTICES.md"), "utf8"), notices, "the project's copy of the notices is the kit's");
});
