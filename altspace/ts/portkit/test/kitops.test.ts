// Relay ops added for the first game ports: audio pitch and volume, a scaled one-shot, Animator.enabled, uGUI values
// set without their events, scale, rigidbody, spawn and despawn, and a game's own ops from TypeScript. Clicks: which
// hand, and reach from the nearest of head and hands.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AnimatorRef, AudioClipRef, AudioSourceRef, Button, Hand, Quaternion, Vector3 } from "../src/index.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { makeComponent } from "../src/scene.ts";
import { enter, inst, makeGame, objectOf, probe, Sheet, untilStarted } from "./games.ts";

test("audio pitch and volume, a scaled one-shot and Animator.enabled reach the graph, sent once per change", async () => {
  const room = new FakeRoom({ seed: 131 });
  const g = makeGame({ slug: "ops", objects: ["speaker", "door"], behaviours: [{ id: "p", type: "Probe", object: "speaker" }] });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "ops");
  const instance = inst(a, "ops");
  const speaker = makeComponent("AudioSource", objectOf(a, "ops", "0", "speaker"), instance.host) as AudioSourceRef;
  const animator = makeComponent("Animator", objectOf(a, "ops", "0", "door"), instance.host) as AnimatorRef;

  speaker.pitch = 1.25;
  speaker.volume = 0.5;
  speaker.volume = 0.5; // unchanged: not sent again
  speaker.PlayOneShot(new AudioClipRef(2, "speaker"), 0.3);
  speaker.clip = new AudioClipRef(1);
  speaker.Play();
  animator.enabled = false;
  await room.run(200);
  const graph = a.graph("ops");
  assert.deepEqual(graph.values.get("speaker/audioPitch"), ["1.25"]);
  assert.deepEqual(graph.values.get("speaker/audioVolume"), ["0.5"]);
  assert.deepEqual(graph.values.get("door/animEnabled"), ["0"]);
  assert.equal(graph.records.filter((r) => r.op === "audioVolume").length, 1);
  assert.deepEqual(
    graph.events.filter((e) => e.op.startsWith("audio")).map((e) => [e.op, ...e.args]),
    [
      ["audioScaled", "2", "speaker", "0.3"],
      ["audio", "1", "speaker"],
    ],
  );
  assert.equal(speaker.pitch, 1.25);
  assert.equal(animator.enabled, false);

  // uGUI values without their events, scale, rigidbody, spawn and despawn.
  const host = instance.host;
  host.uiSetToggle("door", true);
  host.uiSetSlider("door", 0.25);
  host.scale("@Root/cup 3", new Vector3(1, 2, 1));
  host.rbKinematic("speaker", true);
  host.rbVelocity("speaker", new Vector3(0, 3, -1.5));
  host.spawn("@Root/cupTemplate", "cup 3");
  host.despawn("@Root/cup 3");
  await room.run(200);
  assert.deepEqual(graph.values.get("door/uiSetToggle"), ["1"]);
  assert.deepEqual(graph.values.get("door/uiSetSlider"), ["0.25"]);
  assert.deepEqual(graph.values.get("@Root/cup 3/scale"), ["1", "2", "1"]);
  assert.deepEqual(graph.values.get("speaker/rbKinematic"), ["1"]);
  assert.deepEqual(
    graph.events.slice(-3).map((e) => [e.op, e.target, ...e.args]),
    [
      ["rbVelocity", "speaker", "0", "3", "-1.5"],
      ["spawn", "@Root/cupTemplate", "cup 3"],
      ["despawn", "@Root/cup 3"],
    ],
  );
  // A launch: one op (kinematic off now, the velocity two physics steps later, in the graph); kinematic can be set again after.
  host.rbLaunch("speaker", new Vector3(1, 2.5, 0));
  host.rbKinematic("speaker", true);
  await room.run(200);
  assert.deepEqual(graph.events.slice(-1).map((e) => [e.op, e.target, ...e.args]), [["rbLaunch", "speaker", "1", "2.5", "0"]]);
  assert.equal(graph.records.filter((r) => r.op === "rbKinematic").length, 2, "rbKinematic(true) goes again after a launch");
  assert.deepEqual(a.notes.filter((n) => n.startsWith("graph")), []);
});

