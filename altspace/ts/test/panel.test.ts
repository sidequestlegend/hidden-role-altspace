// Rung 1, the personal panel (world 9d7311, 2026-11-25): the panel with its five buttons followed every visitor's
// head, match or no match, and its colliders shoved people. It follows the head only for a person on the roster of a
// match that is on; everyone else's stays where the kit put it, in the bunkroom. Each test failed on the old code
// (the panel 0.65 m from every head, the click colliders solid).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Vector2, Vector3 } from "../portkit/src/index.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import type { TestWorld } from "../portkit/src/testing.ts";
import { MatchState } from "../src/GameTypes.ts";
import { emptyMatch } from "../src/Match.ts";
import { PANEL_PARK, PanelFollows, SHELL_PARK } from "../src/RuntimeHud.ts";
import { hud, match, newWorld, runCrowd, SLUG, startMatch, until, waitState } from "./helpers.ts";

const near = (a: Vector3, b: Vector3, d: number) => Vector3.Distance(a, b) < d;

/** Every world position the page sent the panel and the shell, from now on. */
function spy(world: TestWorld, c: FakeClient): Vector3[] {
  const h = hud(world, c);
  const sent: Vector3[] = [];
  const panel = h.personalPanel!.transform;
  const place = panel.SetPositionAndRotation.bind(panel);
  panel.SetPositionAndRotation = (p, r) => (sent.push(p.clone()), place(p, r));
  const shell = h.shell!.transform;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(shell), "position")!;
  Object.defineProperty(shell, "position", { get: () => desc.get!.call(shell), set: (v: Vector3) => (sent.push(v.clone()), desc.set!.call(shell, v)) });
  return sent;
}

/** The panel is where the kit put it and has not been sent near this head since `sent` was last emptied. */
function assertParked(world: TestWorld, c: FakeClient, head: Vector3, sent: Vector3[], why: string): void {
  const h = hud(world, c);
  assert.equal(h.PanelFollowing, false, `${why}: the panel does not follow`);
  const close = sent.filter((p) => near(p, head, 3));
  assert.deepEqual(close.map(String), [], `${why}: nothing was sent to the head (${head})`);
  const panel = h.personalPanel!.transform;
  assert.deepEqual([panel.localPosition.x, panel.localPosition.y, panel.localPosition.z], [PANEL_PARK.x, PANEL_PARK.y, PANEL_PARK.z], `${why}: back where the kit put it`);
  const shell = h.shell!.transform;
  assert.deepEqual([shell.localPosition.x, shell.localPosition.y, shell.localPosition.z], [SHELL_PARK.x, SHELL_PARK.y, SHELL_PARK.z], `${why}: the shell back where the kit put it`);
}

/** The panel 0.55 m in front of the head (looking along +Z) and 0.35 m below it. */
function assertFollowing(world: TestWorld, c: FakeClient, head: Vector3, why: string): void {
  const h = hud(world, c);
  const at = h.personalPanel!.transform.position;
  assert.equal(h.PanelFollowing, true, `${why}: the panel follows`);
  assert.ok(near(at, head.add(new Vector3(0, -0.35, 0.55)), 0.08), `${why}: the panel is in front of the head (${at} vs head ${head})`);
}

test("the follow rule: only a person on the roster of a match that is on", () => {
  const m = emptyMatch();
  assert.equal(PanelFollows(m, -1), false, "no match, not on a roster");
  assert.equal(PanelFollows(m, 0), false, "the lobby, even with a slot");
  m.sl = [{ u: "a", n: "A", b: 0 }, { u: "b", n: "B", b: 1 }] as typeof m.sl;
  for (const st of [MatchState.Playing, MatchState.Muster, MatchState.Ended]) {
    m.st = st;
    assert.equal(PanelFollows(m, 0), true, `a person on the roster, state ${st}`);
    assert.equal(PanelFollows(m, -1), false, `an observer, state ${st}`);
    assert.equal(PanelFollows(m, 1), false, `a bot's slot, state ${st}`);
    assert.equal(PanelFollows(m, 5), false, `a slot that does not exist, state ${st}`);
  }
});

