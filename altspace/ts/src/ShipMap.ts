// Translated from the upstream Assets/Scripts/ShipMap.cs: the rules half (walkable test, movement, line of reach,
// random points, steering, room names). Map loading reads src/station-map.json instead of a Unity resource; the
// camera, sprite and blockout code is not ported (the kit builder makes the 3D station from the same data).
//
// One addition for speed: a broad-phase grid over the rectangles. IsBlocked asks only the rectangles near the point,
// with the same tests in the same order, so its answer is unchanged (golden vectors G1, G2).

import { Vector2 } from "../portkit/src/index.ts";
import { FAULT_IDS, JOB_KIND_IDS } from "./GameTypes.ts";
import { f, type FaultPanel, type Hatch, type JobStation, Rect, type RoomArea, ShipMapGeometry, type StationMapFile, v2 } from "./ShipMapData.ts";
import mapFile from "./station-map.json" with { type: "json" };

/** What the map needs of a random source: UnityEngine.Random's shape (portkit's RandomView). */
export interface Rng {
  readonly value: number;
  Range(min: number, max: number): number;
  RangeInt(min: number, max: number): number;
}

/** Vector2.Distance in float. */
export function Dist(a: Vector2, b: Vector2): number {
  const dx = f(a.x - b.x);
  const dy = f(a.y - b.y);
  return f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
}

/** Vector2.Lerp in float. */
export function LerpF(a: Vector2, b: Vector2, t: number): Vector2 {
  const k = t < 0 ? 0 : t > 1 ? 1 : f(t);
  return new Vector2(f(a.x + f(f(b.x - a.x) * k)), f(a.y + f(f(b.y - a.y) * k)));
}

const CELL = 4;
/** Larger than any radius the rules use (0.5), so a grown obstacle is always in the cells it can reach. */
const MARGIN = 0.75;

interface Indexed {
  rect: Rect;
  order: number;
}

export class ShipMap {
  readonly MapName: string;
  readonly PlayBounds: Rect;
  readonly Rooms: RoomArea[];
  readonly RoomBounds: Rect[];
  readonly Corridors: Rect[];
  readonly Doorways: Rect[];
  readonly Obstacles: Rect[];
  readonly ObstacleNames: string[];
  readonly NavigationWaypoints: Vector2[];
  readonly SpawnPoints: Vector2[];
  readonly JobStations: JobStation[];
  readonly FaultPanels: FaultPanel[];
  readonly Hatches: Hatch[];
  readonly MeetingPoint: Vector2;
  private readonly walkGrid = new Map<number, Indexed[]>();
  private readonly obstacleGrid = new Map<number, Indexed[]>();

  constructor(file: StationMapFile) {
    this.MapName = file.name;
    this.PlayBounds = Rect.fromArray(file.playBounds);
    if (this.PlayBounds.width <= 0 || this.PlayBounds.height <= 0) this.PlayBounds = new Rect(-8, -5, 16, 10);
    this.Rooms = file.rooms.map((r) => ({ Id: r.id, Name: r.name, Bounds: Rect.fromArray(r.rect), LabelPosition: v2(r.label) }));
    this.RoomBounds = this.Rooms.map((r) => r.Bounds);
    this.Corridors = file.corridors.map((c) => Rect.fromArray(c));
    this.Doorways = file.doorways.map((d) => Rect.fromArray(d));
    this.Obstacles = [...file.cuts.map((c) => Rect.fromArray(c)), ...file.props.map((p) => Rect.fromArray(p.rect))];
    this.ObstacleNames = [...file.cuts.map(() => ""), ...file.props.map((p) => p.name)];
    this.NavigationWaypoints = file.waypoints.map(v2);
    this.SpawnPoints = file.spawns.map(v2);
    this.JobStations = file.jobs.map((j, i) => ({ Id: i, Name: j.name, Room: j.room, Kind: JOB_KIND_IDS[j.kind] ?? i % 3, Position: v2(j.at) }));
    this.FaultPanels = file.panels.map((p) => ({ Type: FAULT_IDS[p.fault] ?? 1, Name: p.name, Room: p.room, Position: v2(p.at), HasCountdown: p.countdown }));
    this.Hatches = file.hatches.map((h, i) => ({ Index: i, Name: `${this.roomName(h.room)} hatch`, GroupId: h.group, Position: v2(h.at) }));
    this.MeetingPoint = v2(file.muster);
    // Walkable rectangles keep their upstream order: rooms, then corridors, then doorways.
    const walk = [...this.RoomBounds, ...this.Corridors, ...this.Doorways];
    walk.forEach((rect, order) => this.index(this.walkGrid, rect, order));
    this.Obstacles.forEach((rect, order) => this.index(this.obstacleGrid, rect, order));
  }

