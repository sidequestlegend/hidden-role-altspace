// Arriving late: the start gate, the join snapshot, and what a room that outlived its players means.

import assert from "node:assert/strict";
import { test } from "node:test";
import { statePrefix } from "../src/index.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { enter, inst, probe, probeGame, running, untilStarted } from "./games.ts";

test("a late joiner starts with the game's state: Start, then one snapshot OnDeserialization, then the joins", async () => {
  const room = new FakeRoom({ seed: 5 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");
  probe(b).Set(9, "nine");
  await room.run(1500);
  probe(b).SetAsIs(10);
  await room.run(1500);

  const c = enter(room, [g]);
  // Nothing of the game runs before the gate opens: not while the kit loads, not before the snapshot.
  await room.run(300);
  assert.equal(running(c, "probe"), false);
  await untilStarted(room, [a, b, c], "probe");

  const ids = [a, b, c].map((client) => inst(client, "probe").networking.LocalPlayer.playerId);
  assert.deepEqual(probe(c).log.filter((line) => !line.startsWith("OnPlayerRestored") && !line.startsWith("OnPlayerDataUpdated")), [
    "Start",
    "OnDeserialization:10:snapshot",
    "OnInstanceStart:joined",
    ...[...ids].sort((x, y) => x - y).map((id) => `OnPlayerJoined:${id}`),
  ]);
  assert.equal(probe(c).value, 10);
  assert.equal(probe(c).text, "nine");
  assert.equal(probe(c).snapshots, 1);
  assert.equal(inst(c, "probe").networking.GetOwner(probe(c))?.sid, b.sid);
  // The others are told of the newcomer once, and of nothing else.
  assert.deepEqual(probe(a).joined.slice(-1), [ids[2]]);
  assert.equal(probe(a).deserialized, 2, "two live changes, no replay because someone arrived");

  // A change after that is live for the newcomer too.
  probe(b).SetAsIs(11);
  await room.run(1500);
  assert.equal(probe(c).log.at(-1), "OnDeserialization:11");
});

test("the script arriving after the room was joined still gets the whole state", async () => {
  const room = new FakeRoom({ seed: 6 });
  const g = probeGame();
  const a = enter(room, [g]);
  await untilStarted(room, [a], "probe");
  probe(a).Set(33);
  await room.run(1500);

  // b's page is in the room for a while before the snippet's script loads: the snapshot event is long gone.
  const b = room.join();
  await room.run(3000);
  assert.ok(b.joined);
  room.defineKit(g.kit, g.bindings);
  b.load(g.game, g.bindings);
  b.addSnippet("probe", { windows: g.kit });
  await untilStarted(room, [a, b], "probe");
  assert.equal(probe(b).value, 33);
  assert.equal(probe(b).snapshots, 1);
});

test("a room everyone has left starts fresh for the next visitor", async () => {
  const room = new FakeRoom({ seed: 7 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");
  probe(a).Set(77);
  await room.run(1500);
  const before = inst(a, "probe").referee.current()!;
  a.leave();
  b.leave();
  await room.run(60000);
  assert.ok(String(room.stateSnapshot()[statePrefix("probe", "0") + ".v.p"]).includes("77"), "the room still holds the old game");

  const c = enter(room, [g]);
  await untilStarted(room, [c], "probe");
  // As a VRChat instance would: the old game is gone, and Start() ran as the master of a new one.
  assert.equal(probe(c).value, 0);
  assert.equal(probe(c).deserialized, 0);
  assert.deepEqual(probe(c).startKinds, ["fresh"]);
  assert.equal(probe(c).wasMasterAtStart, true);
  const now = inst(c, "probe").referee.current()!;
  assert.equal(now.e, before.e + 1);
  assert.equal(now.term, before.term + 1);
  assert.equal(inst(c, "probe").networking.GetOwner(probe(c))?.sid, c.sid);
  // And it is a working game: a second visitor joins it.
  probe(c).Set(1);
  const d = enter(room, [g]);
  await untilStarted(room, [c, d], "probe");
  assert.equal(probe(d).value, 1);
  assert.deepEqual(probe(d).startKinds, ["joined"]);
});

test("with whenEmpty: \"keep\" the next visitor finds the saved game and is told so", async () => {
  const room = new FakeRoom({ seed: 8 });
  const g = probeGame("keeper", { options: { whenEmpty: "keep" } });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "keeper");
  probe(a, "keeper").Set(55, "saved");
  await room.run(1500);
  const before = inst(a, "keeper").referee.current()!;
  a.leave();
  await room.run(3600 * 1000);

  const b = enter(room, [g]);
  await untilStarted(room, [b], "keeper");
  assert.equal(probe(b, "keeper").value, 55);
  assert.equal(probe(b, "keeper").text, "saved");
  assert.deepEqual(probe(b, "keeper").startKinds, ["resumed"]);
  assert.equal(inst(b, "keeper").networking.StartKind, "resumed");
  assert.equal(inst(b, "keeper").referee.current()!.e, before.e, "the same game, carried on");
  // What the absent player owned now belongs to the visitor, who can go on from it.
  await room.run(2000);
  assert.equal(inst(b, "keeper").networking.GetOwner(probe(b, "keeper"))?.sid, b.sid);
  probe(b, "keeper").SetAsIs(56);
  await room.run(1500);
  assert.ok(String(room.stateSnapshot()[statePrefix("keeper", "0") + ".v.p"]).includes("56"));
});

test("space state is gone a day after its last change", async () => {
  const room = new FakeRoom({ seed: 9 });
  const g = probeGame("keeper", { options: { whenEmpty: "keep" } });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "keeper");
  probe(a, "keeper").Set(5);
  await room.run(1500);
  a.leave();
  await room.run(25 * 3600 * 1000);
  const b = enter(room, [g]);
  await untilStarted(room, [b], "keeper");
  assert.equal(probe(b, "keeper").value, 0);
  assert.deepEqual(probe(b, "keeper").startKinds, ["fresh"]);
});
