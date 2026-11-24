// Rung 1 for what the kit adds: the station's clickable objects (consoles, the muster post, body markers, the boarding
// pad, Leave), the work bar and the jobs-done bars, on the fake room with the bindings the kit builder wrote.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector2 } from "../portkit/src/index.ts";
import { JobKind, MatchState } from "../src/GameTypes.ts";
import { ENTRY_POINT } from "../src/RuntimeHud.ts";
import { STATION } from "../src/ShipMap.ts";
import { bindings, match, newWorld, runCrowd, SLUG, startMatch } from "./helpers.ts";

const kitBindings = bindings.behaviours.some((b: { type: string }) => b.type === "StationButton");

test("console clicks work every kind of job; the work bar and the jobs-done bars follow", { skip: !kitBindings && "bindings.json is not the kit's yet" }, async () => {
  const world = newWorld(71);
  const t = await startMatch(world, 4, { forced: ["0-u4"] });
  const d = t.drivers[0]!;
  const hud = d.hud;
  const kinds = new Set<number>();
  let worked = 0;
  const mine = () => hud.Mine()!;
  for (let round = 0; round < 5; round++) {
    const open = STATION.JobStations.filter((s) => (mine().a & (1 << s.Id)) !== 0 && (mine().c & (1 << s.Id)) === 0);
    if (!open.length) break;
    const s = open.sort((a, b) => Vector2.Distance(d.pos, a.Position) - Vector2.Distance(d.pos, b.Position))[0]!;
    d.go(s.Position, 0.6);
    assert.ok(await runCrowd(world, t.drivers, () => d.idle, 120000), `walked to job ${s.Id}`);
    const at = hud.ToWorld(s.Position, 1.1);
    const click = () => assert.ok(d.c.click(SLUG, "0", `console${s.Id}`, at), "the console is clickable");
    let peak = 0;
    const watch = async (ms: number) => {
      const end = world.room.now + ms;
      while (world.room.now < end) {
        await runCrowd(world, t.drivers, () => false, 1);
        peak = Math.max(peak, hud.WorkAmount);
      }
    };
    if (s.Kind === JobKind.Hold) {
      click();
      await watch(2200);
    } else if (s.Kind === JobKind.Tap) {
      for (let i = 0; i < 4; i++) {
        click();
        await watch(300);
      }
      await watch(800);
    } else {
      click();
      await watch(1650);
      click();
      await watch(800);
    }
    await runCrowd(world, t.drivers, () => (mine().c & (1 << s.Id)) !== 0, 3000);
    assert.ok((mine().c & (1 << s.Id)) !== 0, `job ${s.Id} (kind ${s.Kind}) done by console clicks`);
    assert.ok(peak > 0, `the work bar moved for job ${s.Id}`);
    kinds.add(s.Kind);
    worked++;
  }
  assert.ok(worked >= 3);
  const m = match(world, d.c).m;
  assert.ok(m.cd >= worked);
  for (const bar of hud.jobBars) assert.ok(Math.abs(bar.transform.localScale.x - m.cd / m.ct) < 0.011, "the jobs bars show jobs done / total");
  assert.deepEqual(world.problems(), []);
});

test("the muster post and a body marker are clicked; the boarding pad and Leave move a player in and out", { skip: !kitBindings && "bindings.json is not the kit's yet" }, async () => {
  const world = newWorld(73);
  const t = await startMatch(world, 4, { forced: ["0-u4"] });
  const [a, , , sab] = t.drivers;
  // the post: Use at it, by a click
  a!.go(new Vector2(0, -1), 0.3);
  assert.ok(await runCrowd(world, t.drivers, () => a!.idle, 60000));
  assert.ok(a!.c.click(SLUG, "0", "musterPost", a!.hud.ToWorld(STATION.MeetingPoint, 1.06)));
  assert.ok(await runCrowd(world, t.drivers, () => match(world, a!.c).m.st === MatchState.Muster, 3000), "a click on the post calls a muster");
  for (const c of t.people) c.click(SLUG, "0", "abstainButton");
  assert.ok(await runCrowd(world, t.drivers, () => match(world, a!.c).m.st === MatchState.Playing, 40000));
  // the saboteur downs the first technician; the second finds the body and clicks its marker
  await runCrowd(world, t.drivers, () => false, 11000);
  const victim = t.drivers[1]!;
  sab!.auto = "hunt";
  sab!.huntTarget = victim;
  assert.ok(await runCrowd(world, t.drivers, () => !victim.alive, 120000), "the saboteur caught the technician");
  sab!.auto = "none";
  const body = match(world, a!.c).m.bd[victim.slot] as number[];
  a!.go(new Vector2(body[0]!, body[1]!), 1.0);
  assert.ok(await runCrowd(world, t.drivers, () => a!.idle, 120000));
  assert.ok(a!.c.click(SLUG, "0", `body${victim.slot}`, a!.hud.ToWorld(new Vector2(body[0]!, body[1]!), 0.2)));
  assert.ok(await runCrowd(world, t.drivers, () => match(world, a!.c).m.st === MatchState.Muster && match(world, a!.c).m.mb === victim.slot, 3000), "a click on the body marker raises the alarm");
  // Stop, then Leave and the boarding pad
  assert.ok(t.people[0]!.click(SLUG, "0", "abortButton"));
  assert.ok(await runCrowd(world, t.drivers, () => match(world, a!.c).m.st === MatchState.Lobby, 10000));
  await runCrowd(world, t.drivers, () => false, 1000);
  const moves = a!.hud.moves;
  assert.ok(a!.c.click(SLUG, "0", "leaveButton"));
  await runCrowd(world, t.drivers, () => false, 500);
  assert.equal(moves[moves.length - 1]!.why, "leave");
  assert.ok(Vector2.Distance(moves[moves.length - 1]!.at, ENTRY_POINT) < 0.01);
  assert.ok(a!.c.click(SLUG, "0", "enterButton", a!.hud.ToWorld(ENTRY_POINT, 1.6)));
  await runCrowd(world, t.drivers, () => false, 500);
  assert.equal(moves[moves.length - 1]!.why, "board");
  assert.ok(Math.abs(moves[moves.length - 1]!.at.x) < 17 && Math.abs(moves[moves.length - 1]!.at.y) < 13, "boarded into the Commons");
  // only the regions visible from the Commons are drawn (src/region-pvs.json); all of them from outside
  await runCrowd(world, t.drivers, () => false, 1200);
  const on = a!.hud.RegionsOn;
  assert.ok(on > 0 && on < a!.hud.regions.length, `regions drawn from the Commons: ${on} of ${a!.hud.regions.length}`);
  assert.deepEqual(world.problems(), []);
});