  private roomName(id: string): string {
    return this.Rooms.find((r) => r.Id === id)?.Name ?? id;
  }

  private static key(cx: number, cy: number): number {
    return (cx + 1000) * 4096 + (cy + 1000);
  }

  private index(grid: Map<number, Indexed[]>, rect: Rect, order: number): void {
    const x0 = Math.floor((rect.xMin - MARGIN) / CELL);
    const x1 = Math.floor((rect.xMax + MARGIN) / CELL);
    const y0 = Math.floor((rect.yMin - MARGIN) / CELL);
    const y1 = Math.floor((rect.yMax + MARGIN) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = ShipMap.key(cx, cy);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push({ rect, order });
      }
    }
  }

  private near(grid: Map<number, Indexed[]>, p: Vector2): Indexed[] {
    return grid.get(ShipMap.key(Math.floor(p.x / CELL), Math.floor(p.y / CELL))) ?? [];
  }

  /** ShipMapGeometry.IsBlocked over this map's rectangles. */
  IsBlocked(position: Vector2, radius: number): boolean {
    const inset = ShipMapGeometry.InsetFor(radius);
    let inside = false;
    for (const w of this.near(this.walkGrid, position)) {
      if (ShipMapGeometry.Inset(w.rect, inset).Contains(position)) {
        inside = true;
        break;
      }
    }
    if (!inside) return true;
    for (const o of this.near(this.obstacleGrid, position)) {
      if (ShipMapGeometry.Inflate(o.rect, radius).Contains(position)) return true;
    }
    return false;
  }

  /** The same test without the grid, exactly as upstream loops (for the tests that prove the grid changes nothing). */
  IsBlockedSlow(position: Vector2, radius: number): boolean {
    const inset = ShipMapGeometry.InsetFor(radius);
    const any = (rects: Rect[]) => rects.some((r) => ShipMapGeometry.Inset(r, inset).Contains(position));
    if (!any(this.RoomBounds) && !any(this.Corridors) && !any(this.Doorways)) return true;
    return this.Obstacles.some((o) => ShipMapGeometry.Inflate(o, radius).Contains(position));
  }

  ResolveMove(current: Vector2, delta: Vector2, radius: number): Vector2 {
    const currentOpen = this.ClampToWalkable(current, radius);
    let afterX = this.ClampToBounds(new Vector2(f(currentOpen.x + f(delta.x)), currentOpen.y), radius);
    if (this.IsBlocked(afterX, radius)) afterX = currentOpen;
    let afterY = this.ClampToBounds(new Vector2(afterX.x, f(afterX.y + f(delta.y))), radius);
    if (this.IsBlocked(afterY, radius)) afterY = afterX;
    return afterY;
  }

  /**
   * A move as the bots and test walkers make it: straight along `delta` when that line is clear, else ResolveMove's
   * one axis at a time. Not upstream: axis-separated moves alone stick in some corridor mouths (PORT.md D15).
   */
  MoveToward(current: Vector2, delta: Vector2, radius: number): Vector2 {
    const target = new Vector2(f(current.x + f(delta.x)), f(current.y + f(delta.y)));
    if (!this.IsBlocked(current, radius) && this.ClearFine(current, target, radius)) return this.ClampToBounds(target, radius);
    return this.ResolveMove(current, delta, radius);
  }

  ClampToWalkable(position: Vector2, radius: number): Vector2 {
    const clamped = this.ClampToBounds(position, radius);
    return this.IsBlocked(clamped, radius) ? this.FindNearestOpenPosition(clamped, radius) : clamped;
  }

  GetRandomWalkablePosition(random: Rng): Vector2 {
    const rooms = this.Rooms;
    for (let attempts = 0; attempts < 32 && rooms.length > 0; attempts++) {
      const area = rooms[random.RangeInt(0, rooms.length)]!.Bounds;
      const candidate = new Vector2(
        f(random.Range(f(area.xMin + f(0.4)), f(area.xMax - f(0.4)))),
        f(random.Range(f(area.yMin + f(0.4)), f(area.yMax - f(0.4)))),
      );
      if (!this.IsBlocked(candidate, 0.28)) return candidate;
    }
    return this.MeetingPoint.clone();
  }

  GetSpawnPoint(playerIndex: number, fallback: Vector2): Vector2 {
    const spawnPoints = this.SpawnPoints;
    if (spawnPoints.length === 0) return this.ClampToWalkable(fallback, 0.32);
    return this.ClampToWalkable(spawnPoints[Math.abs(playerIndex) % spawnPoints.length]!, 0.32);
  }

  GetNavigationTarget(current: Vector2, destination: Vector2): Vector2 {
    const currentOpen = this.ClampToWalkable(current, 0.22);
    const destinationOpen = this.ClampToWalkable(destination, 0.22);
    if (this.HasClearWalkableSegment(currentOpen, destinationOpen, 0.22)) return destinationOpen;
    let bestWaypoint = destinationOpen;
    let bestScore = Number.MAX_VALUE;
    let found = false;
    for (const waypoint of this.NavigationWaypoints) {
      if (this.IsBlocked(waypoint, 0.22) || !this.HasClearWalkableSegment(currentOpen, waypoint, 0.22)) continue;
      const canSeeDestination = this.HasClearWalkableSegment(waypoint, destinationOpen, 0.22);
      const score = f(f(Dist(currentOpen, waypoint) + Dist(waypoint, destinationOpen)) + (canSeeDestination ? 0 : f(2.5)));
      if (score < bestScore) {
        bestWaypoint = waypoint;
        bestScore = score;
        found = true;
      }
    }
    return found ? bestWaypoint : destinationOpen;
  }

  private readonly grids = new Map<number, { nodes: Vector2[]; index: Map<number, number>; links: number[][]; x0: number; y0: number }>();

  /**
   * The next point to steer for on the way to `destination`: the destination itself when the line is clear, else the
   * farthest visible point of a shortest route over a 1 u grid of open floor. Not upstream: the map's own waypoints
   * do not form a connected graph (props cut four rooms off), and GetNavigationTarget's greedy pick strands a bot on a
   * waypoint for good (seen in the tests). The bots and the test walkers use this instead (PORT.md D15). Every test
   * is made at the walker's own `radius`, so a route it is given is one it can walk.
   */
  NextStep(current: Vector2, destination: Vector2, radius = 0.5): Vector2 {
    const from = this.ClampToWalkable(current, radius);
    const to = this.ClampToWalkable(destination, radius);
    if (this.ClearFine(from, to, radius)) return to;
    const g = this.Grid(radius);
    const start = this.NearestNode(g, from, radius);
    const goal = this.NearestNode(g, to, radius);
    if (start < 0 || goal < 0) return this.GetNavigationTarget(current, destination);
    // A* over the grid.
    const n = g.nodes.length;
    const cost = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap: Array<[number, number]> = [];
    const push = (node: number, f: number) => {
      heap.push([f, node]);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent]![0] <= heap[i]![0]) break;
        [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
        i = parent;
      }
    };
    const pop = (): number => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top[1];
    };
    const h = (i: number) => Vector2.Distance(g.nodes[i]!, g.nodes[goal]!);
    cost[start] = 0;
    push(start, h(start));
    while (heap.length) {
      const u = pop();
      if (closed[u]) continue;
      closed[u] = 1;
      if (u === goal) break;
      for (const v of g.links[u]!) {
        const c = cost[u]! + Vector2.Distance(g.nodes[u]!, g.nodes[v]!);
        if (c < cost[v]!) {
          cost[v] = c;
          prev[v] = u;
          push(v, c + h(v));
        }
      }
    }
    if (!closed[goal]) return this.GetNavigationTarget(current, destination);
    const path: number[] = [];
    for (let i = goal; i >= 0; i = prev[i]!) path.push(i);
    path.reverse();
    // The farthest of the next few route points that can be walked to in a straight line (checked finely: the rules'
    // 0.18 sampling can step over a corner a body cannot pass).
    let pick = path[0]!;
    for (let k = 1; k < Math.min(path.length, 16); k++) {
      if (this.ClearFine(from, g.nodes[path[k]!]!, radius)) pick = path[k]!;
      else break;
    }
    return g.nodes[pick]!.clone();
  }

  /** A straight line a body of `radius` can walk: sampled every 0.05. */
  ClearFine(a: Vector2, b: Vector2, radius: number): boolean {
    const d = Vector2.Distance(a, b);
    const steps = Math.max(1, Math.ceil(d / 0.05));
    for (let i = 1; i <= steps; i++) if (this.IsBlocked(Vector2.Lerp(a, b, i / steps), radius)) return false;
    return true;
  }

  /** The open grid point nearest to `p` (a body stuck on a corner is put there). */
  NearestOpen(p: Vector2, radius: number): Vector2 {
    const g = this.Grid(radius);
    const n = this.NearestNode(g, p, radius);
    return n >= 0 ? g.nodes[n]!.clone() : this.ClampToWalkable(p, radius);
  }

  private Grid(radius: number): { nodes: Vector2[]; index: Map<number, number>; links: number[][]; x0: number; y0: number } {
    const cached = this.grids.get(radius);
    if (cached) return cached;
    const b = this.PlayBounds;
    const x0 = Math.floor(b.xMin);
    const y0 = Math.floor(b.yMin);
    const nodes: Vector2[] = [];
    const index = new Map<number, number>();
    for (let x = x0; x < b.xMax; x++) {
      for (let y = y0; y < b.yMax; y++) {
        const p = new Vector2(x + 0.5, y + 0.5);
        if (this.IsBlocked(p, radius)) continue;
        index.set((x - x0) * 4096 + (y - y0), nodes.length);
        nodes.push(p);
      }
    }
    const links = nodes.map((p) => {
      const out: number[] = [];
      const gx = Math.floor(p.x) - x0;
      const gy = Math.floor(p.y) - y0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const j = index.get((gx + dx) * 4096 + (gy + dy));
          if (j !== undefined && this.HasClearWalkableSegment(p, nodes[j]!, radius)) out.push(j);
        }
      }
      return out;
    });
    const grid = { nodes, index, links, x0, y0 };
    this.grids.set(radius, grid);
    return grid;
  }

  private NearestNode(g: { nodes: Vector2[]; index: Map<number, number>; x0: number; y0: number }, p: Vector2, radius: number): number {
    let best = -1;
    let bestD = Infinity;
    const gx = Math.floor(p.x) - g.x0;
    const gy = Math.floor(p.y) - g.y0;
    for (let r = 0; r <= 3 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const j = g.index.get((gx + dx) * 4096 + (gy + dy));
          if (j === undefined) continue;
          const d = Vector2.Distance(p, g.nodes[j]!);
          if (d < bestD && this.ClearFine(p, g.nodes[j]!, radius)) {
            best = j;
            bestD = d;
          }
        }
      }
    }
    return best;
  }

  /** The room's name, "Corridor", "Doorway" or "Station" (upstream: the room, "Hallway", "Doorway", "Ship"). */
  GetRoomName(position: Vector2): string {
    for (const room of this.Rooms) if (room.Bounds.Contains(position)) return room.Name;
    for (const c of this.Corridors) if (c.Contains(position)) return "Corridor";
    for (const d of this.Doorways) if (d.Contains(position)) return "Doorway";
    return "Station";
  }

  /** The room id at a point, or "" outside every room. */
  GetRoomId(position: Vector2): string {
    for (const room of this.Rooms) if (room.Bounds.Contains(position)) return room.Id;
    return "";
  }

  HasClearWalkableSegment(start: Vector2, end: Vector2, radius: number): boolean {
    const distance = Dist(start, end);
    const steps = Math.max(1, Math.ceil(f(distance / f(0.18))));
    for (let i = 1; i <= steps; i++) {
      const sample = LerpF(start, end, f(i / steps));
      if (this.IsBlocked(sample, radius)) return false;
    }
    return true;
  }

  FindNearestOpenPosition(position: Vector2, radius: number): Vector2 {
    const step = f(0.2);
    for (let ring = 1; ring <= 48; ring++) {
      for (let x = -ring; x <= ring; x++) {
        for (let y = -ring; y <= ring; y++) {
          if (Math.abs(x) !== ring && Math.abs(y) !== ring) continue;
          const candidate = this.ClampToBounds(new Vector2(f(position.x + f(x * step)), f(position.y + f(y * step))), radius);
          if (!this.IsBlocked(candidate, radius)) return candidate;
        }
      }
    }
    return this.MeetingPoint.clone();
  }

  ClampToBounds(position: Vector2, radius: number): Vector2 {
    const r = f(radius);
    const b = this.PlayBounds;
    const cx = Math.min(Math.max(position.x, f(b.xMin + r)), f(b.xMax - r));
    const cy = Math.min(Math.max(position.y, f(b.yMin + r)), f(b.yMax - r));
    return new Vector2(cx, cy);
  }

  // ---- stations (BasicSpawner's lookups, which only read the map) ----------------------------------------------

  /** TryGetSabotageStation */
  PanelFor(type: number): FaultPanel | null {
    return this.FaultPanels.find((p) => p.Type === type) ?? null;
  }

  /** TryGetNearestSabotageStation */
  NearestPanel(position: Vector2): { panel: FaultPanel; distance: number } | null {
    let best: FaultPanel | null = null;
    let distance = Number.MAX_VALUE;
    for (const p of this.FaultPanels) {
      const d = Dist(position, p.Position);
      if (d < distance) {
        best = p;
        distance = d;
      }
    }
    return best ? { panel: best, distance } : null;
  }

  /** TryGetNearestVent */
  NearestHatch(position: Vector2): { hatch: Hatch; distance: number } | null {
    let best: Hatch | null = null;
    let distance = Number.MAX_VALUE;
    for (const h of this.Hatches) {
      const d = Dist(position, h.Position);
      if (d < distance) {
        best = h;
        distance = d;
      }
    }
    return best ? { hatch: best, distance } : null;
  }

  /** GetNextVent: the next hatch of the same group in data order, wrapping round. */
  GetNextHatch(current: Hatch): Hatch {
    if (this.Hatches.length === 0) return current;
    const group = this.Hatches.filter((h) => h.GroupId === current.GroupId);
    if (group.length <= 1) return current;
    let currentIndex = 0;
    for (let i = 0; i < group.length; i++) {
      if (Dist(group[i]!.Position, current.Position) < f(0.01)) {
        currentIndex = i;
        break;
      }
    }
    return group[(currentIndex + 1) % group.length]!;
  }

  /** GetTaskStationIdAt */
  JobIdAt(position: Vector2): number {
    for (const s of this.JobStations) if (Dist(s.Position, position) < f(0.01)) return s.Id;
    return -1;
  }
}

/** The one map of the game. */
export const STATION = new ShipMap(mapFile as unknown as StationMapFile);
