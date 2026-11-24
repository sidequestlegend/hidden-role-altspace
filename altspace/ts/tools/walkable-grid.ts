// The rules' walkable test over the whole station, written for the kit's collider check (PORT.md "Station
// geometry"): the Unity side builds the station's colliders from station-map.json and compares what a body can
// physically reach with what this file says the rules allow. The test is ShipMap.IsBlocked, the one the golden
// vectors prove equal to the upstream C# (G1).
//
//   node tools/walkable-grid.ts [step metres, default 0.25] [body radius, default 0.25]
//
// Writes vectors/walkable-grid.json: one character per sample point, row by row from the south-west corner,
//   '0' the rules say blocked (outside every room and corridor, or inside a cut-out or a prop),
//   '1' open at radius 0, but a body of the given radius standing there would overlap something blocked,
//   '2' open, with the whole disc of (radius + 0.05) around it open: a body standing there must touch nothing.
// Samples sit half a step in from the grid lines, so none falls exactly on a rectangle's edge.

import { writeFileSync } from "node:fs";
import { Vector2 } from "../portkit/src/index.ts";
import { STATION } from "../src/ShipMap.ts";

const step = Number(process.argv[2] ?? 0.25);
const body = Number(process.argv[3] ?? 0.25);
const margin = 0.05;
const b = STATION.PlayBounds;
const nx = Math.round(b.width / step);
const ny = Math.round(b.height / step);
const ring: Array<[number, number]> = [];
for (const [r, n] of [[body + margin, 24], [(body + margin) * 0.5, 12]] as const) {
  for (let i = 0; i < n; i++) ring.push([r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
}
const open = (x: number, y: number) => !STATION.IsBlocked(new Vector2(x, y), 0);
const rows: string[] = [];
const counts = { "0": 0, "1": 0, "2": 0 };
for (let j = 0; j < ny; j++) {
  let row = "";
  const y = b.yMin + (j + 0.5) * step;
  for (let i = 0; i < nx; i++) {
    const x = b.xMin + (i + 0.5) * step;
    let c: "0" | "1" | "2" = "0";
    if (open(x, y)) c = ring.every(([dx, dy]) => open(x + dx, y + dy)) ? "2" : "1";
    counts[c]++;
    row += c;
  }
  rows.push(row);
}
const out = {
  note: "ShipMap.IsBlocked over the play bounds (tools/walkable-grid.ts): 0 blocked, 1 open, 2 open with a clear disc of radius + margin. Rows from yMin, columns from xMin, samples at cell centres.",
  step,
  radius: body,
  margin,
  x0: b.xMin + step / 2,
  y0: b.yMin + step / 2,
  nx,
  ny,
  counts,
  rows,
};
writeFileSync(new URL("../vectors/walkable-grid.json", import.meta.url), JSON.stringify(out));
console.log(`walkable grid ${nx} x ${ny} at ${step} m, body ${body} m: ${JSON.stringify(counts)}`);