test("a visitor with no match: the panel and the shell stay where the kit put them, wherever the head goes", async () => {
  const world = newWorld(5);
  const c = world.join({ name: "Visitor", uid: "v1" });
  await until(world, "started", () => world.started(c, "0"));
  const sent = spy(world, c);
  for (const [i, head] of [new Vector3(0, 1.6, 0), new Vector3(2, 1.6, 3), new Vector3(-4, 1.7, 11.5), new Vector3(6, 1.6, -57)].entries()) {
    c.pose(head);
    await world.run(600);
    assertParked(world, c, head, sent, `step ${i}`);
  }
});

test("players in the lobby, then in a match, then back in the lobby; an observer never", async () => {
  const world = newWorld(6);
  const t = await startMatch(world, 4);
  const watcher = world.join({ name: "Watcher", uid: "0-w" });
  await until(world, "the observer started", () => world.started(watcher, "0") && match(world, watcher).m.st === MatchState.Playing);
  // In the match: every rostered player's panel is in front of their own head.
  const watcherSent = spy(world, watcher);
  await runCrowd(world, t.drivers, () => false, 1000);
  for (const d of t.drivers) assertFollowing(world, d.c, d.head(), d.name);
  const watcherHead = new Vector3(3, 1.6, -60);
  watcher.pose(watcherHead);
  await runCrowd(world, t.drivers, () => false, 600);
  assertParked(world, watcher, watcherHead, watcherSent, "an observer during the match");
  // Stopped: back to the lobby, and every panel goes back.
  assert.ok(t.people[0]!.click(SLUG, "0", "abortButton"));
  await waitState(world, MatchState.Lobby);
  await runCrowd(world, t.drivers, () => false, 500);
  const after = t.drivers.map((d) => spy(world, d.c));
  for (const d of t.drivers) d.place(d.pos.add(new Vector2(1.5, 0.5)));
  await runCrowd(world, t.drivers, () => false, 1000);
  t.drivers.forEach((d, i) => assertParked(world, d.c, d.head(), after[i]!, `${d.name} after the match, moved`));
  assertParked(world, watcher, watcherHead, watcherSent, "the observer after the match");
});

test("the kit agrees: the panel's park is where the builder puts it, and no click collider in the kit is solid", () => {
  const builder = readFileSync(fileURLToPath(new URL("../../Assets/Kit/Editor/HiddenRoleKitBuilder.cs", import.meta.url)), "utf8");
  assert.match(builder, /LoungeOffset = new Vector3\(0, -70, 0\)/);
  assert.match(builder, /panel\.transform\.localPosition = LoungeOffset \+ new Vector3\(0, 0\.5f, -3\.5f\)/);
  assert.deepEqual([PANEL_PARK.x, PANEL_PARK.y, PANEL_PARK.z], [0, -69.5, -3.5]);
  // The built prefab: every collider on the UI layer (the click colliders) is a trigger.
  const prefab = readFileSync(fileURLToPath(new URL("../../Assets/Kit/hidden-role.prefab", import.meta.url)), "utf8");
  const docs = prefab.split("--- !u!");
  const layer = new Map<string, string>();
  const names = new Map<string, string>();
  for (const d of docs) {
    const go = /^1 &(\d+)/.exec(d);
    if (go) {
      layer.set(go[1]!, /m_Layer: (\d+)/.exec(d)![1]!);
      names.set(go[1]!, /m_Name: (.*)/.exec(d)![1]!.trim());
    }
  }
  const solid: string[] = [];
  let clicks = 0;
  for (const d of docs) {
    if (!/^(65|135|136|64) &/.test(d)) continue;
    const owner = /m_GameObject: \{fileID: (\d+)\}/.exec(d)![1]!;
    if (layer.get(owner) !== "5") continue;
    clicks++;
    if (/m_IsTrigger: 0/.test(d)) solid.push(names.get(owner)!);
  }
  assert.ok(clicks > 60, `the click colliders were found (${clicks})`);
  assert.deepEqual(solid, [], "solid click colliders");
});
