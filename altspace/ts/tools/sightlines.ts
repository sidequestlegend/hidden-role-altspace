// What a player can see inside the station, for drawing only the regions that can be seen (a kit carries no baked
// occlusion data). Rays over the open floor: rooms and corridors less the cut-outs; props are lower than the eyes,
// so they do not stop a sight line.
//
//   node tools/sightlines.ts [columns, default 6] [rows, default 5]
//
// Writes src/region-pvs.json: for each region of a columns x rows grid over the play bounds (row by row from the
// south-west), the regions visible from anywhere in it, sampled every 0.5 m with 360 rays, plus its eight neighbours
// (a margin for what the sampling misses). The kit builder draws the station a region at a time on the same grid and
// checks the file's grid is its own; RuntimeHud switches regions with it.
import { writeFileSync } from "node:fs";
import map from "../src/station-map.json" with { type: "json" };

const walk = [...map.rooms.map((r) => r.rect), ...map.corridors];
const cuts = map.cuts;
const inside = (x: number, y: number) => walk.some((r) => x >= r[0]! && x < r[0]! + r[2]! && y >= r[1]! && y < r[1]! + r[3]!) && !cuts.some((r) => x >= r[0]! && x < r[0]! + r[2]! && y >= r[1]! && y < r[1]! + r[3]!);
const [bx, by, bw, bh] = map.playBounds as number[];
const cols = Number(process.argv[2] ?? 6), rows = Number(process.argv[3] ?? 5);
const regionOf = (x: number, y: number) => [Math.min(cols - 1, Math.max(0, Math.floor(((x - bx!) / bw!) * cols))), Math.min(rows - 1, Math.max(0, Math.floor(((y - by!) / bh!) * rows)))];
const rectDist = (x: number, y: number, cx: number, cy: number) => {
  const x0 = bx! + (bw! * cx) / cols, x1 = bx! + (bw! * (cx + 1)) / cols, y0 = by! + (bh! * cy) / rows, y1 = by! + (bh! * (cy + 1)) / rows;
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
};
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let longest = 0, need = 0, samples = 0;
for (let n = 0; n < 4000; n++) {
  const x = bx! + rnd() * bw!, y = by! + rnd() * bh!;
  if (!inside(x, y)) continue;
  samples++;
  for (let k = 0; k < 180; k++) {
    const a = (2 * Math.PI * k) / 180;
    let d = 0;
    while (inside(x + Math.cos(a) * (d + 0.1), y + Math.sin(a) * (d + 0.1))) d += 0.1;
    longest = Math.max(longest, d);
    // every region the ray passes through must be drawn
    for (let s = 0; s <= d; s += 0.5) {
      const [cx, cy] = regionOf(x + Math.cos(a) * s, y + Math.sin(a) * s);
      need = Math.max(need, rectDist(x, y, cx!, cy!));
    }
  }
}
console.log(`${samples} points, 180 rays each: longest sight line ${longest.toFixed(1)} m; a region must be drawn within ${need.toFixed(1)} m to show everything visible`);

// Potentially visible sets: from anywhere in region i (dense samples, 360 rays), which regions can be seen.
const pvs: boolean[][] = Array.from({ length: cols * rows }, () => Array(cols * rows).fill(false));
for (let y = by! + 0.25; y < by! + bh!; y += 0.5) {
  for (let x = bx! + 0.25; x < bx! + bw!; x += 0.5) {
    if (!inside(x, y)) continue;
    const [sx, sy] = regionOf(x, y);
    const from = sy! * cols + sx!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (sx! + dx >= 0 && sx! + dx < cols && sy! + dy >= 0 && sy! + dy < rows) pvs[from]![(sy! + dy) * cols + sx! + dx] = true;
    for (let k = 0; k < 360; k++) {
      const a = (2 * Math.PI * k) / 360;
      for (let d = 0.1; inside(x + Math.cos(a) * d, y + Math.sin(a) * d); d += 0.2) {
        const [cx, cy] = regionOf(x + Math.cos(a) * d, y + Math.sin(a) * d);
        pvs[from]![cy! * cols + cx!] = true;
      }
    }
  }
}
const rowsOut = pvs.map((r) => r.map((v) => (v ? "1" : "0")).join(""));
console.log("visible sets (region i: which regions):\n" + rowsOut.map((r, i) => `${i}: ${r} (${r.split("1").length - 1})`).join("\n"));
writeFileSync(new URL("../src/region-pvs.json", import.meta.url), JSON.stringify({ note: "tools/sightlines.ts: per region, the regions visible from it (1), row by row from the south-west of the play bounds", cols, rows, visible: rowsOut }, null, 1) + String.fromCharCode(10));
const average = rowsOut.reduce((n, r) => n + r.split("1").length - 1, 0) / rowsOut.length;
console.log(`wrote src/region-pvs.json: ${cols} x ${rows} regions, ${average.toFixed(1)} visible on average`);
