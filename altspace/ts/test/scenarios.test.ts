// Rung 1, scenarios: whole matches on the fake room with real clients (each its own page, its own keys and head)
// and, where a test says so, the game's own bots run by the referee. Virtual time: a 184 s match takes a few seconds.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector2 } from "../portkit/src/index.ts";
import { Fault, MatchState, Role, Team } from "../src/GameTypes.ts";
import { RingPosition } from "../src/Match.ts";
import { Dist, STATION } from "../src/ShipMap.ts";
import { dealer, Driver, hud, match, newWorld, referee, runCrowd, SLUG, startMatch, until, waitState } from "./helpers.ts";

/** True once every page in the world shows the result (the Ended state lasts 4.5 s). */
const over = (world: ReturnType<typeof newWorld>, _c?: unknown, inst = "0") => () =>
  world.clients.filter((c) => world.started(c, inst)).every((c) => match(world, c, inst).m.st === MatchState.Ended);

function history(world: ReturnType<typeof newWorld>) {
  const ref = referee(world)!;
  const h = match(world, ref).history;
  const start = [...h].reverse().find((e) => e.kind === "start")!;
  return h.slice(h.indexOf(start)).map((e) => ({ ...e, at: Math.round((e.t - start.t) * 100) / 100 }));
}

test("a full match won by jobs: three people and a bot work their jobs; the saboteur waits", async () => {
  const world = newWorld(3);
  const t = await startMatch(world, 3, { attrs: { bots: "1", "jobs-per-player": "2", "job-waves": "1" }, forced: ["0-u1"] });
  const [sab, a, b] = t.drivers;
  assert.equal(sab!.role, Role.Saboteur);
  assert.equal(a!.role, Role.Technician);
  assert.equal(match(world, t.people[0]!).m.sl[3]!.b, 1, "slot 4 is a bot");
  a!.auto = "jobs";
  b!.auto = "jobs";
  assert.ok(await runCrowd(world, t.drivers, over(world, t.people[0]!), 200000), "the match ended");
  const m = match(world, t.people[1]!).m;
  assert.equal(m.w, Team.Technicians);
  assert.equal(m.cd, m.ct, "every job done");
  const h = history(world);
  const end = h.find((e) => e.kind === "end")!;
  assert.ok(end.at >= 30 && end.at < 180, `won by jobs after the wave and before the shift clock (at ${end.at})`);
  assert.ok(h.some((e) => e.kind === "job" && e.actor === 3), "the bot did jobs too");
  assert.ok(!h.some((e) => e.kind === "eliminate" || e.kind === "cutin"));
  // Everyone's page shows the result and every role.
  for (const c of t.people) assert.match(hud(world, c).texts.hub, /The technicians win/);
  assert.deepEqual(m.ro, [Role.Saboteur, Role.Technician, Role.Technician, Role.Technician]);
  assert.deepEqual(world.problems(), []);
});

test("a full match won by eliminations: the saboteur catches two technicians; a bot is the last", async () => {
  const world = newWorld(5);
  const t = await startMatch(world, 3, { attrs: { bots: "1" }, forced: ["0-u1"] });
  const [sab, a, b] = t.drivers;
  sab!.auto = "hunt";
  sab!.huntTarget = a!;
  const ok = await runCrowd(world, t.drivers, () => !a!.alive || over(world, t.people[0]!)(), 120000);
  assert.ok(ok && !a!.alive, "the first technician is down");
  // The victim's own page sends them to the lounge, out of the station.
  await runCrowd(world, t.drivers, () => hud(world, a!.c).moves.some((mv) => mv.why === "lounge"), 3000);
  assert.ok(hud(world, a!.c).moves.some((mv) => mv.why === "lounge"));
  assert.match(hud(world, a!.c).texts.panel, /You are out/);
  // D4: the others' roster does not show the death until it is announced.
  assert.match(hud(world, b!.c).texts.hub, /P2: on shift/);
  sab!.huntTarget = b!;
  assert.ok(await runCrowd(world, t.drivers, over(world, t.people[0]!), 120000));
  const m = match(world, t.people[2]!).m;
  assert.equal(m.w, Team.Saboteurs, "one saboteur against one technician: parity");
  const kills = history(world).filter((e) => e.kind === "eliminate");
  assert.equal(kills.length, 2);
  assert.ok(kills[1]!.at - kills[0]!.at >= 10, "the second elimination waited out the 10 s cooldown");
  assert.deepEqual(world.problems(), []);
});

