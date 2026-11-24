// Synced variables and ownership: who applies what, races for ownership, change callbacks, sync groups.

import assert from "node:assert/strict";
import { test } from "node:test";
import { statePrefix } from "../src/index.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { Door, enter, inst, makeGame, Meter, Piece, probe, probeGame, untilStarted } from "./games.ts";
import { allEqual } from "./helpers.ts";

test("the owner applies its write at once; the others get the fields and OnDeserialization", async () => {
  const room = new FakeRoom({ seed: 11 });
  const g = probeGame();
  const [a, b, c] = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b, c], "probe");

  probe(b).Set(7, "hello");
  // Local effect is immediate: the fields, and ownership.
  assert.equal(probe(b).value, 7);
  assert.ok(inst(b, "probe").networking.IsOwner(probe(b)));
  assert.equal(probe(a).value, 0);

  await room.run(1500);
  for (const client of [a, c]) {
    assert.equal(probe(client).value, 7);
    assert.equal(probe(client).text, "hello");
    assert.equal(probe(client).deserialized, 1);
    assert.equal(probe(client).snapshots, 0, "a live change is not a snapshot");
    assert.equal(inst(client, "probe").networking.GetOwner(probe(client))?.playerId, inst(b, "probe").networking.LocalPlayer.playerId);
  }
  // The writer is never told about its own write.
  assert.equal(probe(b).deserialized, 0);
  assert.deepEqual(probe(b).posts.map((p) => p.success), [true]);
  assert.ok(probe(b).posts[0]!.byteCount > 0);

  // A request to serialise from someone who is not the owner does nothing, here or anywhere.
  probe(a).SetAsIs(99);
  await room.run(1500);
  assert.equal(probe(b).value, 7);
  assert.equal(probe(c).value, 7);
  assert.ok(a.logged("warn").some((line) => line.includes("not the owner")));
});

test("two players take ownership and write in the same instant: one stands, the other is put back", async () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const room = new FakeRoom({ seed });
    const g = probeGame();
    const clients = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
    const [a, b, c] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];
    await untilStarted(room, clients, "probe");
    probe(a).Set(1);
    await room.run(1500);

    // b and c both act before either has heard of the other.
    probe(b).Set(100);
    probe(c).Set(200);
    assert.equal(probe(b).value, 100);
    assert.equal(probe(c).value, 200);
    await room.run(4000);

    const values = clients.map((client) => probe(client).value);
    assert.ok(allEqual(values.map(String)), `seed ${seed}: values diverged: ${values.join(", ")}`);
    assert.ok(values[0] === 100 || values[0] === 200, `seed ${seed}: the value is one of the two written`);
    const winner = values[0] === 100 ? b : c;
    const loser = winner === b ? c : b;
    // Everyone names the same owner, and it is the one whose value stands.
    const owners = clients.map((client) => inst(client, "probe").networking.GetOwner(probe(client))?.playerId);
    assert.ok(allEqual(owners.map(String)), `seed ${seed}: owners diverged: ${owners.join(", ")}`);
    assert.equal(owners[0], inst(winner, "probe").networking.LocalPlayer.playerId);
    // The loser was told who really owns it, and its fields were replaced by a deserialisation.
    assert.equal(probe(loser).owners.at(-1), owners[0], `seed ${seed}: the loser was not told the real owner`);
    assert.ok(probe(loser).deserialized >= 1);
    assert.equal(probe(loser).value, values[0]);
    assert.ok(allEqual(clients.map((client) => inst(client, "probe").digest())));
    // What the room holds is the winner's write.
    const stored = JSON.parse(String(room.stateSnapshot()[statePrefix("probe", "0") + ".v.p"]));
    assert.equal(stored.w, winner.sid);
    assert.equal(stored.d.value, values[0]);
  }
});

test("a write by the old owner that lands after ownership moved is undone by the new owner", async () => {
  const room = new FakeRoom({ seed: 21, latency: [40, 40] });
  const g = probeGame();
  const clients = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
  const [a, b] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];
  await untilStarted(room, clients, "probe");
  probe(a).Set(5);
  await room.run(1500);

  // b takes ownership (and writes nothing). The moment the room has b's claim, and before a can have heard of
  // it, a writes once more as the owner it still believes it is.
  inst(b, "probe").networking.SetOwner(inst(b, "probe").networking.LocalPlayer, probe(b));
  const ownerLeaf = statePrefix("probe", "0") + ".o.p";
  assert.ok(await room.runUntil(() => String(room.stateSnapshot()[ownerLeaf]).includes(b.sid), 3000, 2));
  assert.ok(inst(a, "probe").networking.IsOwner(probe(a)), "a has not heard yet");
  probe(a).SetAsIs(6);
  inst(a, "probe").sync.flush(); // sent now, not at the end of the tick, so that it is on its way before a hears
  assert.equal(probe(a).value, 6);
  await room.run(4000);

  // The room kept b as owner, so a's late value does not count; b wrote its own value back over it.
  for (const client of clients) assert.equal(probe(client).value, 5, `${client.name} holds the owner's value`);
  assert.ok(inst(b, "probe").sync.stats.repairs >= 1);
  const stored = JSON.parse(String(room.stateSnapshot()[statePrefix("probe", "0") + ".v.p"]));
  assert.equal(stored.w, b.sid);
  assert.equal(stored.d.value, 5);
  assert.ok(allEqual(clients.map((client) => inst(client, "probe").digest())));
});

