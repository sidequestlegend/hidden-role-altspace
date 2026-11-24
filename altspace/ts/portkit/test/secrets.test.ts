// Hidden information: the hash, commit and reveal, fair draws, sealed delivery.

import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256, sha256Text, Vector3 } from "../src/index.ts";
import { toHex } from "../src/sha256.ts";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { utf8Encode } from "../src/util.ts";
import { enter, inst, probe, probeGame, untilStarted } from "./games.ts";

test("SHA-256 in plain TypeScript matches the standard's vectors", () => {
  const hex = (text: string) => toHex(sha256(utf8Encode(text)));
  assert.equal(hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assert.equal(hex("a".repeat(1000)), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  assert.equal(hex("é✓"), toHex(sha256(new Uint8Array([0xc3, 0xa9, 0xe2, 0x9c, 0x93]))));
  assert.equal(sha256Text("abc").length, 43, "base64url of 32 bytes, no padding");
});

async function three(seed: number): Promise<{ room: FakeRoom; a: FakeClient; b: FakeClient; c: FakeClient }> {
  const room = new FakeRoom({ seed });
  const g = probeGame();
  const [a, b, c] = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b, c], "probe");
  return { room, a, b, c };
}

test("commit and reveal are synchronous; a commitment lives in its player's own user state", async () => {
  const { room, a, b } = await three(71);
  const secrets = (client: FakeClient) => probe(client).Secrets;

  // No await anywhere: translated rule code stays synchronous.
  const dice = [3, 3, 6, 1, 2];
  const commitment = secrets(a).commit({ dice, at: new Vector3(1, 2, 3) });
  secrets(a).publish("round1", commitment.hash);
  await room.run(1000);
  assert.equal(secrets(b).published(a.sid, "round1"), commitment.hash);
  // It is in a's user state, which the room lets only a write; it is not in the space state anyone can write.
  assert.ok(Object.values(room.userStateOf(a.sid)).some((leaf) => String(leaf).includes(commitment.hash)));
  assert.ok(!JSON.stringify(room.stateSnapshot()).includes(commitment.hash));

  const opening = commitment.reveal();
  assert.equal(secrets(b).verify(secrets(b).published(a.sid, "round1"), opening), true);
  assert.deepEqual(secrets(b).valueOf<{ dice: number[]; at: Vector3 }>(opening).dice, dice);
  assert.ok(secrets(b).valueOf<{ at: Vector3 }>(opening).at instanceof Vector3);
  // A different value, or the same value under another nonce, does not match.
  assert.equal(secrets(b).verify(commitment.hash, { v: { dice: [6, 6, 6, 6, 6], at: opening.v }, s: opening.s }), false);
  assert.equal(secrets(b).verify(commitment.hash, { v: opening.v, s: "AAAAAAAAAAAAAAAAAAAAAA" }), false);
  assert.equal(secrets(b).verify(null, opening), false);
  // Two commitments to the same value do not look alike.
  assert.notEqual(secrets(a).commit(dice).hash, secrets(a).commit(dice).hash);
  secrets(a).retract("round1");
  await room.run(1000);
  assert.equal(secrets(b).published(a.sid, "round1"), null);
});

test("a fair draw: the player commits, the referee answers, the draw is theirs alone until revealed", async () => {
  const { room, a, b, c } = await three(72);
  const all = [a, b, c];
  const secrets = (client: FakeClient) => probe(client).Secrets;
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const player = all.find((client) => client !== referee)!;
  const watcher = all.find((client) => client !== referee && client !== player)!;
  const playerId = inst(player, "probe").networking.LocalPlayer.playerId;

  secrets(player).beginDraw("round1");
  assert.equal(secrets(player).myDraw("round1"), null, "no draw before the referee's number");
  await room.run(2500);
  // The player knows their dice; everyone else knows only that there is a draw.
  const mine = secrets(player).myDraw("round1")!;
  const dice = mine.Ints(5, 6);
  assert.equal(dice.length, 5);
  assert.ok(dice.every((d) => d >= 0 && d < 6));
  for (const other of [referee, watcher]) {
    assert.deepEqual(secrets(other).drawOf(player.sid, "round1"), { state: "numbered", draw: null });
  }
  assert.deepEqual(probe(watcher).draws.map((d) => `${d.player}:${d.label}:${d.state}`), [`${playerId}:round1:committed`, `${playerId}:round1:numbered`]);

  secrets(player).revealDraw("round1");
  await room.run(1500);
  for (const client of all) {
    const status = secrets(client).drawOf(player.sid, "round1");
    assert.equal(status.state, "revealed");
    assert.deepEqual(status.draw!.Ints(5, 6), dice, `${client.name} computes the same dice`);
  }
  assert.equal(probe(watcher).draws.at(-1)!.state, "revealed");
  // Another round gives other dice (with overwhelming odds), and replaces the old draw.
  secrets(player).beginDraw("round2");
  await room.run(2500);
  assert.notDeepEqual(secrets(player).myDraw("round2")!.Ints(20, 6), mine.Ints(20, 6));
  assert.equal(secrets(watcher).drawOf(player.sid, "round1").state, "none");
});

