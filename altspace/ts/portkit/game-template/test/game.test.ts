// Rung 1: the rules on a fake room, with no Unity. Replace with the port's own tests.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { leafBudget } from "../portkit/src/index.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import game from "../src/index.ts";
import type { Counter } from "../src/Counter.ts";

const bindings = JSON.parse(readFileSync(fileURLToPath(new URL("../bindings.json", import.meta.url)), "utf8"));

test("two players see the same count, and so does a player who arrives later", async () => {
  const world = new TestWorld(game, bindings);
  const [ann, bob] = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await world.settle();

  ann.click(game.slug, "0", "button");
  await world.run(1500);
  bob.click(game.slug, "0", "button");
  await world.run(1500);
  assert.equal(world.behaviour<Counter>(ann, "b1").count, 2);
  assert.equal(bob.graph(game.slug).text.get("counterText"), "2");

  const cat = world.join({ name: "Cat" });
  await world.settle();
  assert.equal(world.behaviour<Counter>(cat, "b1").count, 2);
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

test("the game's state fits the room's key budget", () => {
  const world = new TestWorld(game, bindings);
  const budget = leafBudget(world.bindings, (type) => {
    const cls = game.behaviours[type];
    return cls ? { synced: (cls.synced ?? []).length, perPlayer: cls.perPlayer === true } : null;
  });
  // A room holds 2,048 keys for everything in it; leave most of them for other games and other copies.
  assert.ok(budget.spaceLeaves <= 200, `this game uses ${budget.spaceLeaves} space-state leaves per copy`);
  assert.ok(budget.userLeavesPerPlayer <= 6);
});
