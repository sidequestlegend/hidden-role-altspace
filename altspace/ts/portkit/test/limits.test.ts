// The room's limits: leaf size (chunking), the rate bucket, the key count, one-shot size, protected state, and
// how game code hears that a write was refused.

import assert from "node:assert/strict";
import { test } from "node:test";
import { statePrefix } from "../src/index.ts";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { decodeLeaf, encodeLeaf } from "../src/leaf.ts";
import { jsonLeafBytes } from "../src/util.ts";
import { enter, inst, makeGame, probe, probeGame, untilStarted } from "./games.ts";

test("a value too large for one leaf travels in chunks and is put together again", async () => {
  const room = new FakeRoom({ seed: 61 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");
  const prefix = statePrefix("probe", "0") + ".";

  // 40,000 characters, with quotes, backslashes and non-ASCII text that cost more than a byte each.
  const big = ('He said "hi" \\ é ✓ '.repeat(40) + "\n").repeat(56);
  assert.ok(big.length > 40000);
  probe(a).Set(1, big);
  await room.run(3000);
  assert.equal(probe(b).text, big);
  assert.equal(probe(b).deserialized, 1, "one write, one deserialisation, however many leaves it took");
  const chunks = room.stateKeys(prefix + "c.p.");
  assert.ok(chunks.length >= 3, `expected several chunk leaves, got ${chunks.length}`);
  for (const key of room.stateKeys(prefix)) {
    assert.ok(jsonLeafBytes(String(room.stateSnapshot()[key])) <= 16384, `${key} is within the leaf limit`);
  }
  assert.ok(probe(a).posts.at(-1)!.byteCount > 40000);

  // A late joiner puts it together from the snapshot.
  const c = enter(room, [g]);
  await untilStarted(room, [a, b, c], "probe");
  assert.equal(probe(c).text, big);

  // Back to a small value: one leaf again, and the chunk leaves are blanked rather than left to mislead.
  probe(a).text = "small";
  probe(a).SetAsIs(2);
  await room.run(3000);
  assert.equal(probe(b).text, "small");
  assert.equal(probe(c).text, "small");
  for (const key of room.stateKeys(prefix + "c.p.")) assert.equal(room.stateSnapshot()[key], "");
  assert.ok(!String(room.stateSnapshot()[prefix + "v.p"]).includes('"c":'));
});

test("the leaf codec: sizes are measured as the server measures them, and a half-arrived value waits", () => {
  const text = 'q"\\'.repeat(9000);
  const encoded = encodeLeaf("b1", { e: 1, g: 2, n: 3, w: "s", d: { text } }, 16384, 0);
  assert.ok(encoded.chunks >= 3);
  const store = new Map(encoded.writes);
  for (const [, value] of encoded.writes) assert.ok(jsonLeafBytes(value) <= 16384);
  const whole = decodeLeaf("b1", (key) => store.get(key));
  assert.equal(whole.kind, "value");
  assert.deepEqual(whole.kind === "value" ? whole.record : null, { e: 1, g: 2, n: 3, w: "s", d: { text } });
  // One chunk of an older write in the way: the reader waits instead of joining pieces of two writes.
  store.set("c.b1.1", "2.1~stale");
  assert.equal(decodeLeaf("b1", (key) => store.get(key)).kind, "pending");
  store.delete("c.b1.0");
  assert.equal(decodeLeaf("b1", (key) => store.get(key)).kind, "pending");
  assert.equal(decodeLeaf("b2", (key) => store.get(key)).kind, "none");
  assert.equal(decodeLeaf("b3", () => "not json").kind, "bad");
  // Shrinking from four chunks to none blanks the four.
  const small = encodeLeaf("b1", { e: 1, g: 2, n: 4, w: "s", d: 1 }, 16384, 4);
  assert.deepEqual(small.writes.map(([key, value]) => [key, value === ""]), [["v.b1", false], ["c.b1.0", true], ["c.b1.1", true], ["c.b1.2", true], ["c.b1.3", true]]);
});

test("a storm of writes is merged into a few batches and never trips the room's rate limit", async () => {
  const room = new FakeRoom({ seed: 62 });
  const behaviours = [];
  for (let i = 0; i < 60; i++) behaviours.push({ id: `p${i}`, type: "Probe" });
  const g = makeGame({ slug: "storm", behaviours });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "storm");
  await room.run(4000);
  const batchesBefore = a.app.stats.batches;

  // 60 behaviours rewritten on every tick for three seconds: 3,600 serialisations.
  for (let tick = 1; tick <= 60; tick++) {
    for (let i = 0; i < 60; i++) probe(a, "storm", "0", `p${i}`).Set(tick * 100 + i);
    await room.run(50);
  }
  await room.run(4000);
  for (let i = 0; i < 60; i++) assert.equal(probe(b, "storm", "0", `p${i}`).value, 6000 + i, `p${i} converged on the last value`);
  assert.equal(a.instance("storm").digest(), b.instance("storm").digest());
  const batches = a.app.stats.batches - batchesBefore;
  assert.ok(batches <= 45, `the app sent ${batches} batches for 3,600 writes (at most one per 0.2 s)`);
  assert.equal(room.stats.rateLimited, 0);
  assert.equal(a.notes.filter((n) => n.startsWith("rate_limited")).length, 0);
  // The receiver was not told 3,600 times either: it only saw what reached the room.
  assert.ok(probe(b, "storm", "0", "p0").deserialized <= 20);
});

test("when the bucket does run dry, writes are late, not lost", async () => {
  // A room 20 times stingier than the real one, so that ordinary play runs into the limit.
  const room = new FakeRoom({ seed: 63, bucketRate: 1, bucketBurst: 2 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");
  for (let i = 1; i <= 40; i++) {
    probe(a).Set(i);
    await room.run(100);
  }
  await room.run(20000);
  assert.ok(room.stats.rateLimited > 0, "the limit was hit");
  assert.equal(probe(b).value, 40, "and the last value still arrived");
  assert.equal(inst(a, "probe").digest(), inst(b, "probe").digest());
  // Writes that go straight to the room (user state) are reported while they wait, as not final.
  const waiting = [a, b].flatMap((client) => probe(client).refusals).filter((r) => r.code === "rate_limited");
  for (const refusal of waiting) assert.equal(refusal.final, false);
});

test("game code is told when the room refuses a write: key limit, leaf limit, one-shot size", async (t) => {
  await t.test("too many keys", async () => {
    const room = new FakeRoom({ seed: 64, maxRoomKeys: 40 });
    const g = probeGame();
    const a = enter(room, [g]);
    await untilStarted(room, [a], "probe");
    // Something else fills the room up to its key limit, leaving room for one more key.
    const have = room.stateKeys().length;
    for (let i = 0; i < 40 - have - 1; i++) room.stuff(`other.thing.k${i}`, "x");
    probe(a).Set(5);
    await room.run(3000);
    // The owner record took the last key; the value was refused.
    assert.deepEqual(probe(a).posts.map((p) => p.success), [true, false]);
    const refusal = probe(a).refusals.find((r) => r.kind === "state");
    assert.deepEqual(refusal && { code: refusal.code, final: refusal.final }, { code: "too_many_keys", final: true });
    assert.ok(refusal!.key.startsWith("v.p"));
    assert.ok(a.logged("error").some((line) => line.includes("too_many_keys")));
  });

  await t.test("a leaf the room will not take", async () => {
    // The room's limit is smaller than the one the runtime chunks for, so a single leaf arrives too large.
    const room = new FakeRoom({ seed: 65, maxLeafBytes: 1000 });
    const g = probeGame();
    const [a, b] = [enter(room, [g]), enter(room, [g])];
    await untilStarted(room, [a, b], "probe");
    probe(a).Set(1, "y".repeat(3000));
    await room.run(3000);
    assert.equal(probe(a).posts.at(-1)!.success, false);
    assert.ok(probe(a).refusals.some((r) => r.code === "value_too_large" && r.final));
    assert.equal(probe(b).text, "", "nobody else saw a value that was never stored");
  });

  await t.test("a network event too large to send", async () => {
    const room = new FakeRoom({ seed: 66 });
    const g = probeGame();
    const [a, b] = [enter(room, [g]), enter(room, [g])];
    await untilStarted(room, [a, b], "probe");
    probe(a).Broadcast("z".repeat(5000));
    await room.run(1000);
    assert.deepEqual(probe(a).refusals.map((r) => [r.kind, r.code, r.key]), [["event", "oneshot_too_large", "Ping"]]);
    assert.equal(probe(b).pings.length, 0);
    assert.equal(probe(a).pings.length, 1, "it still ran here, as an All event does");
    // One that fits goes through, non-ASCII and all.
    probe(a).Broadcast("é".repeat(500), { n: 1 });
    await room.run(1000);
    assert.deepEqual(probe(b).pings.map((p) => p.args), [["é".repeat(500), { n: 1 }]]);
  });
});

test("protected values: the owner writes, everyone reads, and anyone else is refused and told", async () => {
  const room = new FakeRoom({ seed: 67, owner: "boss", moderators: ["mod"] });
  const g = probeGame();
  const boss = enter(room, [g], { uid: "boss" });
  const mod = enter(room, [g], { uid: "mod" });
  const guest = enter(room, [g], { uid: "guest" });
  const all: FakeClient[] = [boss, mod, guest];
  await untilStarted(room, all, "probe");
  const prot = (client: FakeClient) => probe(client).Protected;

  assert.equal(inst(boss, "probe").networking.LocalPlayer.isSpaceAdmin, true);
  assert.equal(inst(guest, "probe").networking.LocalPlayer.isSpaceAdmin, false);
  // Everyone sees who is an admin, not only the admins themselves.
  assert.equal(inst(guest, "probe").networking.GetPlayers().find((p) => p.sid === mod.sid)!.isSpaceAdmin, true);
  assert.deepEqual(all.map((client) => prot(client).CanWrite), [true, true, false]);

  prot(boss).Set("gameMaster", "mod");
  await room.run(1500);
  for (const client of all) {
    assert.equal(prot(client).Get("gameMaster", ""), "mod");
    assert.deepEqual(probe(client).protectedChanges, ["gameMaster"]);
  }

  // A guest tries the same key, and a new one: the room refuses both, and the guest's game is told.
  prot(guest).Set("gameMaster", "guest");
  prot(guest).Set("whitelist", ["guest"]);
  await room.run(3000);
  for (const client of all) {
    assert.equal(prot(client).Get("gameMaster", ""), "mod");
    assert.equal(prot(client).Has("whitelist"), false);
  }
  const refused = probe(guest).refusals.filter((r) => r.kind === "protected");
  assert.deepEqual(refused.map((r) => r.key).sort(), ["gameMaster", "whitelist"]);
  assert.ok(refused.every((r) => r.final));
  assert.equal(probe(boss).refusals.length, 0);

  // A moderator may write. And nobody can write a protected path as a public one.
  prot(mod).Set("whitelist", ["guest", "mod"]);
  await room.run(1500);
  assert.deepEqual(prot(guest).Get<string[]>("whitelist", []), ["guest", "mod"]);
  inst(guest, "probe").platform.stateSet(statePrefix("probe", "0") + ".x.gameMaster", '{"v":"guest"}');
  await room.run(1500);
  assert.equal(prot(boss).Get("gameMaster", ""), "mod");
  assert.ok(probe(guest).refusals.some((r) => r.code === "protected_path"));
});
