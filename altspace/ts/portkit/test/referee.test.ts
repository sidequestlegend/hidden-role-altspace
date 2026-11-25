// The referee: election, loss, takeover, and what stays true whatever order people come and go in.

import assert from "node:assert/strict";
import { test } from "node:test";
import { statePrefix } from "../src/index.ts";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { seededRandom } from "../src/util.ts";
import { enter, inst, probe, probeGame, running, untilStarted } from "./games.ts";
import { allEqual } from "./helpers.ts";

const refereeOf = (client: FakeClient, slug = "probe") => inst(client, slug).referee.current();
const isReferee = (client: FakeClient, slug = "probe") => inst(client, slug).networking.IsReferee;

test("the first player is elected; a second player obeys and never claims", async () => {
  const room = new FakeRoom({ seed: 3 });
  const g = probeGame();
  const a = enter(room, [g], { uid: "m" });
  await untilStarted(room, [a], "probe");
  assert.ok(isReferee(a));
  assert.equal(probe(a).wasMasterAtStart, true, "Start() already sees the master, as upstream init code expects");
  assert.deepEqual(probe(a).startKinds, ["fresh"]);

  // b sorts before a by user id, and still does not take over: a valid referee never changes.
  const b = enter(room, [g], { uid: "a" });
  await untilStarted(room, [a, b], "probe");
  await room.run(5000);
  assert.ok(isReferee(a));
  assert.ok(!isReferee(b));
  assert.equal(refereeOf(b)?.sid, a.sid);
  assert.equal(inst(a, "probe").referee.claims, 1);
  assert.equal(inst(b, "probe").referee.claims, 0);
  assert.deepEqual(probe(b).startKinds, ["joined"]);
  assert.deepEqual(probe(a).masters, [], "nobody was told of a change that did not happen");
});

test("when the referee leaves, the next in rank takes over, and takes over what the leaver owned", async () => {
  const room = new FakeRoom({ seed: 4 });
  const g = probeGame();
  const a = enter(room, [g], { uid: "u1" });
  await untilStarted(room, [a], "probe");
  const b = enter(room, [g], { uid: "u3" });
  const c = enter(room, [g], { uid: "u2" });
  await untilStarted(room, [a, b, c], "probe");
  probe(a).Set(42);
  await room.run(1500);
  const aId = inst(a, "probe").networking.LocalPlayer.playerId;
  const term = refereeOf(b)!.term;

  a.leave();
  await room.run(6000);
  // c ranks before b (u2 < u3), so c claimed first; b saw the claim and never made one.
  assert.ok(isReferee(c));
  assert.ok(!isReferee(b));
  assert.equal(refereeOf(b)?.sid, c.sid);
  assert.equal(refereeOf(b)?.term, term + 1);
  assert.equal(refereeOf(b)?.e, refereeOf(c)?.e, "the game goes on in the same epoch");
  assert.equal(inst(b, "probe").referee.claims, 0);
  // The state the leaver owned is still there, and now belongs to the new referee, on record.
  for (const client of [b, c]) {
    assert.equal(probe(client).value, 42);
    assert.equal(inst(client, "probe").networking.GetOwner(probe(client))?.sid, c.sid);
    assert.deepEqual(probe(client).masters, [inst(c, "probe").networking.LocalPlayer.playerId]);
    assert.deepEqual(probe(client).left, [aId]);
  }
  const owner = JSON.parse(String(room.stateSnapshot()[statePrefix("probe", "0") + ".o.p"]));
  assert.equal(owner.s, c.sid);
  // OnPlayerLeft waited for the new master, so "if (IsMaster) clean up" ran on exactly one client.
  assert.ok(probe(c).log.includes(`OnPlayerLeft:${aId}:master=true`));
  assert.ok(probe(b).log.includes(`OnPlayerLeft:${aId}:master=false`));
  // The new referee can write at once.
  probe(c).SetAsIs(43);
  await room.run(1500);
  assert.equal(probe(b).value, 43);
});

test("claims that cross on a slow network still end with one referee everyone agrees on", async () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    // Latency far above the 400 ms step: lower ranks claim before they can have heard of the first claim.
    const room = new FakeRoom({ seed, latency: [300, 900] });
    const g = probeGame();
    const clients = [enter(room, [g]), enter(room, [g]), enter(room, [g]), enter(room, [g])];
    await untilStarted(room, clients, "probe");
    await room.run(15000);
    const referees = clients.filter((client) => isReferee(client));
    assert.equal(referees.length, 1, `seed ${seed}: ${referees.length} referees`);
    assert.ok(allEqual(clients.map((client) => JSON.stringify(refereeOf(client)))), `seed ${seed}: views differ`);
    // And the room is quiet: nobody keeps claiming.
    const claims = clients.map((client) => inst(client, "probe").referee.claims).reduce((x, y) => x + y, 0);
    await room.run(10000);
    assert.equal(clients.map((client) => inst(client, "probe").referee.claims).reduce((x, y) => x + y, 0), claims);
  }
});