test("a player who changes their secret after the referee's number is rejected", async () => {
  const { room, a, b, c } = await three(73);
  const all = [a, b, c];
  const secrets = (client: FakeClient) => probe(client).Secrets;
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const cheat = all.find((client) => client !== referee)!;

  secrets(cheat).beginDraw("round1");
  await room.run(2500);
  const first = secrets(cheat).myDraw("round1")!.Ints(5, 6);
  // The cheat does not like the dice: a new secret under the same label, hoping for a new number.
  secrets(cheat).beginDraw("round1");
  await room.run(2500);
  for (const client of all) assert.equal(secrets(client).drawOf(cheat.sid, "round1").state, "rejected", `${client.name} sees the swap`);
  // Revealing the new secret does not help: it is not what the referee's number was given for.
  secrets(cheat).revealDraw("round1");
  await room.run(1500);
  for (const client of all) assert.deepEqual(secrets(client).drawOf(cheat.sid, "round1"), { state: "rejected", draw: null });
  assert.equal(probe(referee).draws.at(-1)!.state, "rejected");
  assert.equal(first.length, 5);
});

test("a player who never reveals forfeits when the referee's deadline passes", async () => {
  const { room, a, b, c } = await three(74);
  const all = [a, b, c];
  const secrets = (client: FakeClient) => probe(client).Secrets;
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const [honest, silent] = all.filter((client) => client !== referee) as [FakeClient, FakeClient];

  secrets(honest).beginDraw("round1");
  secrets(silent).beginDraw("round1");
  await room.run(2500);
  secrets(silent).demandReveal("round1", 1);
  await room.run(500);
  secrets(referee).demandReveal("round1", 5); // only the referee's demand counts
  secrets(honest).revealDraw("round1");
  await room.run(3000);
  for (const client of all) {
    assert.equal(secrets(client).drawOf(honest.sid, "round1").state, "revealed");
    assert.equal(secrets(client).drawOf(silent.sid, "round1").state, "numbered", "the deadline has not passed yet");
  }
  await room.run(4000);
  for (const client of all) {
    assert.equal(secrets(client).drawOf(silent.sid, "round1").state, "forfeit");
    assert.equal(secrets(client).drawOf(honest.sid, "round1").state, "revealed");
    assert.equal(probe(client).draws.filter((d) => d.state === "forfeit").length, 1);
  }
  // Too late is too late.
  secrets(silent).revealDraw("round1");
  await room.run(1500);
  assert.equal(secrets(honest).drawOf(silent.sid, "round1").state, "forfeit");
});

test("sealed delivery: only the player it is for can open it", async () => {
  const { room, a, b, c } = await three(75);
  const secrets = (client: FakeClient) => probe(client).Secrets;
  assert.ok(secrets(a).canSealFor(b.sid));

  const hand = { cards: ["AS", "KD"], seat: 2 };
  const box = await secrets(a).seal(b.sid, hand);
  // (Not `includes("AS")`: base64 of random bytes holds any two letters now and then. That check failed about one run
  // in twenty, which was the cold-run flake. A quote never appears in base64, so the plain JSON cannot hide in it.)
  assert.ok(!box.includes('"AS"') && !box.includes('"cards"') && !box.includes('"KD"'), "the text gives nothing away");
  assert.deepEqual(await secrets(b).open(box), hand);
  assert.equal(secrets(b).isForMe(box), true);
  assert.equal(secrets(c).isForMe(box), false);
  await assert.rejects(secrets(c).open(box), /another player/);
  // Changed on the way.
  const parsed = JSON.parse(box);
  const flipped = parsed.c.slice(0, -2) + (parsed.c.endsWith("AA") ? "BB" : "AA");
  await assert.rejects(secrets(b).open(JSON.stringify({ ...parsed, c: flipped })), /could not be opened/);
  // Sealed by c but dressed up as coming from a: the key in it is not the one a announced.
  const forged = JSON.parse(await secrets(c).seal(b.sid, { cards: ["2C", "2D"], seat: 2 }));
  await assert.rejects(secrets(b).open(JSON.stringify({ ...forged, f: a.sid })), /does not come from/);
  await assert.rejects(secrets(a).seal("nobody", 1), /no public key/);

  // b's page reloads (same player, same device): the saved key still opens what was dealt before.
  b.leave();
  const g = probeGame();
  const again = enter(room, [g], { uid: b.uid, device: b.uid });
  await untilStarted(room, [a, c, again], "probe");
  assert.deepEqual(await secrets(again).open(box), hand);
  void room;
});

