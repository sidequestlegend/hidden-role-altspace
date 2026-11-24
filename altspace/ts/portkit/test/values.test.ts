// The value types translated code uses in place of UnityEngine structs, and bindings.json validation.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Color, Curve, decodeValue, encodeValue, intDiv, leafBudget, Mathf, Quaternion, UnityRandom, validateBindings, Vector2, Vector3 } from "../src/index.ts";
import { fromBase64, jsonLeafBytes, toBase64, utf8Decode, utf8Encode, utf8Length } from "../src/util.ts";
import { sampleBindings } from "./helpers.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test("vectors, quaternions and Mathf behave as Unity's do", () => {
  assert.ok(new Vector3(1, 2, 3).add(new Vector3(1, 1, 1)).equals(new Vector3(2, 3, 4)));
  assert.ok(near(new Vector3(3, 4, 0).magnitude, 5));
  assert.ok(Vector3.Cross(Vector3.right, Vector3.up).equals(Vector3.forward));
  assert.ok(Vector3.MoveTowards(Vector3.zero, new Vector3(10, 0, 0), 3).equals(new Vector3(3, 0, 0)));
  assert.ok(Vector2.Lerp(Vector2.zero, new Vector2(2, 4), 0.5).equals(new Vector2(1, 2)));
  // C# `==` on vectors is approximate, and so is equals().
  assert.ok(new Vector2(1, 1).equals(new Vector2(1 + 1e-7, 1)));
  assert.ok(!new Vector2(1, 1).equals(new Vector2(1.01, 1)));
  // Structs copy on assignment; these are classes, so copies are explicit.
  const a = new Vector3(1, 1, 1);
  const b = a.clone();
  b.x = 5;
  assert.equal(a.x, 1);

  // Euler angles in Unity's order and handedness.
  const yaw = Quaternion.Euler(0, 90, 0);
  assert.ok(yaw.rotate(Vector3.forward).equals(Vector3.right));
  assert.ok(Quaternion.Euler(90, 0, 0).rotate(Vector3.forward).equals(Vector3.down));
  assert.ok(Quaternion.Euler(0, 0, 90).rotate(Vector3.right).equals(Vector3.up));
  for (const [x, y, z] of [[10, 20, 30], [0, 270, 0], [45, 0, 315], [80, 190, 5]] as Array<[number, number, number]>) {
    const e = Quaternion.Euler(x, y, z).eulerAngles;
    assert.ok(near(e.x, x, 1e-4) && near(e.y, y, 1e-4) && near(e.z, z, 1e-4), `${x},${y},${z} -> ${e}`);
  }
  assert.ok(yaw.mul(yaw.inverse).equals(Quaternion.identity));
  assert.ok(Quaternion.Slerp(Quaternion.identity, yaw, 0.5).equals(Quaternion.Euler(0, 45, 0)));
  assert.ok(Quaternion.AngleAxis(90, Vector3.up).equals(yaw));

  assert.equal(Mathf.RoundToInt(2.5), 2, "C# rounds halves to even");
  assert.equal(Mathf.RoundToInt(3.5), 4);
  assert.equal(Mathf.RoundToInt(-0.5), 0);
  assert.equal(Mathf.Clamp(5, 0, 3), 3);
  assert.equal(Mathf.Sign(0), 1);
  assert.equal(intDiv(-7, 2), -3, "C# integer division truncates toward zero");
  assert.equal(new Curve([[0, 0], [1, 10], [2, 0]]).Evaluate(1.5), 5);
  assert.equal(new Curve([[0, 2], [1, 4]]).Evaluate(9), 4);
});

test("values keep their type through bindings and synced fields", () => {
  const value = { at: new Vector3(1, 2, 3), facing: Quaternion.Euler(0, 90, 0), tint: new Color(1, 0, 0, 0.5), uv: new Vector2(0.5, 1), list: [new Vector3(), null, 3, "x"], nested: { deep: [new Vector2(1, 1)] } };
  const json = JSON.parse(JSON.stringify(encodeValue(value)));
  assert.deepEqual(json.at, { $v3: [1, 2, 3] });
  assert.deepEqual(json.tint, { $color: [1, 0, 0, 0.5] });
  const back = decodeValue(json) as typeof value;
  assert.ok(back.at instanceof Vector3 && back.at.equals(value.at));
  assert.ok(back.facing instanceof Quaternion && back.facing.equals(value.facing));
  assert.ok(back.tint instanceof Color && back.tint.equals(value.tint));
  assert.ok(back.uv instanceof Vector2);
  assert.ok(back.list[0] instanceof Vector3 && back.list[1] === null && back.list[2] === 3);
  assert.ok(back.nested.deep[0] instanceof Vector2);
  assert.equal(encodeValue(NaN), null);
  assert.equal(encodeValue(undefined), null);
});

