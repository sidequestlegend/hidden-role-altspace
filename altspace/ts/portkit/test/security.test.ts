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
  // The game starts its round again after the restore ran: beginDraw under the same label keeps the draw.
  secrets(again).beginDraw("round1");
  await room.run(1500);
  assert.deepEqual(secrets(again).myDraw("round1")?.Ints(5, 6), dice, "beginDraw after the restore keeps the dice");
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

test("after a reload, a game that calls beginDraw at once gets the saved draw back (hasSavedDraw says one is pending)", async () => {
  const { room, a, b, c } = await three(88);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [player, watcher] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];
  secrets(player).beginDraw("round1");
  await room.run(2500);
  const dice = secrets(player).myDraw("round1")!.Ints(5, 6);
  assert.equal(secrets(player).hasSavedDraw(), false, "nothing pending in the page that made the draw");
  player.leave();
  await room.run(500);
  const again = enter(room, [probeGame()], { uid: player.uid, device: player.uid });
  await untilStarted(room, [referee, watcher, again], "probe");
  // The game starts its round as soon as it starts, before the restore has read the referee's table.
  // (Pending until the restore has read the referee's table; by now it may have run already.)
  const restoredAlready = (secrets(again) as unknown as { mySecret: { label: string } | null }).mySecret?.label === "round1";
  assert.equal(secrets(again).hasSavedDraw("round1"), !restoredAlready);
  assert.equal(secrets(again).hasSavedDraw("round9"), false);
  // The game is quicker than the restore (made certain here by putting the restore back to pending).
  if (restoredAlready) {
    const s = secrets(again) as unknown as { mySecret: unknown; restoring: unknown; restored: unknown };
    s.restoring = s.restored;
    s.restored = null;
    s.mySecret = null;
  }
  assert.equal(secrets(again).hasSavedDraw("round1"), true);
  secrets(again).beginDraw("round1");
  assert.equal(secrets(again).hasSavedDraw(), false, "beginDraw took the saved draw over");
  await room.run(3000);
  assert.deepEqual(secrets(again).myDraw("round1")?.Ints(5, 6), dice, "the same dice, not a rejected re-roll");
  for (const client of [referee, watcher]) assert.equal(secrets(client).drawOf(again.sid, "round1").state, "numbered", client.name);
  // A saved draw under another label is not reused: a new label is a new draw.
  secrets(again).beginDraw("round2");
  await room.run(2500);
  assert.equal(secrets(again).drawOf(again.sid, "round2").state, "numbered");
});

