// Writes src/station-map.json, the port's logical map, from the upstream repository's runtime map file.
//
//   node tools/convert-map.ts <upstream runtime map .json> [out]
//
// Only geometry and counts are taken from the upstream file: rectangles, points, task kinds, panel order and hatch
// groups. Every id and display name in it is dropped, and the port's own names are given by array index from the
// tables below (the upstream map imitates a commercial game's room and task names, which must not reach the port).
// The script checks that the counts are the ones the tables were written for, so a changed upstream map fails loudly.

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

/** Rooms of the Hollow Reef habitat, in the order of the upstream room list. */
const ROOMS: Array<[string, string]> = [
  ["commons", "Commons"],
  ["moon-pool", "Moon Pool"],
  ["wet-lab", "Wet Lab"],
  ["lantern-dome", "Lantern Dome"],
  ["sonar", "Sonar Room"],
  ["tether-room", "Tether Room"],
  ["pump-hall", "Pump Hall"],
  ["ballast", "Ballast Control"],
  ["battery", "Battery Bay"],
  ["kelp-store", "Kelp Store"],
  ["scrubbers", "Scrubber Room"],
];

/** The 22 jobs, in the order of the upstream task points (a job's id is its index, as upstream). */
const JOBS: string[] = [
  "Sign the shift ledger",
  "Bleed the chamber gauge",
  "Set the recompression valve",
  "Trim tank pressure",
  "Log the specimen tray",
  "Focus the floodlights",
  "Spool the hydrophone tape",
  "Trim hydrophone gain",
  "Charge the dive lamps",
  "Tag the wetsuit racks",
  "Balance the main pump",
  "Prime the bilge line",
  "Check the impeller housing",
  "Level the trim tanks",
  "Seat the flood dampers",
  "Reseat the cell clamps",
  "Cycle the bus ties",
  "Ping the cable run",
  "Weigh the harvest bins",
  "Strap loose crates",
  "Shake out the lime trays",
  "Read the reserve bottles",
];

/** Upstream task kinds (its enum names, which are generic) to the port's job kinds. */
const KINDS: Record<string, string> = { DataTransfer: "hold", CircuitPulse: "tap", Calibration: "timing" };

/**
 * The four fault panels, in upstream order. `countdown` is the port's: the upstream gives one only to the first; the
 * fourth had no effect at all there and gets a countdown here (a deliberate difference, PORT.md D2).
 */
const PANELS: Array<{ fault: string; name: string; countdown: boolean }> = [
  { fault: "breach", name: "Ballast breach", countdown: true },
  { fault: "blackout", name: "Blackout", countdown: false },
  { fault: "jam", name: "Sonar jam", countdown: false },
  { fault: "scrubber", name: "Scrubber fault", countdown: true },
];

/** Names for the hatch groups, in the order the groups first appear. */
const HATCH_GROUPS = ["north", "east", "south"];

/** The furniture rectangles (obstacles that are not room-shape cut-outs), in upstream order. */
const PROPS: string[] = [
  "Pressure chamber",
  "Gauge cabinet",
  "Bunk pod",
  "Specimen tank",
  "Dissection bench",
  "Window console",
  "Sonar desk",
  "Server rack",
  "Locker wall",
  "Lamp bench",
  "Main pump",
  "Impeller casing",
  "Tool wall",
  "Ballast column",
  "Trim tanks",
  "Flood barrier",
  "West cell racks",
  "East cell racks",
  "Transformer",
  "Bin stack A",
  "Bin stack B",
  "Bin stack C",
  "Low shelf",
  "Scrubber canisters",
  "Filter bank",
  "Valve bank",
];