test("a full match won by the vote: a muster at the post, everyone at the ring, the saboteur locked out", async () => {
  const world = newWorld(7);
  const t = await startMatch(world, 4, { forced: ["0-u4"] });
  const [caller, , , sab] = t.drivers;
  caller!.go(STATION.MeetingPoint, 0.3).press("E");
  assert.ok(await runCrowd(world, t.drivers, () => t.people.every((c) => match(world, c).m.st === MatchState.Muster), 60000), "the muster began");
  await runCrowd(world, t.drivers, () => false, 1000);
  const m = match(world, t.people[0]!).m;
  assert.equal(m.mr, 0, "called by the first player");
  assert.equal(m.mb, -1, "no body: a muster from the post");
  assert.deepEqual(m.ring, [0, 1, 2, 3]);
  for (const d of t.drivers) {
    const ring = hud(world, d.c).moves.filter((mv) => mv.why === "ring");
    assert.equal(ring.length, 1, `${d.name} went to the ring`);
    assert.ok(Dist(ring[0]!.at, RingPosition(m.ring.indexOf(d.slot), m.ring.length)) < 0.01);
    assert.equal(d.c.abilities.get("Move"), false, `${d.name} stands still in the muster`);
  }
  assert.match(hud(world, t.people[1]!).texts.muster, /MUSTER called by P1/);
  // The three technicians vote for the fourth player; the saboteur abstains.
  for (const d of t.drivers.slice(0, 3)) assert.ok(d.c.click(SLUG, "0", `vote${sab!.slot}`));
  assert.ok(sab!.c.click(SLUG, "0", "abstainButton"));
  assert.ok(await runCrowd(world, t.drivers, over(world, t.people[0]!), 40000));
  const after = match(world, t.people[0]!).m;
  assert.equal(after.w, Team.Technicians);
  assert.equal(after.al[sab!.slot], 0, "the saboteur was locked out");
  assert.equal(after.bd[sab!.slot], 0, "with no body");
  // Upstream shows the round result over the lock-out notice when the vote ends the match; the roles are all shown.
  assert.equal(after.an[0], 2);
  assert.deepEqual(after.ro, [Role.Technician, Role.Technician, Role.Technician, Role.Saboteur]);
  const result = history(world).find((e) => e.kind === "result")!;
  assert.equal(result.target, sab!.slot);
  assert.ok(result.at - history(world).find((e) => e.kind === "muster")!.at < 30, "resolved early: everyone had voted");
  assert.deepEqual(world.problems(), []);
});

test("a full match won by the shift clock: cut-in at 180 s, the saboteurs win at 184 s (bots at work, people idle)", async () => {
  const world = newWorld(11);
  const t = await startMatch(world, 3, { attrs: { bots: "2" }, forced: ["0-u1"] });
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[1]!).m.ci > 0, 200000));
  // Everyone stands still for the cut-in.
  await runCrowd(world, t.drivers, () => false, 500);
  for (const d of t.drivers) assert.equal(d.c.abilities.get("Move"), false);
  assert.match(hud(world, t.people[1]!).texts.hub, /SHIFT OVER/);
  assert.ok(await runCrowd(world, t.drivers, over(world, t.people[0]!), 10000));
  const h = history(world);
  const cut = h.find((e) => e.kind === "cutin")!;
  const end = h.find((e) => e.kind === "end")!;
  assert.ok(cut.at >= 180 && cut.at < 180.35, `cut-in at ${cut.at}`);
  assert.ok(end.at >= 184 && end.at < 184.35, `end at ${end.at}`);
  assert.equal(match(world, t.people[2]!).m.w, Team.Saboteurs);
  assert.equal(h.filter((e) => e.kind === "wave").length, 2, "both job waves, at 30 and 75");
  const waves = h.filter((e) => e.kind === "wave").map((e) => e.at);
  assert.ok(Math.abs(waves[0]! - 30) < 0.3 && Math.abs(waves[1]! - 75) < 0.3, `waves at ${waves}`);
  assert.ok(h.some((e) => e.kind === "job" && (e.actor === 3 || e.actor === 4)), "the bots worked");
  // After the result everyone is back in the lobby, free to move, at the hub.
  await waitState(world, MatchState.Lobby, "0", 10000);
  await runCrowd(world, t.drivers, () => false, 500);
  for (const d of t.drivers) {
    assert.notEqual(d.c.abilities.get("Move"), false);
    assert.equal(hud(world, d.c).moves.at(-1)!.why, "hub");
  }
  assert.match(hud(world, t.people[0]!).texts.hub, /Last match: The saboteurs won/);
  assert.deepEqual(world.problems(), []);
});

