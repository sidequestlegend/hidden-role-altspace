// What belongs to one player: saved data everyone can read, per-player behaviours, and who sent what.

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafBudget, statePrefix } from "../src/index.ts";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { enter, inst, makeGame, probe, probeGame, Sheet, untilStarted } from "./games.ts";

const idOf = (client: FakeClient, slug: string) => inst(client, slug).networking.LocalPlayer.playerId;

test("player data: each player writes their own, everyone reads it, and it comes back on the next visit", async () => {
  const room = new FakeRoom({ seed: 101 });
  const g = probeGame("hunt");
  const [a, b] = [enter(room, [g], { uid: "ann", device: "anns-quest" }), enter(room, [g], { uid: "bob" })];
  await untilStarted(room, [a, b], "hunt");
  const data = (client: FakeClient) => probe(client, "hunt").PlayerData;
  const player = (viewer: FakeClient, who: FakeClient) => inst(viewer, "hunt").networking.GetPlayers().find((p) => p.sid === who.sid)!;
  await room.run(1500);

  // Everyone is told once that each player's saved data is in (here: nothing was saved).
  for (const client of [a, b]) assert.deepEqual([...probe(client, "hunt").restored].sort(), [idOf(a, "hunt"), idOf(b, "hunt")].sort());
  assert.equal(data(b).IsRestored(player(b, a)), true);

  data(a).SetInt("found", 3);
  data(a).Set("treasures", ["chest", "ring"]);
  data(a).SetString("title", "Seeker");
  // The writer reads its own values back at once.
  assert.equal(data(a).GetInt(player(a, a), "found"), 3);
  await room.run(1500);
  // Everyone else reads them from the mirror, synchronously.
  assert.equal(data(b).GetInt(player(b, a), "found"), 3);
  assert.deepEqual(data(b).Get<string[]>(player(b, a), "treasures", []), ["chest", "ring"]);
  assert.equal(data(b).GetString(player(b, a), "title"), "Seeker");
  assert.equal(data(b).GetInt(player(b, a), "missing"), 0);
  assert.deepEqual(data(b).Keys(player(b, a)).sort(), ["found", "title", "treasures"]);
  assert.equal(data(b).Has(player(b, b), "found"), false, "b's own data is b's");
  for (const client of [a, b]) {
    const update = probe(client, "hunt").dataUpdates.at(-1)!;
    assert.deepEqual([update.player, update.keys], [idOf(a, "hunt"), ["found", "title", "treasures"]]);
  }
  data(a).Delete("title");
  await room.run(1500);
  assert.equal(data(b).Has(player(b, a), "title"), false);
  assert.deepEqual(probe(b, "hunt").dataUpdates.at(-1)!.keys, ["title"]);

  // ann leaves and comes back on the same device: her values are loaded and published again.
  a.leave();
  await room.run(40000);
  const back = enter(room, [g], { uid: "ann", device: "anns-quest" });
  await untilStarted(room, [b, back], "hunt");
  await room.run(1500);
  assert.equal(data(b).GetInt(player(b, back), "found"), 3);
  assert.deepEqual(data(back).Get<string[]>(player(back, back), "treasures", []), ["chest", "ring"]);
  assert.ok(probe(b, "hunt").restored.includes(idOf(back, "hunt")));
  // A returning player's saved values: OnPlayerRestored first, then OnPlayerDataUpdated with every key they have,
  // on the other clients and on their own.
  for (const [client, label] of [[b, "remote"], [back, "local"]] as const) {
    const log = probe(client, "hunt").log;
    const restoredAt = log.indexOf(`OnPlayerRestored:${idOf(back, "hunt")}`);
    const updatedAt = log.indexOf(`OnPlayerDataUpdated:${idOf(back, "hunt")}:found,treasures`);
    assert.ok(restoredAt >= 0 && updatedAt === restoredAt + 1, `${label}: ${log.join(" ")}`);
  }
  // On another device she starts with nothing: the save belongs to the device, not the account.
  back.leave();
  await room.run(40000);
  const elsewhere = enter(room, [g], { uid: "ann", device: "a-friends-pc" });
  await untilStarted(room, [b, elsewhere], "hunt");
  await room.run(1500);
  assert.equal(data(b).GetInt(player(b, elsewhere), "found"), 0);
});