type Rect = [number, number, number, number];
type Point = [number, number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rect = (r: any): Rect => [r.x, r.y, r.width, r.height];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const point = (p: any): Point => [p.x, p.y];

function main(): void {
  const source = argv[2];
  const out = argv[3] ?? new URL("../src/station-map.json", import.meta.url);
  if (!source) {
    console.error("usage: node tools/convert-map.ts <upstream runtime map .json> [out]");
    exit(2);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = JSON.parse(readFileSync(source, "utf8"));
  const expect = (what: string, actual: number, wanted: number) => {
    if (actual !== wanted) throw new Error(`${what}: the upstream map has ${actual}, the name tables were written for ${wanted}`);
  };
  expect("rooms", m.rooms.length, ROOMS.length);
  expect("task points", m.taskPoints.length, JOBS.length);
  expect("sabotage points", m.sabotagePoints.length, PANELS.length);

  const roomIndex = new Map<string, number>();
  m.rooms.forEach((r: { id: string }, i: number) => roomIndex.set(r.id, i));
  const roomOf = (id: string): string => {
    const i = roomIndex.get(id);
    if (i === undefined) throw new Error(`a point names a room that is not in the room list`);
    return ROOMS[i]![0];
  };

  const props: Array<{ name: string; rect: Rect }> = [];
  const cuts: Rect[] = [];
  for (const o of m.obstacles) {
    if (String(o.id).startsWith("shape_wall_")) cuts.push(rect(o.bounds));
    else props.push({ name: PROPS[props.length] ?? `Prop ${props.length + 1}`, rect: rect(o.bounds) });
  }
  expect("props", props.length, PROPS.length);
  // Cut-outs come first upstream; keep that order so the obstacle list is the upstream list, renamed.
  const firstProp = m.obstacles.findIndex((o: { id: string }) => !String(o.id).startsWith("shape_wall_"));
  if (firstProp !== cuts.length) throw new Error("upstream obstacles are not cut-outs followed by props");

  const groups: string[] = [];
  const hatches = m.ventNodes.map((v: { groupId: string; roomId: string; position: unknown }) => {
    let g = groups.indexOf(v.groupId);
    if (g < 0) g = groups.push(v.groupId) - 1;
    return { group: HATCH_GROUPS[g] ?? `group-${g}`, room: roomOf(v.roomId), at: point(v.position) };
  });

  const map = {
    schema: 1,
    note: "Generated by tools/convert-map.ts from the upstream runtime map: geometry kept, every name replaced. Units: u, 1 u = 1 m.",
    name: "Hollow Reef",
    playBounds: rect(m.playBounds),
    rooms: m.rooms.map((r: { bounds: unknown; label: unknown }, i: number) => ({ id: ROOMS[i]![0], name: ROOMS[i]![1], rect: rect(r.bounds), label: point(r.label) })),
    corridors: m.corridors.map((c: { bounds: unknown }) => rect(c.bounds)),
    doorways: (m.doorways ?? []).map((d: { bounds: unknown }) => rect(d.bounds)),
    cuts,
    props,
    waypoints: m.navigationWaypoints.map((w: { position: unknown }) => point(w.position)),
    spawns: m.spawnPoints.map((s: { position: unknown }) => point(s.position)),
    jobs: m.taskPoints.map((t: { taskKind: string; roomId: string; position: unknown }, i: number) => ({
      id: i,
      name: JOBS[i],
      room: roomOf(t.roomId),
      kind: KINDS[t.taskKind] ?? ["hold", "tap", "timing"][i % 3],
      at: point(t.position),
    })),
    panels: m.sabotagePoints.map((s: { roomId: string; position: unknown }, i: number) => ({ ...PANELS[i]!, room: roomOf(s.roomId), at: point(s.position) })),
    hatches,
    muster: point(m.meetingPoint.position),
  };
  // One entry per line: readable in a diff, and small.
  const lines = Object.entries(map).map(([key, value]) => {
    const body =
      Array.isArray(value) && value.length && typeof value[0] === "object"
        ? "[\n" + value.map((v) => "    " + JSON.stringify(v)).join(",\n") + "\n  ]"
        : JSON.stringify(value);
    return `  ${JSON.stringify(key)}: ${body}`;
  });
  writeFileSync(out, "{\n" + lines.join(",\n") + "\n}\n");
  console.log(`wrote ${String(out)}: ${map.rooms.length} rooms, ${map.corridors.length} corridor rectangles, ${cuts.length} cut-outs, ${props.length} props, ${map.jobs.length} jobs, ${map.panels.length} panels, ${hatches.length} hatches`);
}

main();