test("a report and a muster: the alarm on a body, the ring, abstentions, the way back, the body stays", async () => {
  const world = newWorld(13);
  const t = await startMatch(world, 4, { forced: ["0-u1"] });
  const [sab, victim, finder] = t.drivers;
  // The victim and the finder meet in the commons; the saboteur comes along and strikes.
  const spot = new Vector2(-6, -4);
  victim!.go(spot, 0.3);
  finder!.go(spot.add(new Vector2(5, 0)), 0.3);
  sab!.auto = "hunt";
  sab!.huntTarget = victim!;
  assert.ok(await runCrowd(world, t.drivers, () => !victim!.alive, 120000));
  sab!.auto = "none";
  const body = match(world, t.people[0]!).m.bd[victim!.slot] as number[];
  assert.ok(body, "the body lies where they fell");
  const finderWas = finder!.pos.clone();
  finder!.go(new Vector2(body[0]!, body[1]!), 1.0).press("R");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[2]!).m.st === MatchState.Muster, 60000));
  let m = match(world, t.people[2]!).m;
  assert.equal(m.mr, finder!.slot);
  assert.equal(m.mb, victim!.slot);
  assert.equal(m.rp[victim!.slot], 0, "a reported body is not reportable again");
  assert.match(hud(world, t.people[3]!).texts.muster, /P3 sounded the alarm over P2/);
  assert.match(hud(world, t.people[3]!).texts.hub, /P2: down/, "at a muster everyone sees who is down (D4)");
  assert.ok(!m.ring.includes(victim!.slot), "the downed stay in the lounge");
  await runCrowd(world, t.drivers, () => false, 500);
  assert.equal(hud(world, victim!.c).moves.filter((mv) => mv.why === "ring").length, 0);
  // Everyone abstains: nobody is locked out, the match goes on.
  for (const d of [sab!, finder!, t.drivers[3]!]) assert.ok(d.c.click(SLUG, "0", "abstainButton"));
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.st === MatchState.Playing, 40000));
  m = match(world, t.people[0]!).m;
  assert.equal(m.an[0], 1);
  assert.equal(m.an[1], -1, "nobody locked out");
  await runCrowd(world, t.drivers, () => false, 600);
  const back = hud(world, finder!.c).moves.at(-1)!;
  assert.equal(back.why, "return");
  assert.ok(Dist(back.at, finder!.pos) < 0.01 && Dist(back.at, finderWas) > 0, "sent back to where they stood");
  assert.notEqual(finder!.c.abilities.get("Move"), false, "free to move again");
  assert.ok(match(world, t.people[0]!).m.bd[victim!.slot], "the body stays until the next match");
  // The muster post is cooling down for 25 s from the start of the muster.
  const er = m.er - (match(world, t.people[0]!).Rel());
  assert.ok(er > 0 && er <= 25, `next muster in ${er}`);
  assert.deepEqual(world.problems(), []);
});