test("per-player behaviours: one for each player, owned by that player, gone when they go", async () => {
  const room = new FakeRoom({ seed: 102 });
  const g = makeGame({
    slug: "rp",
    behaviours: [
      { id: "p", type: "Probe" },
      { id: "sheet", type: "Sheet" },
      { id: "saved", type: "SavedSheet" },
    ],
  });
  const [a, b] = [enter(room, [g], { uid: "ann", device: "anns-quest" }), enter(room, [g], { uid: "bob" })];
  await untilStarted(room, [a, b], "rp");
  await room.run(1500);
  const sheet = (viewer: FakeClient, who: FakeClient, id = "sheet") => inst(viewer, "rp").playerBehaviour<Sheet>(who.sid, id)!;
  const net = (client: FakeClient) => inst(client, "rp").networking;

  // Every client holds a copy for every player, started once, each owned by its player and by nobody else.
  for (const viewer of [a, b]) {
    for (const who of [a, b]) {
      assert.equal(sheet(viewer, who).started, 1);
      assert.equal(sheet(viewer, who).Player!.sid, who.sid);
      assert.equal(net(viewer).GetOwner(sheet(viewer, who))!.sid, who.sid);
      assert.equal(net(viewer).IsOwner(sheet(viewer, who)), viewer === who);
    }
    // Enumerable from game code, in player-id order.
    const all = probe(viewer, "rp").PlayerBehaviours<Sheet>("Sheet");
    assert.deepEqual(all.map((s) => s.Player!.playerId), net(viewer).GetPlayers().map((p) => p.playerId));
    assert.equal(probe(viewer, "rp").PlayerBehaviour<Sheet>(net(viewer).LocalPlayer, "Sheet"), sheet(viewer, viewer));
  }

  // The owner changes and serialises; the other client's copy of that player's sheet follows.
  sheet(a, a).title = "Ann the Bold";
  sheet(a, a).Hurt(3);
  await room.run(1500);
  assert.equal(sheet(b, a).hp, 7);
  assert.equal(sheet(b, a).title, "Ann the Bold");
  assert.equal(sheet(b, a).deserialized, 1);
  assert.equal(sheet(b, b).hp, 10, "b's own sheet is another thing altogether");
  assert.equal(sheet(a, a).deserialized, 0);
  // Somebody else's sheet cannot be written, and its owner cannot be changed.
  sheet(b, a).Hurt(5);
  net(b).SetOwner(net(b).LocalPlayer, sheet(b, a));
  await room.run(1500);
  assert.equal(sheet(a, a).hp, 7);
  assert.equal(net(a).GetOwner(sheet(a, a))!.sid, a.sid);

  // A network event sent on a per-player behaviour reaches the same player's copy everywhere.
  sheet(b, a).SendCustomNetworkEvent("All", "Wave", "hi");
  await room.run(1000);
  assert.deepEqual(sheet(a, a).pings, [{ args: ["hi"], from: idOf(b, "rp") }]);
  assert.equal(sheet(a, b).pings.length, 0);

  // It all travels in the player's own user state: at most six leaves for the instance, with room to spare.
  const leaves = Object.keys(room.userStateOf(a.sid)).filter((path) => path.startsWith(statePrefix("rp", "0") + "."));
  assert.ok(leaves.length <= 6, leaves.join(", "));
  assert.ok(!room.stateKeys().some((key) => key.includes("sheet")), "nothing of it is in the shared space state");

  // A late joiner gets the sheets as they are.
  const c = enter(room, [g], { uid: "cat" });
  await untilStarted(room, [a, b, c], "rp");
  await room.run(1500);
  assert.equal(sheet(c, a).hp, 7);
  assert.equal(sheet(c, a).title, "Ann the Bold");
  assert.equal(sheet(a, c).started, 1);

  // ann leaves: her sheets are torn down on everyone else's client.
  const annsSheetAtB = sheet(b, a);
  const savedBefore = sheet(a, a, "saved");
  savedBefore.title = "kept";
  savedBefore.Hurt(4);
  await room.run(1500);
  a.leave();
  await room.run(8000);
  assert.equal(annsSheetAtB.destroyed, 1);
  assert.equal(inst(b, "rp").playerBehaviour(a.sid, "sheet"), null);
  assert.equal(probe(b, "rp").PlayerBehaviours("Sheet").length, 2);

  // She returns on her device: the persistent behaviour has its fields back, the ordinary one starts over.
  await room.run(40000);
  const back = enter(room, [g], { uid: "ann", device: "anns-quest" });
  await untilStarted(room, [b, c, back], "rp");
  await room.run(2000);
  assert.deepEqual([sheet(back, back, "saved").hp, sheet(back, back, "saved").title], [6, "kept"]);
  assert.deepEqual([sheet(b, back, "saved").hp, sheet(b, back, "saved").title], [6, "kept"]);
  assert.equal(sheet(back, back).hp, 10);
  assert.ok(probe(b, "rp").restored.includes(idOf(back, "rp")));
});