test("a field change callback runs for a received change, for a local assignment, and for the join snapshot", async () => {
  const room = new FakeRoom({ seed: 31 });
  const g = makeGame({ slug: "doors", behaviours: [{ id: "d", type: "Door" }] });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "doors");
  const door = (client: typeof a) => client.instance("doors").behaviour<Door>("d");

  // Local code assigns through the property: the setter runs here, once.
  door(a).Toggle("first");
  assert.deepEqual(door(a).setterCalls, [true]);
  await room.run(1500);
  // The receiver's setter runs because the received value differs from what it had.
  assert.deepEqual(door(b).setterCalls, [true]);
  assert.equal(door(b)._open, true);
  assert.equal(door(b).label, "first");
  assert.equal(door(b).deserialized, 1);
  // The writer's setter is not called a second time by its own echo.
  assert.deepEqual(door(a).setterCalls, [true]);

  // Another field changes and `_open` does not: no setter call, though OnDeserialization still runs.
  door(a).Relabel("second");
  await room.run(1500);
  assert.deepEqual(door(b).setterCalls, [true]);
  assert.equal(door(b).label, "second");
  assert.equal(door(b).deserialized, 2);

  // A late joiner: the snapshot value differs from the default, so the setter runs once for it.
  const c = enter(room, [g]);
  await untilStarted(room, [a, b, c], "doors");
  assert.deepEqual(door(c).setterCalls, [true]);
  assert.equal(door(c).label, "second");
});

test("a sync group shares one leaf; each member hears only of its own part", async () => {
  const room = new FakeRoom({ seed: 41 });
  const behaviours = [];
  for (let i = 0; i < 40; i++) behaviours.push({ id: `pc${i}`, type: "Piece", group: "pieces" });
  const g = makeGame({ slug: "board", behaviours });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "board");
  const piece = (client: typeof a, i: number) => client.instance("board").behaviour<Piece>(`pc${i}`);

  piece(a, 3).MoveTo(4, 5);
  await room.run(1500);
  assert.deepEqual([piece(b, 3).x, piece(b, 3).y], [4, 5]);
  assert.equal(piece(b, 3).deserialized, 1);
  assert.deepEqual(piece(b, 3).xChanges, [4], "the member's change callback ran");
  for (let i = 0; i < 40; i++) if (i !== 3) assert.equal(piece(b, i).deserialized, 0, `piece ${i} was not touched`);

  // Forty behaviours, two leaves: the owner record and the packed value.
  const keys = room.stateKeys(statePrefix("board", "0") + ".").map((k) => k.slice(statePrefix("board", "0").length + 1));
  assert.deepEqual(keys.filter((k) => k.startsWith("v.") || k.startsWith("o.")).sort(), ["o.@pieces", "v.@pieces"]);

  // Ownership belongs to the group: moving another piece from b takes all of it.
  piece(b, 7).MoveTo(1, 1);
  await room.run(1500);
  assert.deepEqual([piece(a, 7).x, piece(a, 7).y], [1, 1]);
  assert.deepEqual([piece(a, 3).x, piece(a, 3).y], [4, 5], "the rest of the group came along unchanged");
  assert.equal(piece(a, 3).deserialized, 0);
  assert.equal(a.instance("board").networking.IsOwner(piece(a, 0)), false);
  assert.equal(b.instance("board").networking.IsOwner(piece(b, 0)), true);
  assert.equal(a.instance("board").digest(), b.instance("board").digest());

  // A late joiner gets every piece's position, each told once.
  const c = enter(room, [g]);
  await untilStarted(room, [a, b, c], "board");
  assert.deepEqual([piece(c, 3).x, piece(c, 7).x], [4, 1]);
  assert.equal(piece(c, 3).deserialized, 1);
});

test("a continuous behaviour is sent when it changes, a few times a second at most", async () => {
  const room = new FakeRoom({ seed: 51 });
  const g = makeGame({ slug: "meter", behaviours: [{ id: "m", type: "Meter" }] });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "meter");
  const meter = (client: typeof a) => client.instance("meter").behaviour<Meter>("m");
  const owner = [a, b].find((client) => client.instance("meter").networking.IsOwner(meter(client)))!;
  const other = owner === a ? b : a;

  // The owner changes the field on every tick for two seconds and never asks to serialise.
  const before = owner.instance("meter").sync.stats.writes;
  for (let i = 0; i < 40; i++) {
    meter(owner).level = i + 1;
    await room.run(50);
  }
  await room.run(1500);
  const writes = owner.instance("meter").sync.stats.writes - before;
  assert.ok(writes >= 5 && writes <= 12, `expected about ten writes in two seconds, got ${writes}`);
  assert.equal(meter(other).level, 40);
  // Unchanged, it is not sent again.
  const settled = owner.instance("meter").sync.stats.writes;
  await room.run(2000);
  assert.equal(owner.instance("meter").sync.stats.writes, settled);
});

test("a change the owner had not sent yet is taken back when ownership goes first", async () => {
  const room = new FakeRoom({ seed: 22, latency: [40, 40] });
  const g = probeGame();
  const clients = [enter(room, [g]), enter(room, [g])];
  const [a, b] = clients as [(typeof clients)[0], (typeof clients)[0]];
  await untilStarted(room, clients, "probe");
  probe(a).Set(5);
  await room.run(1500);

  inst(b, "probe").networking.SetOwner(inst(b, "probe").networking.LocalPlayer, probe(b));
  // a hears of the new owner in the middle of a tick in which it changed the value.
  assert.ok(await room.runUntil(() => !inst(a, "probe").networking.IsOwner(probe(a)), 3000, 1));
  probe(a).value = 6;
  inst(a, "probe").sync.slotOf(probe(a))!.dirty = true; // as if RequestSerialization() ran just before the news
  await room.run(1000);
  assert.equal(probe(a).value, 5);
  assert.equal(probe(a).rollbacks, 1);
  assert.equal(probe(b).value, 5);
});