test("faults: blackout on living technicians only, a reset at the panel, the jam blocks jobs, an unreset breach wins", async () => {
  const world = newWorld(17);
  const t = await startMatch(world, 4, { forced: ["0-u1"] });
  const [sab, tech] = t.drivers;
  const panel = (f: number) => STATION.PanelFor(f)!.Position;
  // Blackout (the vision fault), allowed from 4 s.
  sab!.go(panel(Fault.Blackout), 0.5).wait(1).press("F");
  tech!.go(panel(Fault.Blackout).add(new Vector2(0.6, 0.4)), 0.3);
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[1]!).m.fk === Fault.Blackout, 60000));
  const startedAt = history(world).find((e) => e.kind === "fault")!.at;
  assert.ok(startedAt >= 4, "not before 4 s");
  await runCrowd(world, t.drivers, () => false, 300);
  assert.equal(hud(world, tech!.c).BlackoutOn, true, "a living technician's view closes in");
  assert.equal(hud(world, sab!.c).BlackoutOn, false, "the saboteur keeps the full view");
  // Upstream hid the pointer to the nearest job during a fault (F35): no compass word on the job lines then.
  const directed = /^(N|NE|E|SE|S|SW|W|NW|here) .+\((Hold|Tap|Timing)\)/m;
  assert.doesNotMatch(hud(world, tech!.c).texts.panel, directed, "no job directions during a fault");
  assert.match(hud(world, tech!.c).texts.panel, /\((Hold|Tap|Timing)\)/, "the jobs are still listed");
  assert.match(hud(world, t.people[3]!).texts.hub, /FAULT: Blackout/);
  // The saboteur cannot reset; a technician holds Use at the panel for 2 s.
  sab!.hold("E", 2.5);
  await runCrowd(world, t.drivers, () => sab!.idle, 5000);
  assert.equal(match(world, t.people[0]!).m.fk, Fault.Blackout, "a saboteur cannot reset");
  tech!.hold("E", 1.6);
  await runCrowd(world, t.drivers, () => tech!.idle, 5000);
  await runCrowd(world, t.drivers, () => false, 600);
  assert.equal(match(world, t.people[0]!).m.fk, Fault.Blackout, "1.6 s is not enough");
  tech!.hold("E", 2.3);
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.fk === Fault.None, 6000), "reset");
  // The app sends state in batches every 0.2 s: give the other pages a moment to hear it.
  await runCrowd(world, t.drivers, () => false, 800);
  assert.equal(hud(world, tech!.c).BlackoutOn, false);
  assert.match(hud(world, tech!.c).texts.panel, directed, "the directions are back once the fault is reset");
  // The next fault waits out the 18 s cooldown. The sonar jam then blocks jobs.
  const reset = history(world).find((e) => e.kind === "reset")!;
  sab!.go(panel(Fault.Jam), 0.5).then(() => match(world, t.people[0]!).Rel() > startedAt + 18.5).press("F");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.fk === Fault.Jam, 90000));
  assert.ok(reset.at > 0);
  const mine = hud(world, tech!.c).Mine()!;
  const job = STATION.JobStations.find((s) => (mine.a & (1 << s.Id)) !== 0 && s.Kind === 0) ?? STATION.JobStations.find((s) => (mine.a & (1 << s.Id)) !== 0)!;
  tech!.go(job.Position, 0.5).hold("E", job.Kind === 0 ? 1.6 : 1.65).wait(0.6);
  await runCrowd(world, t.drivers, () => tech!.idle, 90000);
  assert.equal(hud(world, tech!.c).Mine()!.c & (1 << job.Id), 0, "no job finishes while the sonar is jammed");
  // Someone resets the jam; then the breach, left alone, wins for the saboteurs 45 s after it starts.
  t.drivers[2]!.auto = "reset";
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.fk === Fault.None, 90000));
  t.drivers[2]!.auto = "none";
  const jamAt = history(world).filter((e) => e.kind === "fault").at(-1)!.at;
  sab!.go(panel(Fault.Breach), 0.5).then(() => match(world, t.people[0]!).Rel() > jamAt + 18.5).press("F");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.fk === Fault.Breach, 90000));
  const breachAt = history(world).filter((e) => e.kind === "fault").at(-1)!.at;
  assert.ok(await runCrowd(world, t.drivers, over(world, t.people[0]!), 60000));
  const end = history(world).find((e) => e.kind === "end")!;
  assert.equal(match(world, t.people[0]!).m.w, Team.Saboteurs);
  assert.ok(end.at - breachAt >= 45 && end.at - breachAt < 45.35, `the breach ran out after ${end.at - breachAt} s`);
  assert.deepEqual(world.problems(), []);
});