test("text helpers: UTF-8, base64url, and the size the server will measure", () => {
  for (const text of ["", "abc", "é", "日本語", "🎲 dice", "mixed é🎲\n\"q\""]) {
    assert.equal(utf8Length(text), Buffer.byteLength(text, "utf8"), text);
    assert.deepEqual([...utf8Encode(text)], [...Buffer.from(text, "utf8")], text);
    assert.equal(utf8Decode(utf8Encode(text)), text);
    assert.equal(jsonLeafBytes(text), Buffer.byteLength(JSON.stringify(text), "utf8"), text);
  }
  for (const bytes of [[], [0], [255, 254], [1, 2, 3], [9, 8, 7, 6, 5]]) {
    const text = toBase64(new Uint8Array(bytes));
    assert.ok(/^[A-Za-z0-9_-]*$/.test(text));
    assert.deepEqual([...fromBase64(text)], bytes);
  }
  assert.equal(toBase64(new Uint8Array([251, 255, 190])), Buffer.from([251, 255, 190]).toString("base64url"));
});

test("bindings.json is checked as a whole, and every problem is named", () => {
  const good = sampleBindings();
  assert.equal(good.slug, "tic-tac-toe");
  assert.equal(good.behaviours.length, 13);
  assert.equal(good.objects.cell4!.click, true);

  const bad = {
    schema: 2,
    slug: "Not A Slug",
    bundles: {},
    objects: { "bad key": { path: "A" }, a: { path: "X/Y", sync: "physics" }, b: { path: "X/Y" } },
    refs: ["a", "ghost", "a"],
    behaviours: [
      { id: "b1", type: "T", object: "nowhere", fields: { other: { $beh: "b9" }, thing: [{ $obj: "gone" }], clip: { $clip: 1, on: "none" } } },
      { id: "b1", type: "T", group: "has space" },
      { type: "NoId" },
      { id: "pp", type: "T", perPlayer: true, group: "g" },
    ],
    events: [
      { object: "a", kind: "poke", behaviour: "b1", method: "M" },
      { kind: "graph", behaviour: "b1", method: "M" },
      { object: "a", kind: "click", behaviour: "zz", method: "" },
    ],
  };
  let message = "";
  try {
    validateBindings(bad);
  } catch (error) {
    message = (error as Error).message;
  }
  for (const expected of [
    "schema is 2",
    "slug \"Not A Slug\"",
    "object key 'bad key'",
    "sync must be",
    "have the same path 'X/Y'",
    "refs[1] 'ghost'",
    "refs lists an object twice",
    "object 'nowhere' is not an object key",
    "behaviour id 'b1' is used twice",
    "no id or type",
    "$beh 'b9' is not a behaviour id",
    "$obj 'gone' is not an object key",
    "$clip on 'none'",
    "group must be",
    "per-player behaviour cannot be in a sync group",
    "kind 'poke'",
    "a graph event needs a name",
    "behaviour 'zz' is not a behaviour id",
    "no method",
  ]) {
    assert.ok(message.includes(expected), `missing: ${expected}\n${message}`);
  }

  // The leaf budget counts slots: one for the sample's single synced behaviour, not thirteen.
  const budget = leafBudget(good, (type) => ({ synced: type === "TicTacToe" ? 5 : 0, perPlayer: false }));
  assert.deepEqual(budget, { slots: 1, spaceLeaves: 3, userLeavesPerPlayer: 2, instancesPerRoom: 682 });
  // Sixty-eight pieces in one sync group cost one slot.
  const pieces = Array.from({ length: 68 }, (_, i) => ({ id: `pc${i}`, type: "Piece", group: "pieces" }));
  const chess = validateBindings({ schema: 1, slug: "chess-table", bundles: {}, objects: {}, refs: [], behaviours: [{ id: "board", type: "Board" }, ...pieces], events: [] });
  assert.equal(leafBudget(chess, () => ({ synced: 2, perPlayer: false })).slots, 2);
});