test("a game's own relay op from TypeScript: batched with the rest, values cached, the fake graph answers to it", async () => {
  const room = new FakeRoom({ seed: 132 });
  const seen: string[] = [];
  room.defineRelayOp("cup", (record, client) => seen.push(`${client.name}:${record.target}:${record.args.join(",")}`));
  room.defineRelayOp("ballPhys");
  const g = makeGame({ slug: "ops2", objects: ["table"], behaviours: [{ id: "p", type: "Probe", object: "table" }] });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "ops2");
  const host = probe(a, "ops2").Host;
  const payloadsBefore = inst(a, "ops2").host.payloadsSent;
  host.op("cup", "table", [3, true, "a|b"], "state3");
  host.op("cup", "table", [3, true, "a|b"], "state3"); // the same value: not sent again
  host.op("ballPhys", "@Root/ball", [0.5, -2]);
  host.op("ballPhys", "@Root/ball", [0.5, -2]); // an event: sent every time
  host.setText("table", "hello");
  await room.run(200);
  assert.equal(inst(a, "ops2").host.payloadsSent - payloadsBefore, 1, "one batched payload for the tick");
  assert.deepEqual(seen, [`${a.name}:table:3,1,a|b`]);
  assert.equal(a.graph("ops2").events.filter((e) => e.op === "ballPhys").length, 2);
  assert.deepEqual(a.notes.filter((n) => n.startsWith("graph")), []);
  assert.throws(() => host.op("clock", "table", []), /not a relay op name/);
  assert.throws(() => host.op("bad|name", "table", []), /not a relay op name/);
  // An op the test did not declare is still noted, as before.
  host.op("unknownToTheRoom", "table", []);
  await room.run(200);
  assert.ok(a.notes.some((n) => n.includes("unknown op unknownToTheRoom")));
});

test("a click says which hand: the one whose trigger just went down, else the nearest; haptics buzz that hand", async () => {
  const room = new FakeRoom({ seed: 133 });
  const g = makeGame({ slug: "hands", objects: ["clickA"], behaviours: [{ id: "p", type: "Probe", object: "clickA" }] });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "hands");
  const p = probe(a, "hands");
  const sides: Array<number | undefined> = [];
  objectOf(a, "hands", "0", "clickA").On("click", (detail) => sides.push(detail.side));
  const at = new Vector3(0, 1, 0);

  // Desktop, nothing known: no hand.
  a.click("hands", "0", "clickA", at);
  assert.deepEqual(sides, [undefined]);
  assert.equal(p.Input.LastClickSide, null);

  // The left trigger went down just before the click.
  a.input({ type: "button", button: Button.Trigger, side: Hand.Left, pressed: true });
  a.input({ type: "button", button: Button.Trigger, side: Hand.Left, pressed: false });
  a.click("hands", "0", "clickA", at);
  assert.equal(sides.at(-1), 0);
  assert.equal(p.Input.LastClickSide, 0);
  p.Input.Haptic(p.Input.LastClickSide!, 0.5, 0.1);
  await room.run(100);
  assert.deepEqual(a.haptics.at(-1), { side: 0, strength: 0.5, seconds: 0.1 });

  // Long after any trigger: the hand nearest the point.
  await room.run(1500);
  const q = new Quaternion();
  a.pose({ head: { position: new Vector3(0, 1.6, 1), rotation: q }, leftHand: { position: new Vector3(-0.5, 1, 0.5), rotation: q }, rightHand: { position: new Vector3(0.1, 1, 0.1), rotation: q } });
  a.click("hands", "0", "clickA", at);
  assert.equal(sides.at(-1), 1);
  assert.equal(p.Input.LastClickSide, 1);
});

test("click reach is measured from the nearest of head and hands, and a behaviour can set its own", async () => {
  const room = new FakeRoom({ seed: 134 });
  const g = makeGame({ slug: "reach2", objects: ["clickA"], behaviours: [{ id: "p", type: "Probe", object: "clickA" }], definition: { interactReach: 0.7 } });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "reach2");
  const p = probe(a, "reach2");
  const at = new Vector3(0, 1, 0);
  const q = new Quaternion();
  // The head is 1.2 m away, the right hand 0.3 m: the click counts.
  a.pose({ head: { position: new Vector3(0, 1.6, 1), rotation: q }, leftHand: { position: new Vector3(-1, 1, 1), rotation: q }, rightHand: { position: new Vector3(0, 1, 0.3), rotation: q } });
  a.click("reach2", "0", "clickA", at);
  assert.equal(p.interacts, 1);
  assert.equal(p.Input.InReach(at, 0.7), true);
  assert.equal(p.Input.InReach(at, 0.2), false);
  assert.equal(p.Input.InReach(at, 0), true, "0 is any distance");
  // A setting read at run time: this behaviour's own reach.
  p.InteractReach = 0.2;
  a.click("reach2", "0", "clickA", at);
  assert.equal(p.interacts, 1, "0.3 m is beyond its own 0.2 m");
  p.InteractReach = 0;
  a.pose(new Vector3(0, 1.6, 30));
  a.click("reach2", "0", "clickA", at);
  assert.equal(p.interacts, 2, "0: any distance");
  p.InteractReach = undefined;
  a.click("reach2", "0", "clickA", at);
  assert.equal(p.interacts, 2, "back to the game's 0.7 m");
  assert.equal(p.InstanceKey, "0");
});