test("the scrubber fault has a countdown in the port (D2): left alone it wins too", async () => {
  const world = newWorld(19);
  const t = await startMatch(world, 4, { forced: ["0-u1"], attrs: { "scrubber-seconds": "20" } });
  const sab = t.drivers[0]!;
  sab.go(STATION.PanelFor(Fault.Scrubber)!.Position, 0.5).wait(4).press("F");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, t.people[1]!).m.fk === Fault.Scrubber, 90000));
  const m = match(world, t.people[1]!).m;
  assert.ok(m.fe > 0, "it has a countdown");
  assert.ok(await runCrowd(world, t.drivers, over(world, t.people[0]!), 30000));
  assert.equal(match(world, t.people[1]!).m.w, Team.Saboteurs);
});

test("hatches: a saboteur at a hatch comes out at the next of its group; a technician cannot", async () => {
  const world = newWorld(23);
  const t = await startMatch(world, 4, { forced: ["0-u1"] });
  const [sab, tech] = t.drivers;
  const first = STATION.Hatches[0]!;
  const next = STATION.GetNextHatch(first);
  sab!.go(first.Position, 0.3).press("V").wait(1);
  tech!.go(STATION.Hatches[3]!.Position, 0.3).press("V").wait(1);
  await runCrowd(world, t.drivers, () => sab!.idle && tech!.idle, 120000);
  assert.ok(Dist(sab!.pos, next.Position) < 0.6, "the saboteur came out at the next hatch");
  assert.ok(Dist(tech!.pos, STATION.Hatches[3]!.Position) < 0.6, "the technician stayed put");
  const h = history(world).filter((e) => e.kind === "hatch");
  assert.equal(h.length, 1, "the referee accepted one trip");
  // The trip is taken at once: the referee's own position is at the landing, not walking there.
  const rules = match(world, referee(world)!).rules!;
  assert.ok(Dist(rules.players[sab!.slot]!.position, next.Position) < 0.6, `the referee's position is at the landing: ${rules.players[sab!.slot]!.position}`);
  assert.deepEqual(world.problems(), []);
});

test("a bystander in the room is never the referee and never holds a sealed entry", async () => {
  const world = newWorld(29);
  const bystander = world.join({ name: "Bystander", uid: "0-zz-bystander" });
  await world.settle();
  await world.run(3000);
  assert.equal(world.instance(bystander).networking.IsReferee, false, "nobody has joined: no referee at all");
  assert.equal(referee(world), null);
  const t = await startMatch(world, 4, { forced: ["0-u2"] });
  const by = world.instance(bystander);
  let refereeSeen = 0;
  for (const d of t.drivers.slice(2)) d.auto = "jobs";
  await runCrowd(world, t.drivers, () => {
    if (by.networking.IsReferee) refereeSeen++;
    return false;
  }, 30000);
  assert.equal(refereeSeen, 0);
  assert.equal(match(world, bystander).SlotOf("0-zz-bystander"), -1);
  assert.match(hud(world, bystander).texts.panel, /Observing/);
  // The dealer's leaf has an entry per roster slot only, none addressed to the bystander, and it cannot open any.
  const box = JSON.parse(dealer(world, bystander).box) as { s: string[] };
  assert.equal(box.s.length, 4);
  for (const entry of box.s) assert.equal(JSON.parse(entry).u === "0-zz-bystander", false);
  assert.equal(dealer(world, bystander).mine, null);
  assert.equal(hud(world, bystander).MyRole(), Role.Unassigned);
  // Even when the referee leaves, the bystander is not elected: one of the players is.
  const ref = referee(world)!;
  world.leave(ref);
  await until(world, "a new referee", () => !!referee(world) && referee(world) !== ref, 20000);
  assert.notEqual(referee(world), bystander);
});