test("a reload cannot re-roll a draw: a new session of the same user committing a new hash under a held label is rejected", async () => {
  const { room, a, b, c } = await three(87);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [player, watcher] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];
  const prefix = inst(referee, "probe").core.prefix;
  /** Every number the referee has published, from the room's copy of its user state. */
  const numbersOf = () => {
    const leaf = JSON.parse(String(room.userStateOf(referee.sid)[`${prefix}.k`]));
    return Object.values(leaf.x.fn.m as Record<string, unknown[]>).map((entry) => `${entry[0]}:${entry[2]}`);
  };

  secrets(player).beginDraw("round1");
  await room.run(2500);
  assert.equal(secrets(player).drawOf(player.sid, "round1").state, "numbered");
  const issued = numbersOf();
  // The player does not like the dice: a modified page reloads (a new session of the same user) and commits a
  // different secret under the same label, hoping for a fresh number. "elsewhere" has no saved secret either.
  player.leave();
  await room.run(500);
  const reroll = enter(room, [probeGame()], { uid: player.uid, device: "elsewhere" });
  await untilStarted(room, [referee, watcher, reroll], "probe");
  secrets(reroll).beginDraw("round1");
  await room.run(3000);
  assert.deepEqual(numbersOf().filter((n) => n.startsWith("round1:")), issued.filter((n) => n.startsWith("round1:")), "no fresh number was issued");
  for (const client of [referee, watcher, reroll]) {
    assert.equal(secrets(client).drawOf(reroll.sid, "round1").state, "rejected", `${client.name} sees the re-roll rejected`);
  }
  assert.equal(secrets(reroll).myDraw("round1"), null, "the re-roller has no draw");
  assert.ok(referee.logged("warn").some((line) => line.includes("re-roll")), "the referee says why");
  // Its reveal does not help, and the deadline makes it a forfeit.
  secrets(reroll).revealDraw("round1");
  secrets(referee).demandReveal("round1", 2);
  await room.run(3000);
  for (const client of [referee, watcher]) assert.notEqual(secrets(client).drawOf(reroll.sid, "round1").state, "revealed", client.name);

  // Waiting out the referee's 120 s keep does not help either: the referee remembers what it answered this epoch.
  reroll.leave();
  await room.run(125000);
  const late = enter(room, [probeGame()], { uid: player.uid, device: "elsewhere2" });
  await untilStarted(room, [referee, watcher, late], "probe");
  secrets(late).beginDraw("round1");
  await room.run(3000);
  assert.deepEqual(numbersOf().filter((n) => n.startsWith("round1:")).every((n) => issued.includes(n)), true, "still no fresh number");
  assert.equal(secrets(late).myDraw("round1"), null);
  assert.equal(secrets(referee).drawOf(late.sid, "round1").state, "rejected");
  // A new label is a new draw, as before.
  secrets(late).beginDraw("round2");
  await room.run(2500);
  assert.equal(secrets(late).drawOf(late.sid, "round2").state, "numbered");
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

test("a command whose handler publishes a user-state record runs once, not again and again (commands re-entrancy)", async () => {
  const { room, a, b, c } = await three(89);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const sender = all.find((client) => client !== referee)!;
  // Deal begins a dealt draw (Secrets.beginDeal -> presence.setExtra), Mark publishes a commitment: both write
  // the referee's own announcement leaf from inside the command, which tells every record listener at once.
  probe(sender).SendCommand("Deal", "hand1");
  probe(sender).SendCommand("Mark", 7);
  await room.run(3000);
  assert.deepEqual(
    probe(referee).commands.map((command) => `${command.name}:${command.args[0]}`),
    ["Deal:hand1", "Mark:7"],
    "each ran once",
  );
  assert.deepEqual(probe(sender).acks, [1, 2]);
  assert.equal(secrets(sender).dealState("hand1") !== "none", true, "the deal was begun");
  for (const client of all) assert.deepEqual(client.logged("error"), [], `${client.name}: no errors (no stack overflow)`);
  // The referee itself sending one goes the same way.
  probe(referee).SendCommand("Deal", "hand2");
  await room.run(2000);
  assert.equal(probe(referee).commands.filter((command) => command.args[0] === "hand2").length, 1);
});

test("the referee's own draw is numbered by a witness, and a grinding referee cannot pick its outcome", async () => {
  // honest: the referee's own draw gets its number from the lowest-ranked other participant, and checks out everywhere
  {
    const { room, a, b, c } = await three(90);
    const all = [a, b, c];
    const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
    const others = all.filter((client) => client !== referee);
    secrets(referee).beginDraw("hand1");
    await room.run(3000);
    const dice = secrets(referee).myDraw("hand1")?.Ints(5, 6);
    assert.ok(dice, "the referee knows its own draw");
    const prefix = inst(referee, "probe").core.prefix;
    const leaf = JSON.parse(String(room.userStateOf(referee.sid)[`${prefix}.k`]));
    const own = leaf.x.fn.m[referee.sid];
    assert.equal(own[7], "w", "numbered by a witness");
    assert.ok(others.some((o) => o.sid === own[6]), "the witness is another participant");
    for (const client of others) assert.equal(secrets(client).drawOf(referee.sid, "hand1").state, "numbered", client.name);
    secrets(referee).revealDraw("hand1");
    await room.run(1500);
    for (const client of all) {
      const status = secrets(client).drawOf(referee.sid, "hand1");
      assert.equal(status.state, "revealed", client.name);
      assert.deepEqual(status.draw!.Ints(5, 6), dice);
    }
  }

  // modified referees: each searches until its own five dice are all 1s (index 0)
  type Grind = (s: any, table: any, me: string) => boolean;
  const grinders: Array<[string, Grind]> = [
    ["rewrites the witnessed number", (s, table, me) => {
      const e = table[me];
      for (let n = 0; n < 300000; n++) if (s.__dice(`g${n}`).every((v: number) => v === 0)) return (e[2] = `g${n}`), true;
      return false;
    }],
    ["numbers itself as the referee", (s, table, me) => {
      const e = table[me];
      for (let n = 0; n < 300000; n++) if (s.__dice(`g${n}`).every((v: number) => v === 0)) return (e[2] = `g${n}`), (e[6] = me), (e[7] = "r"), true;
      return false;
    }],
    ["calls itself solo", (s, table, me) => {
      const e = table[me];
      for (let n = 0; n < 300000; n++) if (s.__dice(`g${n}`).every((v: number) => v === 0)) return (e[2] = `g${n}`), (e[6] = me), (e[7] = "s"), true;
      return false;
    }],
    ["names a witness that never answered", (s, table, me) => {
      const e = table[me];
      for (let n = 0; n < 300000; n++) if (s.__dice(`g${n}`).every((v: number) => v === 0)) return (e[2] = `g${n}`), (e[6] = "nobody"), (e[7] = "w"), true;
      return false;
    }],
  ];
  let seed = 91;
  for (const [name, grind] of grinders) {
    const { room, a, b, c } = await three(seed++);
    const all = [a, b, c];
    const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
    const others = all.filter((client) => client !== referee);
    const S = secrets(referee) as any;
    const officiate = S.officiate.bind(S);
    let ground = false;
    S.officiate = () => {
      officiate();
      if (ground || !S.mySecret) return;
      const table = S.numbers.working();
      const me = inst(referee, "probe").core.me.sid;
      if (!table[me] || table[me][0] !== S.mySecret.label) return;
      // a synchronous search, as a modified page would do it: the outcome its own number would give it
      const { Draw } = drawModule;
      S.__dice = (number: string) => new Draw(hex(S.mySecret.secret, number, S.mySecret.label)).Ints(5, 6);
      if (grind(S, table, me)) {
        ground = true;
        S.numbers.write(table);
      }
    };
    secrets(referee).beginDraw("hand1");
    await room.run(3000);
    assert.ok(ground, `${name}: the grinder found its five 1s`);
    assert.deepEqual(secrets(referee).myDraw("hand1")?.Ints(5, 6) ?? null, secrets(referee).myDraw("hand1") ? [0, 0, 0, 0, 0] : null);
    for (const client of others) {
      assert.notEqual(secrets(client).drawOf(referee.sid, "hand1").state, "numbered", `${name}: ${client.name} does not believe it`);
    }
    secrets(referee).revealDraw("hand1");
    await room.run(1500);
    for (const client of others) {
      const status = secrets(client).drawOf(referee.sid, "hand1");
      assert.notEqual(status.state, "revealed", `${name}: ${client.name} does not accept the reveal`);
      assert.equal(status.draw, null);
    }
    assert.ok(others.some((client) => client.logged("warn").some((line) => line.includes("could have chosen"))), `${name}: said why`);
  }

  // a referee that re-commits under the same label after seeing its witness's answer gets no second answer
  {
    const { room, a, b, c } = await three(99);
    const all = [a, b, c];
    const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
    const others = all.filter((client) => client !== referee);
    const S = secrets(referee) as any;
    S.officiate = () => {}; // holds its own entry back while it shops for an answer it likes
    secrets(referee).beginDraw("hand1");
    await room.run(1500);
    const prefix = inst(referee, "probe").core.prefix;
    const answersBefore = others.map((o) => JSON.stringify(JSON.parse(String(room.userStateOf(o.sid)[`${prefix}.k`] ?? "{}")).x?.fw ?? null));
    assert.ok(answersBefore.some((x) => x !== "null"), "the witness answered the first commitment");
    S.mySecret = null;
    S.restoring = null;
    secrets(referee).beginDraw("hand1"); // a new secret under the same label
    await room.run(1500);
    const answersAfter = others.map((o) => JSON.stringify(JSON.parse(String(room.userStateOf(o.sid)[`${prefix}.k`] ?? "{}")).x?.fw ?? null));
    assert.deepEqual(answersAfter, answersBefore, "no second answer");
  }
});

const drawModule = await import("../src/secrets.ts");
const shaModule = await import("../src/sha256.ts");
const utilModule = await import("../src/util.ts");
function hex(secret: string, number: string, label: string): string {
  return shaModule.toHex(shaModule.sha256(utilModule.utf8Encode(`${secret}\n${number}\n${label}`)));
}

test("a deal checks its contributor list: none but the referee, or not the players the game expects, does not verify", async () => {
  const { room, a, b, c } = await three(100);
  const all = [a, b, c];
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const seated = all.filter((client) => client !== referee);
  // a referee dealing alone could search seeds before committing: never verified
  secrets(referee).beginDeal("solo", []);
  await room.run(2000);
  secrets(referee).revealDeal("solo");
  await room.run(1500);
  for (const client of seated) {
    assert.deepEqual(secrets(client).dealContributors("solo"), []);
    assert.equal(secrets(client).verifyDeal("solo"), null, `${client.name}: a deal of the referee alone is not verified`);
    assert.ok(client.logged("warn").some((line) => line.includes("no contributor but the referee")));
  }
  assert.ok(referee.logged("warn").some((line) => line.includes("lists no player but the referee")), "the referee is told when it begins one");
  // a short list (one seated player left out) checks out on its own, but not against the seats the game expects
  secrets(referee).beginDeal("short", [seated[0]!.sid]);
  await room.run(3000);
  secrets(referee).revealDeal("short");
  await room.run(1500);
  const expected = seated.map((client) => client.sid);
  for (const client of seated) {
    assert.ok(secrets(client).verifyDeal("short"), "the deal itself checks out");
    assert.equal(secrets(client).verifyDeal("short", expected), null, `${client.name}: not the expected contributors`);
  }
  // the full list verifies against the expected seats
  secrets(referee).beginDeal("full", expected);
  await room.run(3000);
  secrets(referee).revealDeal("full");
  await room.run(1500);
  for (const client of seated) assert.ok(secrets(client).verifyDeal("full", [...expected].reverse()), client.name);
});