test("a text field's edit reaches the bound method as its text, decoded", async () => {
  const room = new FakeRoom({ seed: 135 });
  const g = makeGame({
    slug: "field",
    objects: ["nameField"],
    behaviours: [{ id: "p", type: "Probe", object: "nameField" }],
    events: [{ object: "nameField", kind: "field", behaviour: "p", method: "OnGraph" }],
  });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "field");
  const index = g.bindings.refs.indexOf("nameField");
  a.graphEvent("field", "0", "field", `${index}|Ann%7C%22left%22%0Ahere`);
  a.graphEvent("field", "0", "field", `${index}|left`);
  assert.deepEqual(probe(a, "field").graph, [["Ann|\"left\"\nhere"], ["left"]]);
  // The page sets a field's text with the text op, as any other text.
  probe(a, "field").Host.setText("nameField", "Bob");
  await room.run(100);
  assert.equal(a.graph("field").text.get("nameField"), "Bob");
});

test("a graph's collision event carries the other object, point and normal; ReleaseGrab drops; IsVR is asked once", async () => {
  const room = new FakeRoom({ seed: 136 });
  const g = makeGame({ slug: "phys", objects: ["grabBall"], behaviours: [{ id: "p", type: "Probe", object: "grabBall" }] });
  const a = room.join();
  a.vr = true;
  room.defineKit(g.kit, g.bindings);
  a.load(g.game, g.bindings);
  a.addSnippet("phys", { windows: g.kit });
  await untilStarted(room, [a], "phys");
  await room.run(100);
  const p = probe(a, "phys");
  assert.equal(p.Input.IsVR, true);
  const hits: Array<unknown> = [];
  p.gameObject.On("collisionEnter", (d) => hits.push([d.otherName, d.point?.x, d.normal?.y, d.args?.length]));
  const index = g.bindings.refs.indexOf("grabBall");
  a.graphEvent("phys", "0", "collisionEnter", `${index}|Cup%207|0.1|0.9|-0.2|0|1|0`);
  assert.deepEqual(hits, [["Cup 7", 0.1, 1, 7]]);
  // Held, then let go by the game: the page hears drop, as when the player lets go.
  assert.ok(a.grab("phys", "0", "grabBall"));
  p.gameObject.ReleaseGrab();
  await room.run(100);
  assert.equal(p.drops.length, 1);
});

test("per-player behaviours get their own object events on the local player's copy; a kit object attaches to a hand", async () => {
  const room = new FakeRoom({ seed: 137 });
  const g = makeGame({
    slug: "pp",
    objects: ["clickPad", "grabClub"],
    behaviours: [{ id: "s", type: "Sheet", object: "clickPad" }],
    events: [{ object: "clickPad", kind: "click", behaviour: "s", method: "Wave" }],
  });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "pp");
  await room.run(500);
  const sheet = (viewer: typeof a, owner: typeof a) => inst(viewer, "pp").playerBehaviour<Sheet>(owner.sid, "s")!;
  a.click("pp", "0", "clickPad");
  assert.equal(sheet(a, a).pings.length, 1, "a's click reaches a's own copy");
  assert.equal(sheet(a, b).pings.length, 0, "not b's copy on a's page");
  b.click("pp", "0", "clickPad");
  assert.equal(sheet(b, b).pings.length, 1);

  const club = objectOf(a, "pp", "0", "grabClub");
  club.AttachToHand(1, new Vector3(0, 0, 0.1));
  await room.run(200);
  const attached = () => [...a.attached.entries()].filter(([path]) => path.endsWith("/Root/grabClub")).map(([, at]) => at);
  assert.deepEqual(attached(), [{ uid: a.uid, point: 2 }], "attached to a's right hand");
  club.Detach();
  await room.run(200);
  assert.deepEqual(attached(), []);
  // At the head, shown to the others (autoSync): the object takes its per-instance network id first.
  club.AttachToHead(new Vector3(0, 0.3, 0), undefined, true);
  await room.run(200);
  assert.deepEqual(attached(), [{ uid: a.uid, point: 0, autoSync: true, networkId: "pk1/pp/0/grabClub" }], "on a's head, synced");
  club.Detach();
  await room.run(200);
  assert.deepEqual(attached(), []);
});