test("a change of referee mid-match voids it: everyone back to the lobby, free, at the hub; the next match works", async () => {
  const world = newWorld(31);
  const t = await startMatch(world, 5);
  for (const d of t.drivers) d.auto = "jobs";
  await runCrowd(world, t.drivers, () => false, 15000);
  const ref = referee(world)!;
  const rest = t.drivers.filter((d) => d.c !== ref);
  world.leave(ref);
  assert.ok(await runCrowd(world, rest, () => rest.every((d) => d.match.m.st === MatchState.Lobby), 20000), "the match is void");
  const m = rest[0]!.match.m;
  assert.equal(m.nt, "void-referee");
  await runCrowd(world, rest, () => false, 500);
  for (const d of rest) {
    assert.notEqual(d.c.abilities.get("Move"), false);
    assert.equal(hud(world, d.c).moves.at(-1)!.why, "hub");
    assert.match(hud(world, d.c).texts.hub, /void: its referee left/);
  }
  const newRef = referee(world)!;
  assert.ok(rest.some((d) => d.c === newRef), "the new referee is one of the players");
  // The four left can start again at once (they are still in the lobby).
  assert.ok(rest[0]!.c.click(SLUG, "0", "startButton"));
  assert.ok(await runCrowd(world, rest, () => rest.every((d) => d.match.m.st === MatchState.Playing && d.role !== Role.Unassigned), 20000));
  assert.equal(rest[0]!.match.m.r, m.r + 1);
  assert.equal(rest[0]!.match.m.d, world.instance(newRef).networking.LocalPlayer.sid);
  assert.deepEqual(world.problems(), []);
});

test("a player who arrives mid-match is an observer: sent to the bunkroom, no beats, no role", async () => {
  const world = newWorld(37);
  const t = await startMatch(world, 4);
  await runCrowd(world, t.drivers, () => false, 5000);
  const late = world.join({ name: "Late", uid: "0-u9" });
  await world.settle();
  const d = new Driver(world, late);
  d.place(new Vector2(2, 2)); // standing in the commons
  t.drivers.push(d);
  await runCrowd(world, t.drivers, () => hud(world, late).moves.some((mv) => mv.why === "lounge"), 10000);
  assert.ok(hud(world, late).moves.some((mv) => mv.why === "lounge"), "kept out of the station");
  assert.match(hud(world, late).texts.panel, /Observing/);
  assert.match(hud(world, late).texts.lounge, /Off-shift bunkroom/);
  assert.equal(match(world, late).SlotOf("0-u9"), -1);
  assert.equal(world.room.userStateOf(late.sid)[`pk1.${SLUG}.0.p0`], undefined, "they send no beats");
  // Joining the lobby now queues them for the next match.
  assert.ok(late.click(SLUG, "0", "joinButton"));
  await runCrowd(world, t.drivers, () => false, 1000);
  assert.equal(match(world, late).Lobby().length, 5);
  assert.equal(match(world, late).m.sl.length, 4, "but not into this one");
});

test("two matches in one room (two copies of the game) stay separate", async () => {
  const world = newWorld(41);
  const north = await startMatch(world, 4, { inst: "north", forced: ["north-u1"] });
  const south = await startMatch(world, 4, { inst: "south", forced: ["south-u2"] });
  const n = (c: (typeof north.people)[number]) => match(world, c, "north").m;
  const s = (c: (typeof south.people)[number]) => match(world, c, "south").m;
  assert.deepEqual(n(north.people[0]!).sl.map((x) => x.u), ["north-u1", "north-u2", "north-u3", "north-u4"]);
  assert.deepEqual(s(south.people[0]!).sl.map((x) => x.u), ["south-u1", "south-u2", "south-u3", "south-u4"]);
  assert.notEqual(referee(world, "north"), referee(world, "south"));
  // A death in the north changes nothing in the south.
  const [sab, victim] = north.drivers;
  victim!.go(new Vector2(-6, -4), 0.3);
  sab!.auto = "hunt";
  sab!.huntTarget = victim!;
  assert.ok(await runCrowd(world, [...north.drivers, ...south.drivers], () => n(north.people[2]!).al[1] === 0, 120000));
  assert.deepEqual(s(south.people[0]!).al, [1, 1, 1, 1]);
  assert.equal(hud(world, south.people[1]!, "south").MyRole(), Role.Saboteur);
  assert.equal(hud(world, north.people[0]!, "north").MyRole(), Role.Saboteur);
  // Every key each one writes is under its own prefix.
  const keys = world.room.stateKeys(`pk1.${SLUG}.`);
  assert.ok(keys.some((k) => k.startsWith(`pk1.${SLUG}.north.`)) && keys.some((k) => k.startsWith(`pk1.${SLUG}.south.`)));
  assert.ok(keys.every((k) => k.startsWith(`pk1.${SLUG}.north.`) || k.startsWith(`pk1.${SLUG}.south.`)));
  assert.deepEqual(world.problems(), []);
});