test("two pages claiming the same term in the same tick: one referee, and only it starts the game fresh", async () => {
  // Both pages enter in the same tick and claim at once (no rank step), so both write term 1 before either has heard
  // of the other, and each may see its own claim first. Each claimant waits until the record has stood still; the
  // one the room kept starts "fresh", the other "joined" as its follower (found by mini-golf, two courses in a room).
  const cases: Array<{ seed: number; latency?: [number, number]; step: number }> = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) cases.push({ seed, step: 0 }, { seed, latency: [300, 900], step: 400 });
  for (const { seed, latency, step } of cases) {
    const room = new FakeRoom({ seed, ...(latency ? { latency } : {}) });
    const g = probeGame("probe", { options: { claimStepMs: step } });
    const clients = [enter(room, [g], { uid: "u1" }), enter(room, [g], { uid: "u2" })];
    await untilStarted(room, clients, "probe");
    await room.run(5000);
    const label = `seed ${seed}, ${latency ? "slow" : "same tick"}`;
    const referees = clients.filter((client) => isReferee(client));
    assert.equal(referees.length, 1, `${label}: ${referees.length} referees`);
    assert.ok(allEqual(clients.map((client) => JSON.stringify(refereeOf(client)))), `${label}: views differ`);
    if (!latency) assert.deepEqual(clients.map((client) => inst(client, "probe").referee.claims), [1, 1], `${label}: both claimed`);
    for (const client of clients) {
      assert.deepEqual(probe(client).startKinds, [client === referees[0] ? "fresh" : "joined"], `${label}: ${client.name}`);
    }
    // The game runs: what the referee writes reaches the other page.
    probe(referees[0]!).Set(70 + seed);
    await room.run(4000);
    for (const client of clients) assert.equal(probe(client).value, 70 + seed, `${label}: ${client.name} has the referee's value`);
  }
});

test("random joins, leaves and writes: one referee, one owner, one state", async () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = seededRandom(seed * 101);
    const room = new FakeRoom({ seed, latency: [10, 180] });
    const g = probeGame();
    const alive: FakeClient[] = [];
    let counter = 0;
    let lastValue = 0;
    const join = () => alive.push(enter(room, [g], { uid: `u${String(Math.floor(rng() * 90) + 10)}-${counter++}` }));
    join();
    for (let step = 0; step < 30; step++) {
      const roll = rng();
      if (roll < 0.3 && alive.length < 6) join();
      else if (roll < 0.55 && alive.length > 1) {
        // Half the time the one who leaves is the referee, if there is one to be found.
        const started = alive.filter((client) => running(client, "probe"));
        const referee = started.find((client) => isReferee(client));
        const leaver = rng() < 0.5 && referee ? referee : alive[Math.floor(rng() * alive.length)]!;
        leaver.leave();
        alive.splice(alive.indexOf(leaver), 1);
      } else {
        const started = alive.filter((client) => running(client, "probe"));
        if (started.length) probe(started[Math.floor(rng() * started.length)]!).Set(++lastValue);
      }
      await room.run(Math.floor(rng() * 1200));
    }
    await room.run(12000);

    const label = `seed ${seed}, ${alive.length} left`;
    for (const client of alive) assert.ok(running(client, "probe"), `${label}: ${client.name} never started`);
    assert.equal(alive.filter((client) => isReferee(client)).length, 1, `${label}: referees`);
    assert.ok(allEqual(alive.map((client) => JSON.stringify(refereeOf(client)))), `${label}: referee views differ`);
    assert.ok(allEqual(alive.map((client) => inst(client, "probe").digest())), `${label}: state differs: ${alive.map((client) => probe(client).value).join(",")}`);
    const owners = alive.map((client) => inst(client, "probe").networking.GetOwner(probe(client))?.sid ?? "none");
    assert.ok(allEqual(owners), `${label}: owners differ: ${owners.join(",")}`);
    assert.ok(alive.some((client) => client.sid === owners[0]), `${label}: the owner is someone who is here`);
    const ids = alive.map((client) => inst(client, "probe").networking.LocalPlayer.playerId);
    assert.equal(new Set(ids).size, ids.length, `${label}: player ids clash: ${ids.join(",")}`);
    for (const client of alive) {
      const seen = inst(client, "probe").networking.GetPlayers().map((p) => p.playerId).sort((x, y) => x - y);
      assert.deepEqual(seen, [...ids].sort((x, y) => x - y), `${label}: ${client.name} sees other players`);
      assert.deepEqual(client.logged("error"), [], `${label}: ${client.name} logged errors`);
    }
  }
});

