// The relay to the kit's graph: framing, batching, the change cache, targets, and what graphs send back.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AudioSourceRef, Color, decodeRelayArg, encodeRelayArg, parseRelayPayload, relayNumber, type AnimatorRef, type RendererRef, type TextRef } from "../src/index.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { seededRandom } from "../src/util.ts";
import { enter, inst, makeGame, probe, untilStarted } from "./games.ts";

test("relay arguments survive the trip, and the JSON literal the graph gets has no escapes in it", () => {
  const samples = ["plain", "", "a|b^c%d", 'say "hi"', "back\\slash", "line\nbreak\ttab\r", "50% off | now ^ never", "%7C is not a bar", "naïve ✓ 日本語 🎲", "\u0000\u001f", "trailing%"];
  const rng = seededRandom(5);
  const alphabet = ['"', "\\", "|", "^", "%", "\n", "a", "Z", "7", " ", "é", "🎲", "\t", "5", "C", "E"];
  for (let i = 0; i < 300; i++) {
    let text = "";
    for (let n = Math.floor(rng() * 12); n > 0; n--) text += alphabet[Math.floor(rng() * alphabet.length)];
    samples.push(text);
  }
  for (const text of samples) {
    const encoded = encodeRelayArg(text);
    assert.equal(decodeRelayArg(encoded), text, JSON.stringify(text));
    assert.ok(!/[|^"\\\u0000-\u001f]/.test(encoded), `${JSON.stringify(text)} encodes to ${JSON.stringify(encoded)}`);
    // What SendToVisualScripting does to the payload: the graph only has to drop the two quotes.
    const literal = JSON.stringify(`tic:0|text|3|${encoded}`);
    assert.equal(literal.slice(1, -1), `tic:0|text|3|${encoded}`);
  }
  // Half a surrogate pair cannot travel; it becomes the replacement character rather than an escape.
  assert.equal(encodeRelayArg("x\ud83cy"), "x�y");
  assert.deepEqual(parseRelayPayload("chess:north|text|2|a%7Cb^color|@Board/Cup 3|#2:_Color|1|0.5|0|1"), {
    key: "chess:north",
    records: [
      { op: "text", target: "2", args: ["a|b"] },
      { op: "color", target: "@Board/Cup 3", args: ["#2:_Color", "1", "0.5", "0", "1"] },
    ],
  });
  assert.deepEqual([relayNumber(1), relayNumber(-2.5), relayNumber(1 / 3), relayNumber(1e-9), relayNumber(NaN), relayNumber(1234567.125)], ["1", "-2.5", "0.333333", "0", "0", "1234567.125"]);
});

function tableGame() {
  // A table with 130 things on it that game code redraws from scratch whenever anything changes.
  const objects: string[] = [];
  const fields: Record<string, unknown> = { labels: [], lamps: [] };
  for (let i = 0; i < 100; i++) {
    objects.push(`label${i}`);
    (fields.labels as unknown[]).push({ $comp: `label${i}`, kind: "TMP" });
  }
  for (let i = 0; i < 30; i++) {
    objects.push(`lamp${i}`);
    (fields.lamps as unknown[]).push({ $obj: `lamp${i}` });
  }
  objects.push("speaker", "clips", "dial", "hand");
  fields.dial = { $comp: "dial", kind: "Renderer" };
  fields.hand = { $comp: "hand", kind: "Animator" };
  fields.speaker = { $comp: "speaker", kind: "AudioSource" };
  fields.ding = { $clip: 2, on: "clips" };
  fields.own = { $clip: 1 };
  return makeGame({ slug: "table", objects, behaviours: [{ id: "p", type: "Probe", fields }] });
}

test("a 130-item redraw with 3 changes makes one payload with 3 records", async () => {
  const room = new FakeRoom({ seed: 91 });
  const g = tableGame();
  const a = enter(room, [g]);
  await untilStarted(room, [a], "table");
  const p = probe(a, "table") as unknown as { labels: TextRef[]; lamps: Array<{ SetActive(on: boolean): void }> };
  const host = inst(a, "table").host;
  const values = Array.from({ length: 100 }, (_, i) => `row ${i}`);
  const lit = Array.from({ length: 30 }, (_, i) => i % 2 === 0);
  const redraw = () => {
    for (let i = 0; i < 100; i++) p.labels[i]!.text = values[i]!;
    for (let i = 0; i < 30; i++) p.lamps[i]!.SetActive(lit[i]!);
  };

  // The first draw sends everything, once, in one payload.
  redraw();
  await room.run(200);
  const graph = a.graph("table");
  assert.equal(graph.payloads.length, 1);
  assert.equal(graph.records.length, 130);
  assert.equal(graph.text.get("label42"), "row 42");
  assert.equal(graph.active.get("lamp3"), false);

  // Three things change; the game redraws all 130 again, twice in the same tick for good measure.
  values[7] = "changed";
  values[8] = 'with "quotes" | and ^ bars';
  lit[3] = true;
  const calls = a.app.stats.relayCalls;
  redraw();
  redraw();
  await room.run(200);
  assert.equal(a.app.stats.relayCalls - calls, 1, "one bridge call");
  assert.equal(graph.payloads.length, 2);
  assert.deepEqual(parseRelayPayload(graph.payloads[1]!)!.records.map((r) => r.op), ["text", "text", "active"]);
  assert.equal(graph.text.get("label8"), 'with "quotes" | and ^ bars');
  assert.equal(graph.active.get("lamp3"), true);
  assert.deepEqual(a.notes, [], "the graph could read every payload");

  // Nothing changed: nothing is sent.
  redraw();
  await room.run(200);
  assert.equal(graph.payloads.length, 2);
  assert.equal(host.payloadsSent, 2);
  assert.equal(host.recordsSent, 133);
});

test("targets by path, material slots, animator values, triggers and clips kept on another object", async () => {
  const room = new FakeRoom({ seed: 92 });
  const g = tableGame();
  const a = enter(room, [g]);
  await untilStarted(room, [a], "table");
  const p = probe(a, "table") as unknown as { dial: RendererRef; hand: AnimatorRef; speaker: AudioSourceRef; ding: never; own: never };
  const host = probe(a, "table").Host;
  const graph = a.graph("table");

  p.dial.SetColor(new Color(1, 0.5, 0, 1), "_Color", 2);
  p.dial.SetFloat("_Frame", 3);
  p.dial.SetFloat("_Frame", 3);
  p.hand.SetBool("open", true);
  p.hand.SetFloat("speed", 0.25);
  p.hand.SetTrigger("wave");
  p.hand.SetTrigger("wave");
  // An object made at run time has no index: it is addressed by its path under the kit root.
  host.setText("@Root/Cups/Cup 7", "7");
  host.setActive("@Root/Cups/Cup 7", false);
  host.setActive("@Root/Cups/Cup 7", false);
  host.uiColor("label0", new Color(0, 1, 0, 0.5));
  p.speaker.PlayOneShot(p.ding);
  p.speaker.PlayOneShot(p.own);
  await room.run(200);

  assert.deepEqual(graph.color.get("dial/#2:_Color"), ["1", "0.5", "0", "1"]);
  assert.equal(graph.floats.get("dial/_Frame"), "3");
  assert.deepEqual(graph.anim.get("hand"), { open: "1", speed: "0.25" });
  assert.equal(graph.text.get("@Root/Cups/Cup 7"), "7");
  assert.equal(graph.active.get("@Root/Cups/Cup 7"), false);
  assert.deepEqual(graph.uiColor.get("label0"), ["0", "1", "0", "0.5"]);
  // Values are sent once; events (a trigger, a clip) every time they are asked for.
  const ops = graph.records.map((r) => r.op);
  assert.equal(ops.filter((op) => op === "matFloat").length, 1);
  assert.equal(ops.filter((op) => op === "active").length, 1);
  assert.equal(ops.filter((op) => op === "animTrigger").length, 2);
  // The clip list is on "clips" (its Refs index travels; the fake graph reports it by key), the sound comes out of
  // "speaker". A clip of the speaker's own list names the speaker as the holder: the graph always gets one.
  assert.ok(g.bindings.refs.indexOf("clips") >= 0 && g.bindings.refs.indexOf("speaker") >= 0);
  assert.deepEqual(graph.events.filter((e) => e.op === "audio"), [
    { op: "audio", target: "speaker", args: ["2", "clips"] },
    { op: "audio", target: "speaker", args: ["1", "speaker"] },
  ]);
  assert.ok(!a.notes.some((n) => n.startsWith("graph")), a.notes.join("; "));
  assert.equal(graph.payloads.length, 1);
});

test("graphs report to the page: named events, UI values, and the synced clock", async () => {
  const room = new FakeRoom({ seed: 93, clockSeconds: 5_000_000 });
  const g = makeGame({
    slug: "golf",
    objects: ["cup", "slider", "toggle", "clickButton"],
    behaviours: [{ id: "p", type: "Probe", object: "cup" }],
    events: [
      { kind: "graph", name: "ballInCup", behaviour: "p", method: "OnGraph" },
      { object: "slider", kind: "uiSlider", behaviour: "p", method: "OnSlider" },
      { object: "toggle", kind: "uiToggle", behaviour: "p", method: "OnToggle" },
      { object: "clickButton", kind: "uiButton", behaviour: "p", method: "Later" },
      // Listed only so that the relay graph reports it: code listens for it with gameObject.On.
      { object: "cup", kind: "heldTrigger", behaviour: "", method: "" },
    ],
  });
  const [a, b] = [enter(room, [g]), enter(room, [g])];
  await untilStarted(room, [a, b], "golf");
  const p = probe(a, "golf");

  // A game's own fixed-step graph: window.__pk1.event("golf:0", "ballInCup", "3|1.25|a%7Cb").
  a.graphEvent("golf", "0", "ballInCup", "3|1.25|a%7Cb");
  assert.deepEqual(p.graph, [["3", "1.25", "a|b"]]);
  // A name registered in code works the same way.
  p.RegisterGraphEvent("clubSwing", "OnGraph");
  a.graphEvent("golf", "0", "clubSwing", "");
  assert.deepEqual(p.graph[1], []);
  // The trigger of the hand holding an object: only a graph hears BS.HeldEvents, and it says which object.
  const held: Array<number | undefined> = [];
  p.gameObject.On("heldTrigger", (detail) => held.push(detail.side));
  a.graphEvent("golf", "0", "heldTrigger", `${g.bindings.refs.indexOf("cup")}|right`);
  a.graphEvent("golf", "0", "heldTrigger", `${g.bindings.refs.indexOf("slider")}|left`);
  assert.deepEqual(held, [1], "the right hand, and only for the object that was listened to");
  // Events for another instance, or with no handler, go nowhere.
  a.graphEvent("golf", "9", "ballInCup", "1");
  a.graphEvent("golf", "0", "unknown", "1");
  assert.equal(p.graph.length, 2);
  assert.equal(probe(b, "golf").graph.length, 0, "a graph event is local to the page it was raised on");

  // UI controls only graphs can hear: the new value is handed to the bound method. Targets are a Refs index or a path.
  a.graphEvent("golf", "0", "uiSlider", `${g.bindings.refs.indexOf("slider")}|0.75`);
  a.graphEvent("golf", "0", "uiToggle", "@Root/toggle|1");
  a.graphEvent("golf", "0", "uiButton", "clickButton");
  assert.equal(p.slider, 0.75);
  assert.equal(p.toggle, true);
  assert.equal(p.delayed.length, 1);
  a.graphEvent("golf", "0", "uiToggle", "@Root/toggle|0");
  assert.equal(p.toggle, false);

  // The clock is the built-in case of the same channel, and every client ends up with the room's time.
  for (const client of [a, b]) {
    const seen = inst(client, "golf").networking.GetServerTimeInSeconds();
    assert.ok(Math.abs(seen - room.clockSeconds()) < 0.05, `${client.name} is ${seen - room.clockSeconds()} s off`);
    assert.equal(inst(client, "golf").clockSync.synced, true);
    assert.equal(inst(client, "golf").networking.GetServerTimeInMilliseconds(), Math.floor(inst(client, "golf").networking.GetServerTimeInSeconds() * 1000));
  }
  assert.ok(a.graph("golf").clockRequests >= 1);

  // A graph's Start runs as soon as the kit exists, before the instance has started: its events are kept.
  const c = enter(room, [g]);
  assert.ok(await room.runUntil(() => c.hasHolder("golf") && c.graph("golf").clockRequests > 0, 20000, 5));
  assert.equal(c.instance("golf").started, false);
  c.graphEvent("golf", "0", "ballInCup", "early");
  await untilStarted(room, [a, b, c], "golf");
  assert.deepEqual(probe(c, "golf").graph, [["early"]]);
});

test("bundle addresses: the element's own, else what the page was given at release, else the bindings'", async () => {
  const room = new FakeRoom({ seed: 95 });
  const g = makeGame({ slug: "where", behaviours: [{ id: "p", type: "Probe" }] });
  room.defineKit("https://cdn.test/where-windows.bin", g.bindings);
  room.defineKit("https://local.test/where.bundle", g.bindings);

  // Released: the hub's tool put one line in front of the script.
  const released = room.join();
  (released.env.win as { __pk1_bundles?: unknown }).__pk1_bundles = { where: { windows: "https://cdn.test/where-windows.bin", android: "https://cdn.test/where-quest.bin" } };
  released.load(g.game, g.bindings);
  released.addSnippet("where");
  // A test page: the element says where the bundles are, and that wins.
  const local = room.join();
  (local.env.win as { __pk1_bundles?: unknown }).__pk1_bundles = { where: { windows: "https://cdn.test/nowhere.bin" } };
  local.load(g.game, g.bindings);
  local.addSnippet("where", { windows: "https://local.test/where.bundle" });
  await untilStarted(room, [released, local], "where");
  assert.deepEqual([released.logged("error"), local.logged("error")], [[], []]);
  assert.ok(inst(released, "where").objects.get("root")!.transform.known, "the kit's objects were found");

  // Nothing anywhere: the game says so and runs without its objects rather than not at all.
  const bare = room.join();
  bare.load(g.game, g.bindings);
  bare.addSnippet("where");
  assert.ok(await room.runUntil(() => bare.hasInstance("where") && bare.instance("where").started, 20000));
  assert.ok(bare.logged("warn").some((line) => line.includes("no bundle address")));
});

test("an object the relay graph cannot reach is reported once, and switching it falls back to the page", async () => {
  const room = new FakeRoom({ seed: 94 });
  const g = makeGame({ slug: "refs", objects: ["inRefs", "notInRefs"], refs: ["inRefs"], behaviours: [{ id: "p", type: "Probe", fields: { hidden: { $obj: "notInRefs" }, label: { $comp: "notInRefs", kind: "TMP" } } }] });
  const a = enter(room, [g]);
  await untilStarted(room, [a], "refs");
  const p = probe(a, "refs") as unknown as { hidden: { SetActive(on: boolean): void; activeSelf: boolean }; label: TextRef };
  p.hidden.SetActive(false);
  p.label.text = "one";
  p.label.text = "two";
  await room.run(200);
  assert.equal(a.object("refs", "0", "notInRefs").active, false, "the page switched it off itself");
  assert.equal(p.hidden.activeSelf, false);
  assert.equal(a.graph("refs").records.length, 0);
  assert.equal(a.logged("warn").filter((line) => line.includes("not in bindings.refs")).length, 1);
  assert.ok(new AudioSourceRef("AudioSource", inst(a, "refs").objects.get("inRefs")!, inst(a, "refs").host) instanceof AudioSourceRef);
});