test("a reload mid-match keeps the seat: same role, same jobs, input counted again", async () => {
  const world = newWorld(43);
  const t = await startMatch(world, 4, { forced: ["0-u1"] });
  const tech = t.drivers[2]!;
  tech.auto = "jobs";
  await runCrowd(world, t.drivers, () => tech.jobsDone >= 1, 90000);
  const before = hud(world, tech.c).Mine()!;
  world.leave(tech.c);
  await world.run(1500);
  const again = world.join({ name: "P3", uid: "0-u3", device: "0-u3" });
  await until(world, "the reloaded page started", () => world.started(again) && hud(world, again).Mine() !== null, 15000);
  const after = hud(world, again).Mine()!;
  assert.equal(after.r, Role.Technician);
  assert.equal(after.a, before.a, "the same jobs");
  assert.equal(after.c & before.c, before.c, "the finished ones still finished");
  assert.equal(match(world, again).m.gn[2], 0, "not counted as having left");
  assert.equal(hud(world, again).moves.filter((mv) => mv.why === "start").length, 0, "not sent back to the start");
  // Its input reaches the referee again: it finishes another job.
  const d = new Driver(world, again);
  d.pos = tech.pos.clone();
  d.auto = "jobs";
  const drivers = [...t.drivers.filter((x) => x !== tech), d];
  const done = after.c;
  assert.ok(await runCrowd(world, drivers, () => (hud(world, again).Mine()!.c & ~done) !== 0, 90000), "another job finished after the reload");
});

test("one person and five bots play a whole match: the bots work, hunt, fault and vote (upstream bots, as an option)", async () => {
  const world = newWorld(59);
  const t = await startMatch(world, 1, { attrs: { bots: "5", "min-players": "4" } });
  const me = t.drivers[0]!;
  const m0 = match(world, me.c).m;
  assert.equal(m0.sl.length, 6);
  assert.equal(m0.sl.filter((s) => s.b === 1).length, 5);
  // The person calls a muster at once, so the bots vote; then everyone plays on.
  me.go(STATION.MeetingPoint, 0.3).press("E");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, me.c).m.st === MatchState.Muster, 30000));
  me.c.click(SLUG, "0", "abstainButton");
  if (me.role === Role.Technician) me.auto = "jobs";
  assert.ok(await runCrowd(world, t.drivers, over(world), 200000), "the match ended");
  const h = history(world);
  const end = h.find((e) => e.kind === "end")!;
  assert.ok(end.at <= 184.35);
  assert.ok(h.filter((e) => e.kind === "vote" && e.actor! >= 1).length >= 4, "the bots voted");
  assert.ok(h.some((e) => e.kind === "job" && e.actor! >= 1), "bot technicians worked");
  const roles = match(world, me.c).m.ro;
  const sabSlot = roles.indexOf(Role.Saboteur);
  if (sabSlot >= 1) assert.ok(h.some((e) => (e.kind === "eliminate" || e.kind === "fault") && e.actor === sabSlot), "the bot saboteur acted");
  // Invariants over the whole match: one fault at a time, the downed never act, finished jobs are assigned jobs.
  const downed = new Map<number, number>();
  for (const e of h) {
    if (e.kind === "eliminate") downed.set(e.target!, e.at);
    if (e.actor !== undefined && downed.has(e.actor) && e.kind !== "left") assert.fail(`slot ${e.actor} acted while down: ${e.kind}`);
  }
  assert.deepEqual(world.problems(), []);
});

test("the player who started a match can stop it: back to the lobby", async () => {
  const world = newWorld(61);
  const t = await startMatch(world, 4);
  await runCrowd(world, t.drivers, () => false, 3000);
  assert.ok(t.people[1]!.click(SLUG, "0", "abortButton"), "anyone can press it");
  await runCrowd(world, t.drivers, () => false, 2000);
  assert.equal(match(world, t.people[1]!).m.st, MatchState.Playing, "but only the starter (or the world's owner) is obeyed");
  assert.ok(t.people[0]!.click(SLUG, "0", "abortButton"));
  assert.ok(await runCrowd(world, t.drivers, () => t.people.every((c) => match(world, c).m.st === MatchState.Lobby), 10000));
  assert.equal(match(world, t.people[2]!).m.nt, "aborted");
});
