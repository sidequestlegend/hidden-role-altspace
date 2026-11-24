// The local player: input, poses, haptics, movement locks; clicks with a reach limit; where a dropped object
// is; and the pool of pre-placed objects.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Button, Hand, Quaternion, Vector3, type ObjectPool } from "../src/index.ts";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { enter, inst, makeGame, objectOf, probe, probeGame, untilStarted } from "./games.ts";

test("buttons, sticks, triggers, keys and poses reach behaviours; haptics, teleport and locks reach the player", async () => {
  const room = new FakeRoom({ seed: 111 });
  const g = probeGame();
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "probe");
  const p = probe(a);
  const input = p.Input;

  a.input({ type: "button", button: Button.Trigger, side: Hand.Right, pressed: true });
  assert.equal(input.GetButton(Button.Trigger, Hand.Right), true);
  assert.equal(input.GetButton(Button.Trigger, Hand.Left), false);
  a.input({ type: "button", button: Button.Trigger, side: Hand.Right, pressed: false });
  assert.deepEqual(p.buttons, ["+1/0", "-1/0"]);
  assert.equal(input.GetButton(Button.Trigger, Hand.Right), false);

  a.input({ type: "thumbstick", side: Hand.Left, x: 0.5, y: -1 });
  a.input({ type: "trigger", side: Hand.Right, value: 0.8 });
  assert.deepEqual([input.GetThumbstick(Hand.Left).x, input.GetThumbstick(Hand.Left).y], [0.5, -1]);
  assert.equal(input.GetTrigger(Hand.Right), 0.8);
  assert.equal(input.GetTrigger(Hand.Left), 0);

  // Desktop players have no second mouse button for a game action: games bind keys.
  a.input({ type: "key", key: "E", pressed: true });
  assert.equal(input.GetKey("E"), true);
  a.input({ type: "key", key: "E", pressed: false });
  a.input({ type: "key", key: "Space", pressed: true });
  assert.deepEqual(p.keys, ["+E", "-E", "+Space"]);
  assert.equal(probe(b).keys.length, 0, "input is the local player's alone");

  assert.equal(input.Poses, null);
  assert.equal(input.Position, null);
  a.pose(new Vector3(1, 1.6, 2));
  assert.deepEqual([input.Poses!.head.position.x, input.Poses!.head.position.y], [1, 1.6]);
  assert.ok(input.Position!.equals(new Vector3(1, 1.6, 2)));

  input.Haptic(Hand.Left, 0.5, 0.1);
  input.TeleportTo(new Vector3(0, 0, 5), 90);
  input.SetAbility("Move", false);
  input.SetBlock("RightTrigger", true);
  await room.run(100);
  assert.deepEqual(a.haptics, [{ side: 0, strength: 0.5, seconds: 0.1 }]);
  assert.deepEqual([a.teleports[0]!.position.z, a.teleports[0]!.yDegrees, a.teleports[0]!.stop], [5, 90, true]);
  assert.ok(input.Position!.equals(new Vector3(0, 0, 5)), "a teleport is where the player now is");
  assert.equal(a.abilities.get("Move"), false);
  assert.equal(a.blocks.get("RightTrigger"), true);

  // The instance goes away: what it locked is unlocked, because it runs in someone else's world.
  a.removeSnippet(a.env.doc.querySelectorAll("bs-snippet")[0] as never);
  await room.run(500);
  assert.equal(a.abilities.get("Move"), true);
  assert.equal(a.blocks.get("RightTrigger"), false);
});

test("Interact has a reach: a click from too far away does nothing", async () => {
  const room = new FakeRoom({ seed: 112 });
  const g = makeGame({
    slug: "reach",
    objects: ["clickNear", "clickFar", "clickAny"],
    behaviours: [
      { id: "near", type: "Probe", object: "clickNear" },
      { id: "bound", type: "Probe" },
    ],
    events: [
      { object: "clickFar", kind: "click", behaviour: "bound", method: "Interact", reach: 3 },
      { object: "clickAny", kind: "click", behaviour: "bound", method: "Later" },
    ],
    definition: { interactReach: 0.7 },
  });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "reach");
  const near = probe(a, "reach", "0", "near");
  const bound = probe(a, "reach", "0", "bound");
  const at = new Vector3(0, 1, 0);

  // Before the head's pose is known nothing can be measured, and the click counts.
  a.click("reach", "0", "clickNear", at);
  assert.equal(near.interacts, 1);

  a.pose(new Vector3(0, 1.6, 2));
  a.click("reach", "0", "clickNear", at);
  assert.equal(near.interacts, 1, "2 m away, with a reach of 0.7 m");
  a.pose(new Vector3(0, 1.5, 0.4));
  a.click("reach", "0", "clickNear", at);
  assert.equal(near.interacts, 2);

  // A binding can set its own reach, and one without a reach of its own follows the game's default.
  a.pose(new Vector3(0, 1.6, 2));
  a.click("reach", "0", "clickFar", at);
  assert.equal(bound.interacts, 1);
  a.pose(new Vector3(0, 1.6, 9));
  a.click("reach", "0", "clickFar", at);
  assert.equal(bound.interacts, 1);
  a.click("reach", "0", "clickAny", at);
  assert.equal(bound.delayed.length, 0);
  a.pose(new Vector3(0, 1.2, 0.3));
  a.click("reach", "0", "clickAny", at);
  assert.equal(bound.delayed.length, 1);
});

