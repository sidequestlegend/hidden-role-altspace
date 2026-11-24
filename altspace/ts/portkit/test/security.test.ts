// A modified client against what the runtime treats as authority: the fair draw, the command acknowledgements,
// network events that name methods. Each test plays the hostile client through raw platform calls, around the
// runtime, as a modified page could.

import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { enter, inst, probe, probeGame, untilStarted } from "./games.ts";

async function three(seed: number): Promise<{ room: FakeRoom; a: FakeClient; b: FakeClient; c: FakeClient }> {
  const room = new FakeRoom({ seed });
  const g = probeGame();
  const [a, b, c] = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b, c], "probe");
  return { room, a, b, c };
}

/** The raw platform of a client: what a modified page could call directly. */
function raw(client: FakeClient) {
  return inst(client, "probe").platform;
}

const secrets = (client: FakeClient) => probe(client).Secrets;

test("a hostile client cannot overwrite another player's pinned commitment or the referee's number", async () => {
  const { room, a, b, c } = await three(81);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [victim, hostile] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];
  const prefix = inst(victim, "probe").core.prefix;
  const epoch = inst(victim, "probe").referee.epoch;

  secrets(victim).beginDraw("round1");
  await room.run(2500);
  const dice = secrets(victim).myDraw("round1")!.Ints(5, 6);
  const refereeLeaf = () => JSON.stringify(room.userStateOf(referee.sid));
  const victimLeaf = () => JSON.stringify(room.userStateOf(victim.sid));
  /** The victim's entry in the referee's table, read from the room's copy of the referee's user state. */
  const victimEntry = () => {
    const leaf = JSON.parse(String(room.userStateOf(referee.sid)[`${prefix}.k`]));
    return JSON.stringify(leaf.x.fn.m[victim.sid]);
  };
  const before = { entry: victimEntry(), victim: victimLeaf() };
  assert.ok(before.entry.includes("round1"), "the referee's numbers are in the referee's own user state");
  assert.ok(!room.stateKeys(prefix).some((key) => key.endsWith(".fd") || key.endsWith(".fn")), "nothing of the draw is in public space state");

  // 1. A forged table in public space state, where the table used to live: a hash the victim never made, another
  //    number, and a forfeit.
  const forged = { e: epoch, m: { [victim.sid]: ["round1", "forged-hash", "AAAAAAAAAAAAAAAAAAAAAA", 1, 1, victim.uid] } };
  raw(hostile).stateSet(`${prefix}.fd`, JSON.stringify(forged));
  raw(hostile).stateSet(`${prefix}.fn`, JSON.stringify(forged));
  // 2. The same table published as if it were the referee's, in the hostile client's own user state.
  inst(hostile, "probe").presence.setExtra("fn", forged);
  // 3. A commitment in the victim's name: user state is tied to its sender, so it lands in the hostile's own leaf.
  inst(hostile, "probe").presence.setExtra("fd", ["round1", "forged-hash"]);
  await room.run(2000);
  assert.equal(victimEntry(), before.entry, "the victim's entry in the referee's leaf is untouched");
  assert.equal(victimLeaf(), before.victim, "the victim's leaf is untouched");
  for (const client of all) assert.equal(secrets(client).drawOf(victim.sid, "round1").state, "numbered", `${client.name} still sees the honest pin`);
  assert.deepEqual(secrets(victim).myDraw("round1")!.Ints(5, 6), dice, "the victim's dice did not change");

  // The victim's honest reveal is accepted everywhere, with the referee's real number.
  secrets(victim).revealDraw("round1");
  await room.run(1500);
  for (const client of all) {
    const status = secrets(client).drawOf(victim.sid, "round1");
    assert.equal(status.state, "revealed", client.name);
    assert.deepEqual(status.draw!.Ints(5, 6), dice);
  }
  // 4. A raw user-state write goes to the hostile client's own leaves only.
  const victimNow = victimLeaf();
  raw(hostile).userSet(`${prefix}.k`, JSON.stringify({ k: "x", v: 1, x: { fn: forged } }));
  await room.run(1000);
  assert.equal(victimLeaf(), victimNow);
  assert.ok(!victimEntry().includes("forged-hash"));
  assert.ok(!refereeLeaf().includes("AAAAAAAAAAAAAAAAAAAAAA"));
  for (const client of [referee, victim]) assert.equal(secrets(client).drawOf(victim.sid, "round1").state, "revealed");
});

