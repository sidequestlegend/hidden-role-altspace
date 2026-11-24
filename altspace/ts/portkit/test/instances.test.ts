// Several games and several copies of one game in the same page and room: nothing may leak between them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { holderName, instanceKeyFor, networkId, sanitizeInstanceKey, statePrefix } from "../src/index.ts";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import sample from "../sample/src/index.ts";
import { enter, inst, makeGame, probe, probeGame, running, untilStarted } from "./games.ts";
import { gameOf, sampleBindings, SAMPLE_KIT, SLUG } from "./helpers.ts";

test("two copies of one game and a different game share a room and stay apart", async () => {
  const room = new FakeRoom({ seed: 12 });
  room.defineKit(SAMPLE_KIT, sampleBindings());
  const other = probeGame("probe");
  const arrive = (): FakeClient => {
    const client = enter(room, [other]);
    client.load(sample, sampleBindings());
    client.addSnippet(SLUG, { windows: SAMPLE_KIT, room: "north", position: "0 0 0" });
    client.addSnippet(SLUG, { windows: SAMPLE_KIT, room: "south", position: "5 0 0" });
    return client;
  };
  const clients = [arrive(), arrive(), arrive()];
  const [a, b, c] = clients as [FakeClient, FakeClient, FakeClient];
  const ok = await room.runUntil(() => clients.every((client) => running(client, SLUG, "north") && running(client, SLUG, "south") && running(client, "probe")), 20000);
  assert.ok(ok);
  await room.run(2000);

  // Each instance has its own holder, its own referee record and its own player ids.
  for (const client of clients) {
    assert.ok(client.hasHolder(SLUG, "north") && client.hasHolder(SLUG, "south") && client.hasHolder("probe", "0"));
  }
  const keys = room.stateKeys("pk1.");
  for (const prefix of [statePrefix(SLUG, "north"), statePrefix(SLUG, "south"), statePrefix("probe", "0")]) {
    assert.ok(keys.includes(prefix + ".ref"), `${prefix} has a referee record`);
  }

  // A game in the north copy...
  a.click(SLUG, "north", "seatX");
  b.click(SLUG, "north", "seatO");
  await room.run(1500);
  a.click(SLUG, "north", "cell4");
  await room.run(1500);
  // ...and something else entirely in the south copy and in the other game.
  c.click(SLUG, "south", "seatX");
  probe(b).Set(9);
  probe(b).Broadcast("hello");
  await room.run(1500);

  for (const client of clients) {
    assert.equal(gameOf(client, "north").board[4], 1);
    assert.deepEqual(gameOf(client, "south").board, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(gameOf(client, "south").seats[0], client.instance(SLUG, "south").networking.GetPlayers().find((p) => p.sid === c.sid)!.playerId);
    assert.equal(gameOf(client, "south").seats[1], -1);
    assert.equal(probe(client).value, 9);
    assert.equal(probe(client).pings.length, 1, "the event reached this game's behaviour once");
    // The relay graph of each kit only heard what was addressed to its own holder.
    assert.equal(client.graph(SLUG, "north").text.get("cell4"), "X");
    assert.equal(client.graph(SLUG, "south").text.get("cell4") ?? "", "");
    assert.equal(client.graph("probe").text.size, 0);
  }
  // No key of one instance is under another's prefix, and every key is under the protocol's root.
  for (const key of room.stateKeys()) assert.ok(key.startsWith("pk1."), key);
  const north = room.stateKeys(statePrefix(SLUG, "north") + ".");
  const south = room.stateKeys(statePrefix(SLUG, "south") + ".");
  assert.ok(north.length > 0 && south.length > 0);
  assert.ok(String(room.stateSnapshot()[statePrefix(SLUG, "north") + ".v.game"]).includes('"board":[0,0,0,0,1'));
  assert.ok(!String(room.stateSnapshot()[statePrefix(SLUG, "south") + ".v.game"]).includes('"board":[0,0,0,0,1'));
  for (const client of clients) assert.deepEqual(client.logged("error"), []);
});

test("synced objects of two copies get different network ids", async () => {
  const room = new FakeRoom({ seed: 13 });
  const g = makeGame({ slug: "balls", objects: ["syncBall"], behaviours: [{ id: "p", type: "Probe", object: "syncBall" }] });
  const elements = [{ slug: "balls", attributes: { instance: "A1B2" } }, { slug: "balls", attributes: { instance: "c3d4" } }];
  const [a, b] = [enter(room, [g], { elements }), enter(room, [g], { elements })];
  await untilStarted(room, [a, b], "balls", "a1b2");
  await untilStarted(room, [a, b], "balls", "c3d4");
  assert.equal(a.object("balls", "a1b2", "syncBall").networkId, networkId("balls", "a1b2", "syncBall"));
  assert.equal(a.object("balls", "c3d4", "syncBall").networkId, "pk1/balls/c3d4/syncBall");
  assert.equal(b.object("balls", "a1b2", "syncBall").networkId, a.object("balls", "a1b2", "syncBall").networkId);
});

test("removing an element tears its instance down and leaves the others running", async () => {
  const room = new FakeRoom({ seed: 14 });
  const g = probeGame();
  const elements = [{ slug: "probe", attributes: { room: "one" } }, { slug: "probe", attributes: { room: "two" } }];
  const a = enter(room, [g], { elements });
  const b = enter(room, [g], { elements });
  await untilStarted(room, [a, b], "probe", "one");
  await untilStarted(room, [a, b], "probe", "two");
  const firstReferee = [a, b].find((client) => inst(client, "probe", "one").networking.IsReferee)!;
  const other = firstReferee === a ? b : a;
  const gone = inst(firstReferee, "probe", "one");

  // The referee's page loses the element of copy "one". Its player is still in the room.
  const element = firstReferee.env.doc.querySelectorAll("bs-snippet")[0] as never;
  firstReferee.removeSnippet(element);
  await room.run(6000);
  assert.equal(firstReferee.hasInstance("probe", "one"), false);
  assert.equal(firstReferee.hasHolder("probe", "one"), false, "the kit's holder object was destroyed");
  assert.equal(gone.core.disposed, true);
  assert.equal(gone.scheduler.pending, 0, "no timer of the instance is left");
  // The others notice that this player no longer takes part in that copy, and elect a new referee for it.
  assert.equal(inst(other, "probe", "one").networking.GetPlayerCount(), 1);
  assert.ok(inst(other, "probe", "one").networking.IsReferee);
  assert.equal(probe(other, "probe", "one").left.length, 1);
  // Copy "two" never noticed.
  assert.equal(inst(other, "probe", "two").networking.GetPlayerCount(), 2);
  assert.ok(running(firstReferee, "probe", "two"));

  // Putting an element back starts the copy again, as a late joiner.
  probe(other, "probe", "one").Set(4);
  await room.run(1500);
  firstReferee.addSnippet("probe", { windows: g.kit, room: "one" });
  await untilStarted(room, [a, b], "probe", "one");
  assert.equal(probe(firstReferee, "probe", "one").value, 4);
});

test("a single-instance snippet's second copy is skipped; loading the script twice changes nothing", async () => {
  const room = new FakeRoom({ seed: 15 });
  const g = probeGame();
  room.defineKit(g.kit, g.bindings);
  const a = room.join();
  assert.ok(a.load(g.game, g.bindings));
  assert.equal(a.load(g.game, g.bindings), null, "the second load of the same script does nothing");
  const first = a.addSnippet("probe", { windows: g.kit, single: "true" });
  a.addSnippet("probe", { windows: g.kit, single: "true" });
  await untilStarted(room, [a], "probe");
  await room.run(3000);
  assert.equal(a.runtimes.get("probe")!.instances.size, 1);
  assert.equal(inst(a, "probe").element.getAttribute("name"), "probe");
  assert.equal(room.stateKeys().filter((key) => key.endsWith(".ref")).length, 1);
  // One script, one set of listeners: an event is delivered once.
  const b = enter(room, [g]);
  await untilStarted(room, [a, b], "probe");
  probe(b).Broadcast(1);
  await room.run(1000);
  assert.equal(probe(a).pings.length, 1);
  void first;
});

test("instance keys: room, else instance, else index; holders and prefixes follow", () => {
  assert.equal(instanceKeyFor({ room: "Table One!", instance: "abc" }, 3), "table-one");
  assert.equal(instanceKeyFor({ room: "", instance: "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4" }, 3), "a1b2c3d4e5f6a1b2c3d4e5f6");
  assert.equal(instanceKeyFor({ room: null, instance: null }, 3), "3");
  assert.equal(instanceKeyFor({ room: "???", instance: "" }, 0), "0");
  assert.equal(sanitizeInstanceKey("--Über  Table--"), "ber-table");
  assert.equal(holderName("chess-table", "north"), "pk1:chess-table:north");
  assert.equal(statePrefix("chess-table", "north"), "pk1.chess-table.north");
  assert.equal(networkId("chess-table", "north", "whiteKing"), "pk1/chess-table/north/whiteKing");
});

test("Behaviour.Shared is one object for every instance of a game on a page, and per page", async () => {
  const room = new FakeRoom({ seed: 151 });
  const g = probeGame("chips");
  const a = enter(room, [g], { elements: [{ slug: "chips", attributes: { room: "t1" } }, { slug: "chips", attributes: { room: "t2" } }] });
  const b = enter(room, [g], { elements: [{ slug: "chips", attributes: { room: "t1" } }] });
  await untilStarted(room, [a, b], "chips", "t1");
  await untilStarted(room, [a], "chips", "t2", 1);
  probe(a, "chips", "t1").Shared.balance = 500;
  assert.equal(probe(a, "chips", "t2").Shared.balance, 500, "the other table on the same page sees it");
  assert.equal(probe(b, "chips", "t1").Shared.balance, undefined, "another page does not");
  assert.equal(probe(a, "chips", "t2").InstanceKey, "t2");
});
