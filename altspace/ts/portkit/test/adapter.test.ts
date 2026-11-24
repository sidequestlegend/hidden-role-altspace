// The app adapter (BsPlatform) on its own terms: Play mode with one player and no room, and what it refuses.

import assert from "node:assert/strict";
import { test } from "node:test";
import { statePrefix } from "../src/index.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { asciiJson } from "../src/util.ts";
import { enter, inst, makeGame, probe, probeGame, Sheet, untilStarted } from "./games.ts";
import { gameOf, sampleBindings, SAMPLE_KIT, SLUG } from "./helpers.ts";
import sample from "../sample/src/index.ts";

test("Play mode on your own: no room, no user state, and the game still runs", async () => {
  const room = new FakeRoom({ seed: 121 });
  room.defineKit(SAMPLE_KIT, sampleBindings());
  const solo = room.join({ name: "Dev", solo: true });
  solo.load(sample, sampleBindings());
  solo.addSnippet(SLUG, { windows: SAMPLE_KIT });
  assert.ok(await room.runUntil(() => solo.hasInstance(SLUG) && solo.instance(SLUG).started, 20000), solo.logged("warn").join(" | "));
  const net = solo.instance(SLUG).networking;
  assert.equal(net.IsReferee, true);
  assert.equal(net.GetPlayerCount(), 1);
  assert.equal(net.LocalPlayer.playerId, 1);
  assert.equal(solo.joined, false, "there is no room");

  solo.click(SLUG, "0", "seatX");
  await room.run(500);
  assert.deepEqual(gameOf(solo).seats, [1, -1]);
  assert.equal(solo.graph(SLUG).text.get("seatX"), "X: Dev");
  // The state is the page's own, in memory; nothing reached the room.
  assert.deepEqual(room.stateKeys(), []);
  assert.ok(solo.logged("info").some((line) => line.includes("no user state in this session")));
  assert.deepEqual(solo.logged("error"), []);
});

test("per-player behaviours and player data work for one player without a room", async () => {
  const room = new FakeRoom({ seed: 122 });
  const g = makeGame({ slug: "rp", behaviours: [{ id: "p", type: "Probe" }, { id: "sheet", type: "Sheet" }] });
  room.defineKit(g.kit, g.bindings);
  const solo = room.join({ solo: true });
  solo.load(g.game, g.bindings);
  solo.addSnippet("rp", { windows: g.kit });
  assert.ok(await room.runUntil(() => solo.hasInstance("rp") && solo.instance("rp").started, 20000));
  const p = probe(solo, "rp");
  const sheet = inst(solo, "rp").playerBehaviour<Sheet>(solo.sid, "sheet")!;
  sheet.Hurt(2);
  p.PlayerData.SetInt("found", 4);
  await room.run(1000);
  assert.equal(sheet.hp, 8);
  assert.equal(p.PlayerData.GetInt(inst(solo, "rp").networking.LocalPlayer, "found"), 4);
  assert.deepEqual(p.restored, [1]);
});

test("the adapter never sends a value the bridge would cut: delimiters are escaped by the runtime, refused if raw", async () => {
  const room = new FakeRoom({ seed: 123 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");

  // Text with every delimiter the bridge splits on, and more: it arrives whole.
  const nasty = "pilcrow ¶ section § bar | interrobang ‽ currency ¤ emoji 🎲 quote \" backslash \\";
  probe(a).Set(1, nasty);
  await room.run(1500);
  assert.equal(probe(b).text, nasty);
  const stored = String(room.stateSnapshot()[statePrefix("probe", "0") + ".v.p"]);
  assert.ok(/^[\x20-\x7e]*$/.test(stored), "what is stored is printable ASCII");
  assert.ok(!stored.includes("|"));
  assert.equal(asciiJson({ t: "a|b¶" }), '{"t":"a\\u007cb\\u00b6"}');

  // A raw write that holds a delimiter is not sent, and says so.
  const platform = inst(a, "probe").platform;
  const errors: string[] = [];
  platform.onStateError("pk1.", (path, code) => errors.push(`${path} ${code}`));
  platform.stateSet("pk1.probe.0.raw", "a|b");
  await room.run(1000);
  assert.deepEqual(errors, ["pk1.probe.0.raw invalid_value"]);
  assert.equal(room.stateSnapshot()["pk1.probe.0.raw"], undefined);

  // Deleting a subtree is awaited, and deleting what is not there is not an error.
  platform.stateSet("pk1.probe.0.tmp.a", "1");
  platform.stateSet("pk1.probe.0.tmp.b", "2");
  await room.run(1500);
  assert.equal(platform.stateEntries("pk1.probe.0.tmp.").length, 2);
  let done = 0;
  void platform.stateDelete("pk1.probe.0.tmp").then(() => done++);
  void platform.stateDelete("pk1.probe.0.never").then(() => done++);
  await room.run(1500);
  assert.equal(done, 2);
  assert.equal(platform.stateEntries("pk1.probe.0.tmp.").length, 0);
  assert.equal(inst(b, "probe").platform.stateGet("pk1.probe.0.tmp.a"), undefined);
});

test("a player's page only mirrors the protocol's own keys, whatever else is in the room", async () => {
  const room = new FakeRoom({ seed: 124 });
  room.stuff("videoUrl", "https://example.invalid/a.mp4");
  room.stuff("scores.round", 3);
  room.stuff("pk1.someone.else", { not: "a string" });
  const g = probeGame();
  const a = enter(room, [g]);
  await untilStarted(room, [a], "probe");
  const platform = inst(a, "probe").platform;
  assert.equal(platform.stateGet("videoUrl"), undefined);
  assert.equal(platform.stateGet("pk1.someone.else"), undefined, "only string leaves are the protocol's");
  assert.ok(platform.stateEntries("").every(([path]) => path.startsWith("pk1.probe.0.")));
  assert.deepEqual(a.logged("error"), []);
});