test("eighty-six per-player behaviours cost four user-state leaves, and nothing until they are used", async () => {
  const room = new FakeRoom({ seed: 103 });
  const behaviours = [{ id: "p", type: "Probe" }];
  for (let i = 0; i < 86; i++) behaviours.push({ id: `s${i}`, type: "Sheet" });
  const g = makeGame({ slug: "big", behaviours });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "big");
  await room.run(1500);
  const leavesOf = (client: FakeClient) => Object.keys(room.userStateOf(client.sid)).filter((path) => /\.p[0-3]$/.test(path));
  assert.equal(leavesOf(a).length, 0, "idle per-player behaviours are not published at all");

  for (let i = 0; i < 86; i++) inst(a, "big").playerBehaviour<Sheet>(a.sid, `s${i}`)!.Hurt(i % 5);
  await room.run(2000);
  assert.equal(leavesOf(a).length, 4);
  for (let i = 0; i < 86; i++) assert.equal(inst(b, "big").playerBehaviour<Sheet>(a.sid, `s${i}`)!.hp, 10 - (i % 5));
  // One behaviour changes: one leaf is rewritten, not all four.
  const writes = room.stats.userWrites;
  inst(a, "big").playerBehaviour<Sheet>(a.sid, "s40")!.Hurt(1);
  await room.run(1500);
  assert.equal(room.stats.userWrites - writes, 1);

  const budget = leafBudget(g.bindings, (type) => ({ synced: type === "Probe" ? 3 : 2, perPlayer: type !== "Probe" }));
  assert.deepEqual([budget.slots, budget.spaceLeaves, budget.userLeavesPerPlayer], [1, 3, 6]);
});

test("network events carry arguments and their sender; owner events go to one client; private methods are private", async () => {
  const room = new FakeRoom({ seed: 104 });
  const g = probeGame();
  const [a, b, c] = [enter(room, [g], { uid: "ann" }), enter(room, [g], { uid: "bob" }), enter(room, [g], { uid: "cat" })];
  await untilStarted(room, [a, b, c], "probe");
  const all = [a, b, c];

  probe(b).Broadcast("move", 3, { to: [1, 2] }, null);
  // Here at once, with the local player as sender.
  assert.deepEqual(probe(b).pings, [{ args: ["move", 3, { to: [1, 2] }, null], from: idOf(b, "probe"), uid: "bob" }]);
  await room.run(1000);
  for (const client of [a, c]) {
    // Elsewhere once, with who sent it: session and user id, as the room stamped them.
    assert.deepEqual(probe(client).pings, [{ args: ["move", 3, { to: [1, 2] }, null], from: idOf(b, "probe"), uid: "bob" }]);
  }
  assert.equal(probe(b).pings.length, 1, "a one-shot never comes back to its sender");
  assert.equal(inst(a, "probe").networking.CallingPlayer, null, "outside an event there is no caller");

  // To the owner only.
  probe(a).Set(1);
  await room.run(1500);
  for (const client of all) probe(client).pings.length = 0;
  probe(c).ToOwner("please");
  await room.run(1000);
  assert.deepEqual(probe(a).pings, [{ args: ["please"], from: idOf(c, "probe"), uid: "cat" }]);
  assert.equal(probe(b).pings.length + probe(c).pings.length, 0);
  // From the owner to the owner: run here, nothing sent.
  const sent = inst(a, "probe").events.sent;
  probe(a).ToOwner("me");
  assert.equal(probe(a).pings.length, 2);
  assert.equal(inst(a, "probe").events.sent, sent);

  // A method whose name starts with an underscore cannot be called over the network, nor can one that is not the game's.
  probe(a).SendCustomNetworkEvent("All", "_Private");
  probe(a).SendCustomNetworkEvent("All", "RequestSerialization");
  probe(a).SendCustomNetworkEvent("All", "constructor");
  await room.run(1000);
  assert.equal(probe(b).pings.length, 0);
  assert.equal(a.logged("warn").filter((line) => line.includes("no network-callable method")).length, 3);
  // Nor does a hand-made one-shot get through to them, or to another game.
  inst(c, "probe").platform.oneShot(JSON.stringify({ pk: 1, g: "probe", i: "0", t: "ev", b: "p", e: "_Private" }));
  inst(c, "probe").platform.oneShot(JSON.stringify({ pk: 1, g: "other", i: "0", t: "ev", b: "p", e: "Ping" }));
  inst(c, "probe").platform.oneShot("not json at all");
  await room.run(1000);
  assert.equal(probe(a).pings.length, 2);
  assert.equal(probe(b).pings.length, 0);
});