test("declared candidates: nobody eligible means no referee; a referee who withdraws is replaced", async () => {
  const room = new FakeRoom({ seed: 9 });
  const g = probeGame("lobby", { referee: "declared" });
  const [a, b, c] = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b, c], "lobby");
  const net = (client: FakeClient) => inst(client, "lobby").networking;
  const p = (client: FakeClient) => probe(client, "lobby");

  // Nobody has offered: the instance runs, idle. No referee, no owner, and nothing can be written.
  await room.run(5000);
  for (const client of [a, b, c]) {
    assert.equal(net(client).Master, null);
    assert.equal(net(client).IsReferee, false);
    assert.deepEqual(p(client).startKinds, ["idle"]);
    assert.equal(net(client).GetOwner(p(client)), null);
  }
  assert.equal(room.stateSnapshot()[statePrefix("lobby", "0") + ".ref"], undefined);
  p(a).Set(5);
  await room.run(1500);
  assert.equal(p(b).value, 0, "an idle instance syncs nothing");
  p(a).value = 0;

  // b joins the lobby: b, and only b, can be elected.
  net(b).SetRefereeCandidate(true);
  await room.run(4000);
  for (const client of [a, b, c]) {
    assert.equal(net(client).Master?.sid, b.sid);
    assert.ok(net(client).IsRefereeCandidate(net(client).GetPlayers().find((x) => x.sid === b.sid)!));
    assert.equal(p(client).masters.at(-1), net(b).LocalPlayer.playerId);
  }
  assert.deepEqual(p(b).startKinds, ["idle", "fresh"]);
  assert.deepEqual(p(a).startKinds, ["idle", "joined"]);
  p(b).SetAsIs(7);
  await room.run(1500);
  assert.equal(p(a).value, 7);

  // c offers too. b is still valid, so nothing changes.
  net(c).SetRefereeCandidate(true);
  await room.run(3000);
  assert.equal(net(a).Master?.sid, b.sid);

  // b leaves the lobby: b stops being referee, and c, the only candidate left, is elected. The game goes on.
  net(b).SetRefereeCandidate(false);
  await room.run(4000);
  for (const client of [a, b, c]) assert.equal(net(client).Master?.sid, c.sid);
  assert.equal(p(a).value, 7);
  assert.equal(net(a).GetOwner(p(a))?.sid, b.sid, "b still owns what it wrote: it is here, only not referee");

  // c withdraws as well: there is nobody to elect, and everyone is told the referee is gone.
  net(c).SetRefereeCandidate(false);
  await room.run(4000);
  for (const client of [a, b, c]) {
    assert.equal(net(client).Master, null);
    assert.equal(p(client).masters.at(-1), null);
  }
  assert.equal(inst(a, "lobby").referee.claims, 0, "a never offered, so a never claimed");
});

test("declared candidates: a departure while there is no referee reaches the next referee's handlers", async () => {
  const room = new FakeRoom({ seed: 19 });
  const g = probeGame("lobby2", { referee: "declared" });
  const [a, b, c] = [enter(room, [g]), enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b, c], "lobby2");
  const net = (client: FakeClient) => inst(client, "lobby2").networking;
  const p = (client: FakeClient) => probe(client, "lobby2");
  net(a).SetRefereeCandidate(true);
  await room.run(4000);
  assert.equal(net(b).Master?.sid, a.sid);
  // a withdraws: nobody is referee. c leaves in the gap.
  net(a).SetRefereeCandidate(false);
  await room.run(3000);
  assert.equal(net(b).Master, null);
  const cId = net(c).LocalPlayer.playerId;
  c.leave();
  await room.run(20000);
  assert.deepEqual(p(b).left, [], "held while nobody is referee");
  assert.equal(net(b).GetPlayerCount(), 2, "the player list itself is up to date");
  // b offers and is elected: the held departure is delivered now, with b as master.
  net(b).SetRefereeCandidate(true);
  await room.run(4000);
  assert.equal(net(b).Master?.sid, b.sid);
  assert.deepEqual(p(b).left, [cId]);
  assert.ok(p(b).log.includes(`OnPlayerLeft:${cId}:master=true`), p(b).log.join(" "));
  assert.deepEqual(p(a).left, [cId], "and to everyone else, once there is a referee");
});