test("sealAll: one text of fixed size with an entry for everyone, whoever it really concerns", async () => {
  const { a, b, c } = await three(76);
  const secrets = (client: FakeClient) => probe(client).Secrets;

  // The same moment in two different games: once b is the saboteur, once c is.
  const first = await secrets(a).sealAll((sid) => (sid === b.sid ? { role: "saboteur", partners: [] } : { role: "crew" }));
  const second = await secrets(a).sealAll((sid) => (sid === c.sid ? { role: "saboteur", partners: [] } : undefined));
  assert.equal(first.length, second.length, "nothing about the size says who got what");
  assert.deepEqual(Object.keys(JSON.parse(first).m).sort(), [a.sid, b.sid, c.sid].sort());
  assert.deepEqual(Object.keys(JSON.parse(second).m), Object.keys(JSON.parse(first).m), "every player has an entry every time, in the same order");
  const sizes = Object.values(JSON.parse(second).m as Record<string, [string, string]>).map((entry) => entry[1].length);
  assert.equal(new Set(sizes).size, 1);

  assert.deepEqual(await secrets(b).openMine(first), { role: "saboteur", partners: [] });
  assert.deepEqual(await secrets(c).openMine(first), { role: "crew" });
  assert.deepEqual(await secrets(c).openMine(second), { role: "saboteur", partners: [] });
  assert.equal(await secrets(b).openMine(second), null, "an entry of padding opens as nothing");
  // An entry cannot be moved to another player.
  const swapped = JSON.parse(first);
  [swapped.m[b.sid], swapped.m[c.sid]] = [swapped.m[c.sid], swapped.m[b.sid]];
  await assert.rejects(secrets(b).openMine(JSON.stringify(swapped)), /could not be opened/);
  await assert.rejects(secrets(a).sealAll(() => "x".repeat(300), 256), /more than the slot/);
});

test("a dealt draw: the referee commits first, every listed player contributes, and the deal can be checked after", async () => {
  const { room, a, b, c } = await three(77);
  const all = [a, b, c];
  const secrets = (client: FakeClient) => probe(client).Secrets;
  const referee = all.find((client) => inst(client, "probe").networking.IsReferee)!;
  const seated = all.filter((client) => client !== referee);

  secrets(referee).beginDeal("hand1", seated.map((client) => client.sid));
  assert.equal(secrets(referee).dealDraw("hand1"), null, "nothing to deal before the players have contributed");
  await room.run(3000);
  for (const client of all) assert.equal(secrets(client).dealState("hand1"), "ready", client.name);
  const deck = secrets(referee).dealDraw("hand1")!;
  assert.ok(deck);
  for (const client of seated) assert.equal(secrets(client).dealDraw("hand1"), null, "only the referee can compute the deal before the reveal");
  // The referee committed to its seed before any contribution existed, and every contribution was committed
  // before any was shown: the referee's commitment is in its leaf, and each contribution in its player's.
  const order = deck.Ints(10, 52);
  secrets(referee).revealDeal("hand1");
  await room.run(1500);
  for (const client of all) {
    assert.equal(secrets(client).dealState("hand1"), "revealed");
    assert.deepEqual(secrets(client).verifyDeal("hand1")!.Ints(10, 52), order, `${client.name} checks the deal`);
  }
  // A new deal gives another order (with overwhelming odds).
  secrets(referee).beginDeal("hand2", seated.map((client) => client.sid));
  await room.run(3000);
  assert.notDeepEqual(secrets(referee).dealDraw("hand2")!.Ints(10, 52), order);
  // A forged reveal (a seed that is not the committed one) does not check out.
  const leaf = inst(referee, "probe").presence;
  const deal = leaf.extra(referee.sid, "dl") as Record<string, unknown>;
  leaf.setExtra("dl", { ...deal, r: "AAAAAAAAAAAAAAAAAAAAAA" });
  await room.run(1500);
  for (const client of seated) {
    assert.equal(secrets(client).dealState("hand2"), "invalid");
    assert.equal(secrets(client).verifyDeal("hand2"), null);
  }
});

test("RandomBytes: the strong generator, seeded in the fake room", async () => {
  const first = await three(78);
  const second = await three(78);
  const bytes = (client: FakeClient) => Array.from(probe(client).Random.Bytes(8));
  assert.equal(bytes(first.a).length, 8);
  assert.deepEqual(bytes(first.b), bytes(second.b), "the same seed gives the same bytes");
  assert.notDeepEqual(bytes(first.a), bytes(first.a));
  assert.equal(probe(first.c).Secrets.RandomBytes(16).length, 16);
});
