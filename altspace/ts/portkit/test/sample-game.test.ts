// The sample game end to end on the fake room: seats, turns, a win, and everyone seeing the same thing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { allEqual, digests, gameOf, idOf, problems, SLUG, world } from "./helpers.ts";

test("two players sit down, play a game, and a watcher sees the same board", async () => {
  const { room, clients } = await world(3);
  const [a, b, c] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];

  // Ids are small, distinct, and the same from every client's point of view.
  const ids = clients.map((client) => idOf(client));
  assert.deepEqual([...ids].sort(), [1, 2, 3]);
  for (const client of clients) {
    const seen = client.instance(SLUG).networking.GetPlayers().map((p) => `${p.playerId}:${p.displayName}`);
    assert.deepEqual(seen, a.instance(SLUG).networking.GetPlayers().map((p) => `${p.playerId}:${p.displayName}`));
  }
  // Exactly one referee, and everyone names the same one.
  assert.equal(clients.filter((client) => client.instance(SLUG).networking.IsReferee).length, 1);
  assert.ok(allEqual(clients.map((client) => String(client.instance(SLUG).networking.Master?.playerId))));

  a.click(SLUG, "0", "seatX");
  await room.run(1500);
  b.click(SLUG, "0", "seatO");
  await room.run(1500);
  assert.deepEqual(gameOf(c).seats, [idOf(a), idOf(b)]);
  assert.equal(c.graph(SLUG).text.get("status"), "Player 1 to move");

  // X: 0, 1, 2 wins the top row; O answers in between.
  const moves: Array<[typeof a, number]> = [
    [a, 0],
    [b, 3],
    [a, 1],
    [b, 4],
    [a, 2],
  ];
  for (const [who, cell] of moves) {
    who.click(SLUG, "0", `cell${cell}`);
    await room.run(1200);
  }
  for (const client of clients) {
    assert.deepEqual(gameOf(client).board, [1, 1, 1, 2, 2, 0, 0, 0, 0]);
    assert.equal(gameOf(client).winner, 1);
    assert.equal(client.graph(SLUG).text.get("status"), "Player 1 wins");
    assert.equal(client.graph(SLUG).text.get("cell4"), "O");
  }
  assert.ok(allEqual(digests(clients)));

  // A move out of turn, by a watcher, or after the game is over changes nothing.
  c.click(SLUG, "0", "cell8");
  b.click(SLUG, "0", "cell8");
  await room.run(1000);
  assert.equal(gameOf(a).board[8], 0);
  assert.deepEqual(problems(clients), []);
});
