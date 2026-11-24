// bindings.json (schema 1), as the kit builder writes it and the build compiles it into the script.

import { isPathSegment, isValidSlug } from "./names.ts";
import { MAX_PLAYER_LEAVES } from "./peruser.ts";
import type { HostEventKind } from "./types.ts";
import { isRecord } from "./util.ts";

export interface BindingObject {
  path: string;
  sync: "none" | "transform";
  grab: boolean;
  click: boolean;
  seat: boolean;
  /**
   * False for an object the upstream prefab has switched off. The kit holds every bound object switched on (an object
   * that is off never wakes its BS Object Id, so the page would never learn of it); the runtime switches it off as soon
   * as it has found it. Absent: on.
   */
  active?: boolean;
}

export interface BindingBehaviour {
  id: string;
  type: string;
  /** Key of the object the behaviour sits on; absent for one with no object. */
  object?: string | null;
  fields?: Record<string, unknown>;
  /** One copy per player, owned by that player (VRChat: a PlayerObject). The class can say so instead. */
  perPlayer?: boolean;
  /**
   * A sync group: every behaviour naming the same group shares one state leaf and one owner. For many small
   * behaviours of one kind (the pieces of a board), so that they cost two leaves together, not two each.
   */
  group?: string;
}

export interface BindingEvent {
  /** Key of the object the event comes from. Not needed for kind "graph". */
  object?: string;
  kind: HostEventKind | "graph";
  /** For kind "graph": the name the graph reports through `window.__pk1.event`. */
  name?: string;
  behaviour: string;
  method: string;
  /** For clicks: metres from the local head to the click within which it counts. 0 or absent: any distance. */
  reach?: number;
  // `behaviour` and `method` may be empty for the kinds only a graph reports (ui*, held*).
}

export interface Bindings {
  schema: 1;
  slug: string;
  hash?: string;
  /** Name of the kit prefab; the kit root under the holder is `<root>(Clone)`. Defaults to the slug. */
  root?: string;
  bundles: { windows: string; android: string };
  objects: Record<string, BindingObject>;
  refs: string[];
  behaviours: BindingBehaviour[];
  events: BindingEvent[];
}

const EVENT_KINDS = ["click", "grab", "drop", "triggerEnter", "triggerExit", "collisionEnter", "collisionExit", "uiButton", "uiSlider", "uiToggle", "heldTrigger", "heldPrimary", "heldSecondary", "field", "graph"];
/** Kinds only a graph can report. Their entry may name no behaviour: code can listen with `gameObject.On(kind, ...)`. */
const GRAPH_KINDS = ["uiButton", "uiSlider", "uiToggle", "heldTrigger", "heldPrimary", "heldSecondary", "field"];