test("a modified client that takes the referee seat cannot re-pin a draw the others have already seen", async () => {
  const { room, a, b, c } = await three(82);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [victim, hostile] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];
  const core = inst(hostile, "probe").core;

  secrets(victim).beginDraw("round1");
  await room.run(2500);
  const dice = secrets(victim).myDraw("round1")!.Ints(5, 6);
  // The seat itself cannot be defended (no server decides who is referee): the hostile client names itself in
  // the referee record, then publishes a table with the victim's pin and number changed.
  const record = JSON.parse(core.get("ref")!);
  raw(hostile).stateSet(`${core.prefix}.ref`, JSON.stringify({ sid: hostile.sid, uid: hostile.uid, term: record.term + 1, e: record.e }));
  await room.run(1500);
  assert.equal(inst(victim, "probe").referee.current()?.sid, hostile.sid, "the seat moved (a stated limit)");
  assert.ok(referee.logged("warn").some((line) => line.includes("while this client was referee")), "the displaced referee says so");
  inst(hostile, "probe").presence.setExtra("fn", { e: record.e, m: { [victim.sid]: ["round1", "forged-hash", "BBBBBBBBBBBBBBBBBBBBBB", 0, 0, victim.uid] } });
  await room.run(1500);
  for (const client of [referee, victim]) {
    assert.equal(secrets(client).drawOf(victim.sid, "round1").state, "numbered", `${client.name} keeps the first pin`);
    assert.ok(client.logged("warn").some((line) => line.includes("keeping the first one seen")), client.name);
  }
  assert.deepEqual(secrets(victim).myDraw("round1")!.Ints(5, 6), dice);
  secrets(victim).revealDraw("round1");
  await room.run(1500);
  for (const client of [referee, victim]) assert.equal(secrets(client).drawOf(victim.sid, "round1").state, "revealed");
});

test("a hostile client cannot acknowledge another player's commands so that they never run", async () => {
  const { room, a, b, c } = await three(83);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [sender, hostile] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];
  const core = inst(hostile, "probe").core;
  const epoch = inst(hostile, "probe").referee.epoch;
  // Acknowledgements far ahead of the sender's numbers, in public space state and in the hostile's own leaf.
  const forged = { e: epoch, m: { [sender.sid]: 1000 } };
  raw(hostile).stateSet(`${core.prefix}.ack`, JSON.stringify(forged));
  inst(hostile, "probe").presence.setExtra("ak", forged);
  await room.run(1000);
  probe(sender).SendCommand("Add", 5);
  probe(sender).SendCommand("Add", 7);
  await room.run(3000);
  assert.deepEqual(
    probe(referee).commands.map((command) => command.args[0]),
    [5, 7],
    "the referee ran both",
  );
  assert.deepEqual(probe(sender).acks, [1, 2]);
});