test("Unity's own outputs (6000.3.21f1, read in the editor): Random, HSVToRGB, RGBToHSV, Angle, Reflect, LookRotation", () => {
  const unity: Array<[number, number[], number[], number[], number[]]> = [
    [0, [0.584139645, 0.5840824, 0.673606932, 0.766507], [6.18710136, 1.876542, 1.8429935], [46, 68, 39], [9, 8]],
    [1, [0.9996847, 0.7742628, 0.680983841, 0.4604562], [2.56965756, 0.1901319, -1.42979717], [90, 32, 65], [10, 9]],
    [42, [0.000857710955, 0.417754471, 0.6763434, 0.424701154], [6.34561253, 1.96912587, 3.14019728], [16, 74, 94], [7, 10]],
    [12345, [0.5868507, 0.8995606, 0.5325164, 0.91548574], [6.778326, 4.68669653, 4.36255455], [90, 90, 66], [4, 4]],
    [-7, [0.68112, 0.4983762, 0.359596044, 0.06801296], [7.72950268, 1.71817958, 6.371019], [34, 96, 57], [7, 9]],
  ];
  const near = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs Unity ${b}`);
  for (const [seed, values, floats, ints, reversed] of unity) {
    const r = new UnityRandom(seed);
    values.forEach((v, i) => near(r.value, v, 1e-7, `seed ${seed} value ${i}`));
    floats.forEach((v, i) => near(r.Range(-2.5, 10), v, 2e-6, `seed ${seed} Range(float) ${i}`));
    assert.deepEqual([r.RangeInt(0, 100), r.RangeInt(0, 100), r.RangeInt(0, 100)], ints, `seed ${seed} Range(int)`);
    assert.deepEqual([r.RangeInt(10, 3), r.RangeInt(10, 3)], reversed, `seed ${seed} Range(int) reversed`);
  }
  const hsv: Array<[number, number, number, number, number, number]> = [
    [0, 1, 1, 1, 0, 0], [0.25, 0.5, 0.8, 0.6, 0.8, 0.4], [0.5, 1, 0.5, 0, 0.5, 0.5], [0.9, 0.3, 1, 1, 0.7, 0.8800001],
    [1, 1, 1, 1, 0, 0], [1.2, 0.5, 0.5, 0, 0, 0], [-0.1, 0.5, 0.5, 0.5, 0.25, 0.4],
  ];
  for (const [h, s, v, r, g, b] of hsv) {
    const c = Color.HSVToRGB(h, s, v);
    [c.r, c.g, c.b].forEach((x, i) => near(x, [r, g, b][i]!, 1e-6, `HSVToRGB(${h}, ${s}, ${v})`));
    assert.equal(c.a, 1);
  }
  const back = Color.RGBToHSV(new Color(1, 0.5, 0.25));
  [0.055555556, 0.75, 1].forEach((x, i) => near(back[i]!, x, 1e-6, "RGBToHSV"));
  near(Vector3.Angle(new Vector3(1, 0, 0), new Vector3(1, 1, 0)), 45, 1e-5, "Angle");
  near(Vector3.Angle(new Vector3(0.3, -2, 1), new Vector3(-1, 0.5, 4)), 73.2531052, 1e-4, "Angle");
  assert.ok(Vector3.Reflect(new Vector3(1, -1, 0.5), new Vector3(0, 1, 0)).equals(new Vector3(1, 1, 0.5)));
  near(Quaternion.Angle(Quaternion.Euler(10, 20, 30), Quaternion.Euler(-40, 75, 5)), 71.66818, 1e-3, "Quaternion.Angle");
  const looks: Array<[Vector3, Vector3, number[]]> = [
    [new Vector3(0, 0, 1), Vector3.up, [0, 0, 0, 1]],
    [new Vector3(1, 0, 0), Vector3.up, [0, 0.7071068, 0, 0.7071068]],
    [new Vector3(0.3, -0.5, -1), Vector3.up, [0.0321598537, 0.9648316, -0.219119087, 0.1416072]],
    [new Vector3(0, 1, 0), Vector3.up, [-0.7071068, 0, 0, 0.7071068]],
    [new Vector3(1, 2, 3), new Vector3(0, 0, 1), [0.07232954, 0.306392878, 0.923762441, 0.218070731]],
  ];
  for (const [f, u, q] of looks) {
    const got = Quaternion.LookRotation(f, u);
    [got.x, got.y, got.z, got.w].forEach((x, i) => near(x, q[i]!, 1e-5, `LookRotation(${f}, ${u})`));
  }
  assert.ok(Color.cyan.equals(new Color(0, 1, 1, 1)) && Color.gray.equals(Color.grey) && Color.gray.r === 0.5);
});