test("an event sent after a state change is run after that change has arrived", async () => {
  const room = new FakeRoom({ seed: 105 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");
  probe(a).Set(1);
  await room.run(1500);
  // Upstream writes a field and fires an event that reads it. One-shots are sent at once and state every 0.2 s,
  // so the event would overtake the value it was sent after.
  const seen: number[] = [];
  const target = probe(b);
  const original = target.Ping.bind(target);
  target.Ping = (...args: unknown[]) => {
    seen.push(target.value);
    original(...args);
  };
  probe(a).value = 2;
  probe(a).RequestSerialization();
  probe(a).Broadcast("read it");
  await room.run(1500);
  assert.deepEqual(seen, [2]);
});

test("commands to the referee: numbered, run once and in order, acknowledged, never replayed", async () => {
  const room = new FakeRoom({ seed: 106 });
  const g = probeGame();
  const [a, b, c] = [enter(room, [g], { uid: "u1" }), enter(room, [g], { uid: "u2" }), enter(room, [g], { uid: "u3" })];
  await untilStarted(room, [a, b, c], "probe");
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const others = all.filter((client) => client !== referee) as [FakeClient, FakeClient];
  const [sender, watcher] = others;

  // Three requests in one go: the referee runs each once, in order, knowing who asked.
  const numbers = [probe(sender).SendCommand("Add", 5), probe(sender).SendCommand("Add", 7), probe(sender).SendCommand("Add", 1)];
  assert.deepEqual(numbers, [1, 2, 3]);
  await room.run(6000);
  assert.deepEqual(probe(referee).commands, [5, 7, 1].map((amount) => ({ name: "Add", args: [amount], from: idOf(sender, "probe") })));
  assert.equal(probe(watcher).commands.length, 0, "only the referee runs a command");
  assert.equal(probe(sender).commands.length, 0);
  for (const client of all) assert.equal(probe(client).value, 13);
  assert.deepEqual(probe(sender).acks, [1, 2, 3]);

  // A late joiner sees the result, and runs nothing.
  const d = enter(room, [g], { uid: "u4" });
  await untilStarted(room, [...all, d], "probe");
  await room.run(3000);
  assert.equal(probe(d).value, 13);
  assert.equal(probe(d).commands.length, 0);
  assert.equal(probe(referee).commands.length, 3);

  // The referee leaves with a request on its way: the next referee runs it, and only the new ones.
  probe(watcher).SendCommand("Add", 100);
  referee.leave();
  await room.run(10000);
  const left = [sender, watcher, d];
  const next = left.find((client) => inst(client, "probe").networking.IsReferee)!;
  assert.ok(next);
  for (const client of left) assert.equal(probe(client).value, 113);
  assert.deepEqual(probe(next).commands.map((cmd) => cmd.args[0]), [100]);
  assert.deepEqual(probe(watcher).acks, [1]);
  // The referee can command itself too.
  probe(next).SendCommand("Add", 1);
  await room.run(3000);
  for (const client of left) assert.equal(probe(client).value, 114);
});

test("a burst of commands goes to the referee in one write and runs in one pass, in order", async () => {
  const room = new FakeRoom({ seed: 161 });
  const g = probeGame("burst");
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "burst");
  const referee = [a, b].find((client) => inst(client, "burst").networking.IsReferee)!;
  const sender = referee === a ? b : a;
  const writes = room.stats.userWrites;
  for (let i = 1; i <= 6; i++) probe(sender, "burst").SendCommand("Add", i);
  const ran = await room.runUntil(() => probe(sender, "burst").acks.length === 6, 5000);
  assert.ok(ran);
  assert.deepEqual(probe(referee, "burst").commands.map((c) => c.args[0]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(probe(sender, "burst").acks, [1, 2, 3, 4, 5, 6]);
  assert.ok(room.stats.userWrites - writes <= 6, `user-state writes for the burst: ${room.stats.userWrites - writes}`);
});