/** Checks a parsed bindings.json. Throws one error listing everything that is wrong. */
export function validateBindings(json: unknown): Bindings {
  const problems: string[] = [];
  const fail = (text: string) => problems.push(text);
  if (!isRecord(json)) throw new Error("bindings: not an object");
  if (json.schema !== 1) fail(`schema is ${JSON.stringify(json.schema)}, expected 1`);
  if (typeof json.slug !== "string" || !isValidSlug(json.slug)) fail(`slug ${JSON.stringify(json.slug)} is not lower-case letters, digits and hyphens`);
  const bundles = isRecord(json.bundles) ? json.bundles : {};
  const objects = isRecord(json.objects) ? json.objects : {};
  const refs = Array.isArray(json.refs) ? json.refs : [];
  const behaviours = Array.isArray(json.behaviours) ? json.behaviours : [];
  const events = Array.isArray(json.events) ? json.events : [];

  const paths = new Map<string, string>();
  for (const key of Object.keys(objects)) {
    const o = objects[key];
    if (!isPathSegment(key)) fail(`object key '${key}' must be 1-64 of A-Z a-z 0-9 _ - @ (it becomes part of a network id)`);
    if (!isRecord(o) || typeof o.path !== "string") {
      fail(`object '${key}' has no path`);
      continue;
    }
    if (o.sync !== undefined && o.sync !== "none" && o.sync !== "transform") fail(`object '${key}': sync must be "none" or "transform"`);
    const other = paths.get(o.path);
    if (other !== undefined) fail(`objects '${other}' and '${key}' have the same path '${o.path}'`);
    paths.set(o.path, key);
  }
  refs.forEach((ref, i) => {
    if (typeof ref !== "string" || !(ref in objects)) fail(`refs[${i}] '${String(ref)}' is not an object key`);
  });
  if (new Set(refs).size !== refs.length) fail("refs lists an object twice");

  const ids = new Set<string>();
  for (const b of behaviours) {
    if (!isRecord(b) || typeof b.id !== "string" || typeof b.type !== "string") {
      fail(`a behaviour entry has no id or type: ${JSON.stringify(b)}`);
      continue;
    }
    if (!isPathSegment(b.id)) fail(`behaviour id '${b.id}' must be 1-64 of A-Z a-z 0-9 _ - @ (it is a state key)`);
    if (ids.has(b.id)) fail(`behaviour id '${b.id}' is used twice`);
    ids.add(b.id);
    if (b.object !== undefined && b.object !== null && !(String(b.object) in objects)) fail(`behaviour '${b.id}': object '${String(b.object)}' is not an object key`);
    if (b.fields !== undefined && !isRecord(b.fields)) fail(`behaviour '${b.id}': fields is not an object`);
    if (b.group !== undefined && (typeof b.group !== "string" || !/^[A-Za-z0-9_-]{1,48}$/.test(b.group))) fail(`behaviour '${b.id}': group must be 1-48 of A-Z a-z 0-9 _ -`);
    if (b.group !== undefined && b.perPlayer === true) fail(`behaviour '${b.id}': a per-player behaviour cannot be in a sync group`);
  }
  const checkRefs = (where: string, value: unknown): void => {
    if (Array.isArray(value)) value.forEach((v, i) => checkRefs(`${where}[${i}]`, v));
    else if (isRecord(value)) {
      if (typeof value.$obj === "string" && !(value.$obj in objects)) fail(`${where}: $obj '${value.$obj}' is not an object key`);
      else if (typeof value.$beh === "string" && !ids.has(value.$beh)) fail(`${where}: $beh '${value.$beh}' is not a behaviour id`);
      else if (typeof value.$comp === "string" && !(value.$comp in objects)) fail(`${where}: $comp '${value.$comp}' is not an object key`);
      else if (value.$clip !== undefined && value.on !== undefined && !(String(value.on) in objects)) fail(`${where}: $clip on '${String(value.on)}' is not an object key`);
      else if (!Object.keys(value).some((k) => k.startsWith("$"))) for (const k of Object.keys(value)) checkRefs(`${where}.${k}`, value[k]);
    }
  };
  for (const b of behaviours) if (isRecord(b) && isRecord(b.fields)) for (const f of Object.keys(b.fields)) checkRefs(`behaviour '${String(b.id)}' field '${f}'`, b.fields[f]);

  events.forEach((e, i) => {
    if (!isRecord(e)) return fail(`events[${i}] is not an object`);
    if (typeof e.kind !== "string" || EVENT_KINDS.indexOf(e.kind) < 0) fail(`events[${i}]: kind '${String(e.kind)}' is not one of ${EVENT_KINDS.join(", ")}`);
    if (e.kind === "graph") {
      if (typeof e.name !== "string" || !e.name) fail(`events[${i}]: a graph event needs a name`);
    } else if (typeof e.object !== "string" || !(e.object in objects)) fail(`events[${i}]: object '${String(e.object)}' is not an object key`);
    const unbound = GRAPH_KINDS.indexOf(String(e.kind)) >= 0 && !e.behaviour && !e.method;
    if (unbound) return;
    if (typeof e.behaviour !== "string" || !ids.has(e.behaviour)) fail(`events[${i}]: behaviour '${String(e.behaviour)}' is not a behaviour id`);
    if (typeof e.method !== "string" || !e.method) fail(`events[${i}]: no method`);
  });

  if (problems.length) throw new Error("bindings.json is not valid:\n  - " + problems.join("\n  - "));
  const normalObjects: Record<string, BindingObject> = {};
  for (const key of Object.keys(objects)) {
    const o = objects[key] as Record<string, unknown>;
    normalObjects[key] = { path: o.path as string, sync: o.sync === "transform" ? "transform" : "none", grab: o.grab === true, click: o.click === true, seat: o.seat === true };
    if (o.active === false) normalObjects[key]!.active = false;
  }
  return {
    schema: 1,
    slug: json.slug as string,
    hash: typeof json.hash === "string" ? json.hash : undefined,
    root: typeof json.root === "string" && json.root ? json.root : undefined,
    bundles: { windows: typeof bundles.windows === "string" ? bundles.windows : "", android: typeof bundles.android === "string" ? bundles.android : "" },
    objects: normalObjects,
    refs: refs as string[],
    behaviours: behaviours as BindingBehaviour[],
    events: events as BindingEvent[],
  };
}

export interface LeafBudget {
  /** Slots that hold synced state: one per ungrouped behaviour with synced fields, one per sync group. */
  slots: number;
  /** Space-state leaves one instance uses when nothing is chunked: ref, and o + v per slot (the referee's draw and command tables are in its user state). */
  spaceLeaves: number;
  /** User-state leaves one instance uses per player at most: k, d, and up to four for per-player behaviours. */
  userLeavesPerPlayer: number;
  /** How many instances of this game fit in one room's key limit, with nothing else in the room. */
  instancesPerRoom: number;
}

/** What the classes say about each binding, as far as the budget needs it. */
export interface BehaviourShape {
  synced: number;
  perPlayer: boolean;
}

/**
 * The static part of rung 0's "state leaf budget": what a game costs in the room's 2,048 keys. Sync groups
 * count once, however many behaviours they hold.
 */
export function leafBudget(bindings: Bindings, shapeOf: (type: string) => BehaviourShape | null, maxRoomKeys = 2048): LeafBudget {
  const slots = new Set<string>();
  let perPlayer = 0;
  for (const b of bindings.behaviours) {
    const shape = shapeOf(b.type);
    if (!shape) continue;
    if (b.perPlayer === true || shape.perPlayer) perPlayer++;
    else if (b.group) slots.add("@" + b.group);
    else if (shape.synced > 0) slots.add(b.id);
  }
  const spaceLeaves = 1 + 2 * slots.size;
  const playerLeaves = perPlayer === 0 ? 0 : Math.min(MAX_PLAYER_LEAVES, Math.max(1, Math.ceil(perPlayer / 24)));
  return { slots: slots.size, spaceLeaves, userLeavesPerPlayer: 2 + playerLeaves, instancesPerRoom: Math.floor(maxRoomKeys / Math.max(1, spaceLeaves)) };
}