test("a drop handler reads where the object was let go, synchronously", async () => {
  const room = new FakeRoom({ seed: 113 });
  const g = makeGame({ slug: "chess", objects: ["syncPiece"], behaviours: [{ id: "piece", type: "Probe", object: "syncPiece" }] });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "chess");
  const piece = probe(a, "chess", "0", "piece");

  // Where things stand is known from the start, without the game asking.
  assert.ok(piece.transform.known);
  assert.ok(piece.transform.position.equals(Vector3.zero));

  // The player carries the piece across the board and lets go: the page was last told of an earlier position.
  a.grab("chess", "0", "syncPiece");
  a.move("chess", "0", "syncPiece", new Vector3(0.1, 1, 0.1));
  await room.run(100);
  assert.ok(piece.transform.position.equals(new Vector3(0.1, 1, 0.1)), "the mirror follows a watched object");
  a.move("chess", "0", "syncPiece", new Vector3(0.35, 1, 0.42), Quaternion.Euler(0, 90, 0));
  a.drop("chess", "0", "syncPiece");
  assert.equal(piece.drops.length, 0, "the handler waits for one round trip to the host");
  await room.run(50);
  // OnDrop itself is plain synchronous code reading transform.position.
  assert.deepEqual(piece.drops, [{ x: 0.35, y: 1, z: 0.42 }]);
  assert.ok(Math.abs(piece.transform.eulerAngles.y - 90) < 1e-6);

  // The other player's copy of the synced object follows its owner, and their mirror with it.
  await room.run(500);
  assert.ok(probe(b, "chess", "0", "piece").transform.position.equals(new Vector3(0.35, 1, 0.42)));
  assert.equal(probe(b, "chess", "0", "piece").drops.length, 0);

  // Script-driven placement is mirrored at once and reaches the host.
  piece.transform.position = new Vector3(0.5, 1, 0.5);
  assert.ok(piece.transform.position.equals(new Vector3(0.5, 1, 0.5)));
  await room.run(50);
  assert.ok(a.object("chess", "0", "syncPiece").truePosition.equals(new Vector3(0.5, 1, 0.5)));
  // Asking the host on purpose is one of the few awaits game code needs.
  a.move("chess", "0", "syncPiece", new Vector3(0.7, 1, 0.7));
  const refreshed = piece.transform.Refresh();
  await room.run(10);
  await refreshed;
  assert.ok(piece.transform.position.equals(new Vector3(0.7, 1, 0.7)));
});

test("a pool of pre-placed objects: the owner spawns and places, everyone sees the same, latecomers too", async () => {
  const room = new FakeRoom({ seed: 114 });
  const cups = ["cup0", "cup1", "cup2", "cup3"];
  const g = makeGame({
    slug: "pong",
    objects: cups,
    refs: cups,
    behaviours: [
      { id: "p", type: "Probe" },
      { id: "pool", type: "ObjectPool", fields: { Pool: cups.map((key) => ({ $obj: key })) } },
    ],
  });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "pong");
  const pool = (client: FakeClient) => inst(client, "pong").behaviour<ObjectPool>("pool");
  const owner = [a, b].find((client) => inst(client, "pong").networking.IsOwner(pool(client)))!;
  const other = owner === a ? b : a;
  await room.run(300);
  // Pooled objects start switched off, on every client.
  for (const client of [a, b]) for (const cup of cups) assert.equal(client.graph("pong").active.get(cup), false);

  assert.equal(pool(other).TryToSpawn(), null, "only the owner spawns");
  const first = pool(owner).Spawn(new Vector3(1, 0, 0), Quaternion.Euler(0, 45, 0))!;
  const second = pool(owner).TryToSpawn()!;
  pool(owner).TeleportTo(second, new Vector3(2, 0, 0));
  assert.equal(first, objectOf(owner, "pong", "0", "cup0"));
  assert.equal(pool(owner).ActiveCount, 2);
  await room.run(1500);
  for (const client of [a, b]) {
    assert.deepEqual(cups.map((cup) => client.graph("pong").active.get(cup)), [true, true, false, false]);
    assert.ok(client.object("pong", "0", "cup0").truePosition.equals(new Vector3(1, 0, 0)));
    assert.ok(client.object("pong", "0", "cup1").truePosition.equals(new Vector3(2, 0, 0)));
    assert.equal(pool(client).IsActive(objectOf(client, "pong", "0", "cup1")), true);
  }
  // The same pose again is a new teleport: it is applied again even though the numbers have not changed.
  owner.move("pong", "0", "cup0", new Vector3(9, 9, 9));
  other.move("pong", "0", "cup0", new Vector3(8, 8, 8));
  pool(owner).TeleportTo(first, new Vector3(1, 0, 0), Quaternion.Euler(0, 45, 0));
  pool(owner).Return(second);
  await room.run(1500);
  for (const client of [a, b]) {
    assert.ok(client.object("pong", "0", "cup0").truePosition.equals(new Vector3(1, 0, 0)));
    assert.deepEqual(cups.map((cup) => client.graph("pong").active.get(cup)), [true, false, false, false]);
  }

  const c = enter(room, [g]);
  await untilStarted(room, [a, b, c], "pong");
  await room.run(500);
  assert.deepEqual(cups.map((cup) => c.graph("pong").active.get(cup)), [true, false, false, false]);
  assert.ok(c.object("pong", "0", "cup0").truePosition.equals(new Vector3(1, 0, 0)));
  // All four in use: the next request gets nothing.
  for (let i = 0; i < 3; i++) assert.ok(pool(owner).TryToSpawn());
  assert.equal(pool(owner).TryToSpawn(), null);
});
