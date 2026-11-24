import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import game from "../sample/src/index.ts";
import type { TicTacToe } from "../sample/src/TicTacToe.ts";
import { RulesBench } from "../src/testing.ts";

const bindings = JSON.parse(readFileSync(fileURLToPath(new URL("../sample/bindings.json", import.meta.url)), "utf8"));

test("a rules bench builds the behaviours from bindings and runs their methods with no room", () => {
  const bench = new RulesBench(game, bindings, { name: "Solo" }).start();
  const ttt = bench.behaviour<TicTacToe>("game");
  assert.equal(bench.ofType("Cell").length, 9);
  // the fields bindings give: the cells know the game
  assert.equal((bench.behaviour("c4") as unknown as { game: TicTacToe }).game, ttt);
  ttt.TakeSeat(0);
  for (const cell of [0, 3, 1, 4, 2]) {
    const me = bench.local.playerId; // one player plays both seats, taking whichever is to move
    ttt.seats = ttt.turn === 0 ? [me, 99] : [99, me];
    ttt.Play(cell);
  }
  assert.equal(ttt.winner, 1);
  assert.ok(bench.serializations >= 5);
});

test("an object the prefab had switched off is found, then switched off by the runtime (bindings active: false)", async () => {
  const { TestWorld } = await import("../src/testing.ts");
  const changed = JSON.parse(JSON.stringify(bindings));
  changed.objects.reset.active = false;
  const world = new TestWorld(game, changed);
  const ann = world.join({ name: "Ann" });
  await world.settle();
  await world.run(500);
  assert.equal(ann.object(game.slug, "0", "reset").active, false, "switched off on the host");
  assert.equal(world.instance(ann).objects.get("reset")!.activeSelf, false, "and in the script's mirror");
  assert.equal(ann.object(game.slug, "0", "seatX").active, true);
  assert.deepEqual(world.problems(), []);
});