test("a fair draw survives a page reload of the same player on the same device", async () => {
  const { room, a, b, c } = await three(84);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [player, watcher] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];

  secrets(player).beginDraw("round1");
  await room.run(2500);
  const dice = secrets(player).myDraw("round1")!.Ints(5, 6);
  // The page reloads mid-round: a new session of the same user, on the same device.
  player.leave();
  await room.run(500);
  const again = enter(room, [probeGame()], { uid: player.uid, device: player.uid });
  await untilStarted(room, [referee, watcher, again], "probe");
  await room.run(3000);
  assert.deepEqual(secrets(again).myDraw("round1")?.Ints(5, 6), dice, "the same dice come back");
  assert.equal(secrets(watcher).drawOf(again.sid, "round1").state, "numbered");
  secrets(again).revealDraw("round1");
  await room.run(1500);
  for (const client of [referee, watcher, again]) {
    const status = secrets(client).drawOf(again.sid, "round1");
    assert.equal(status.state, "revealed", client.name);
    assert.deepEqual(status.draw!.Ints(5, 6), dice);
  }
  // The same user on another device has no saved secret: nothing comes back there.
  secrets(again).beginDraw("round2");
  await room.run(2500);
  again.leave();
  await room.run(500);
  const other = enter(room, [probeGame()], { uid: player.uid, device: "elsewhere" });
  await untilStarted(room, [referee, watcher, other], "probe");
  await room.run(3000);
  assert.equal(secrets(other).myDraw("round2"), null);
  assert.equal(secrets(watcher).drawOf(other.sid, "round2").state, "none");
});

test("a sealed box names its sender truthfully, even after the sender has left", async () => {
  const { room, a, b, c } = await three(85);
  const dealt = await secrets(a).seal(c.sid, { cards: ["AS"] });
  a.leave();
  await room.run(1500);
  // The genuine box still opens: the receiver remembers the key a announced.
  assert.deepEqual(await secrets(c).openWithSender(dealt), { value: { cards: ["AS"] }, from: a.sid });
  // b seals with its own key and names a as the sender: a was not here to contradict it, but its key is known.
  const forged = JSON.parse(await secrets(b).seal(c.sid, { cards: ["2C"] }));
  await assert.rejects(secrets(c).open(JSON.stringify({ ...forged, f: a.sid })), /does not come from/);
  // A sender this client never saw is refused too.
  await assert.rejects(secrets(c).open(JSON.stringify({ ...forged, f: "nobody" })), /does not come from/);
  assert.equal((await secrets(c).openWithSender(JSON.stringify(forged))).from, b.sid);
});

test("a forged network event or command naming a method the class does not list runs nothing", async () => {
  const { room, a, b, c } = await three(86);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const hostile = all.find((client) => client !== referee)!;
  for (const client of all) probe(client).Set(7);
  await room.run(1500);
  const value = probe(referee).value;
  // `Set` is a public method of Probe, but Probe does not list it: a modified client sends it anyway, as an event
  // to everyone and as a command to the referee.
  raw(hostile).oneShot(JSON.stringify({ pk: 1, g: "probe", i: "0", t: "ev", b: "p", e: "Set", a: [999, "pwned"] }));
  inst(hostile, "probe").presence.setExtra("q", [1, "p", "", "Set", [999, "pwned"]]);
  // And methods that are never callable, whatever a list says: the runtime's own, the constructor, `_` names.
  for (const name of ["RequestSerialization", "constructor", "_Private", "SendCustomNetworkEvent", "toString"]) {
    raw(hostile).oneShot(JSON.stringify({ pk: 1, g: "probe", i: "0", t: "ev", b: "p", e: name, a: ["All", "Ping"] }));
  }
  await room.run(2000);
  for (const client of all.filter((x) => x !== hostile)) {
    assert.equal(probe(client).value, value, `${client.name}: Set did not run`);
    assert.notEqual(probe(client).text, "pwned");
    assert.deepEqual(probe(client).pings, [], `${client.name}: nothing reached Ping by a side door`);
    assert.ok(inst(client, "probe").events.refusedCount >= 1);
    assert.ok(client.logged("warn").some((line) => line.includes("not in its networkCallable list")));
  }
  // A listed method still works, from the same client.
  probe(hostile).Broadcast("hello");
  await room.run(1000);
  assert.deepEqual(probe(referee).pings.map((p) => p.args), [["hello"]]);
  // The sender is told when it names an unlisted method itself.
  probe(a).SendCustomNetworkEvent("All", "Set", 1);
  assert.equal(probe(a).SendCommand("Set", 1), 0);
  assert.ok(a.logged("warn").some((line) => line.includes("no network-callable method 'Set'")));
});
