// One synced behaviour = one string leaf `v.<id>` holding {e, g, n, w, d}:
//   e  the epoch it belongs to (see referee.ts)    g  ownership generation the writer held
//   n  sequence number, rising for the behaviour's whole life
//   w  the writer's session id                     d  the synced fields
// A value too large for one leaf is cut into `c.<id>.<i>` chunk leaves, and the `v.<id>` leaf then carries
// {e, g, n, w, c: count} instead of d. Chunks are tagged with n, so a reader only joins chunks of one write.

import { asciiJson, isRecord, jsonLeafBytes, leafCharBytes, safeParse } from "./util.ts";

export interface LeafRecord {
  e: number;
  g: number;
  n: number;
  w: string;
  d: unknown;
}

/** Room left under the server's leaf limit for the chunk tag and for any difference in how sizes are counted. */
const LEAF_MARGIN = 96;

/** An empty string stands for "no value": deletes cannot be ordered with queued writes, so leaves are blanked. */
export const TOMBSTONE = "";

export function headKey(id: string): string {
  return `v.${id}`;
}

export function chunkKey(id: string, index: number): string {
  return `c.${id}.${index}`;
}

export interface EncodedLeaf {
  /** Keys are relative to the instance prefix. */
  writes: Array<[string, string]>;
  chunks: number;
  /** Encoded size of the whole value, for OnPostSerialization and the leaf budget. */
  bytes: number;
}

export function encodeLeaf(id: string, record: LeafRecord, maxLeafBytes: number, previousChunks: number): EncodedLeaf {
  const budget = Math.max(256, maxLeafBytes - LEAF_MARGIN);
  const whole = asciiJson({ e: record.e, g: record.g, n: record.n, w: record.w, d: record.d });
  const bytes = jsonLeafBytes(whole);
  const writes: Array<[string, string]> = [];
  let chunks = 0;
  if (bytes <= budget) {
    writes.push([headKey(id), whole]);
  } else {
    const pieces = splitByLeafBytes(whole, budget - 32);
    chunks = pieces.length;
    // Chunks first: a reader that sees the head waits for them, and the app keeps queue order.
    for (let i = 0; i < pieces.length; i++) writes.push([chunkKey(id, i), `${record.n}.${i}~${pieces[i]}`]);
    writes.push([headKey(id), asciiJson({ e: record.e, g: record.g, n: record.n, w: record.w, c: chunks })]);
  }
  for (let i = chunks; i < previousChunks; i++) writes.push([chunkKey(id, i), TOMBSTONE]);
  return { writes, chunks, bytes };
}

function splitByLeafBytes(text: string, budget: number): string[] {
  const pieces: string[] = [];
  let start = 0;
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const add = leafCharBytes(text, i);
    // Never cut between the halves of a surrogate pair (asciiJson leaves none, but the cut must be safe anyway).
    const lowHalf = (text.charCodeAt(i) & 0xfc00) === 0xdc00;
    if (size + add > budget && i > start && !lowHalf) {
      pieces.push(text.slice(start, i));
      start = i;
      size = 0;
    }
    size += add;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces;
}

export type DecodedLeaf =
  | { kind: "none" }
  /** The head names chunks that have not all arrived yet. */
  | { kind: "pending"; e: number; g: number; n: number; w: string; chunks: number }
  | { kind: "bad" }
  | { kind: "value"; record: LeafRecord; chunks: number };

/** Reads the current value of behaviour `id` from the mirror. `get` takes keys relative to the instance prefix. */
export function decodeLeaf(id: string, get: (key: string) => string | undefined): DecodedLeaf {
  const head = get(headKey(id));
  if (head === undefined || head === TOMBSTONE) return { kind: "none" };
  const parsed = safeParse(head);
  if (!isRecord(parsed) || !isCount(parsed.e) || !isCount(parsed.g) || !isCount(parsed.n) || typeof parsed.w !== "string") return { kind: "bad" };
  const e = parsed.e as number;
  const g = parsed.g as number;
  const n = parsed.n as number;
  const w = parsed.w;
  if (parsed.c === undefined) return { kind: "value", record: { e, g, n, w, d: parsed.d }, chunks: 0 };
  if (!isCount(parsed.c) || (parsed.c as number) < 1 || (parsed.c as number) > 512) return { kind: "bad" };
  const chunks = parsed.c as number;
  let whole = "";
  for (let i = 0; i < chunks; i++) {
    const piece = get(chunkKey(id, i));
    const tag = `${n}.${i}~`;
    if (piece === undefined || !piece.startsWith(tag)) return { kind: "pending", e, g, n, w, chunks };
    whole += piece.slice(tag.length);
  }
  const full = safeParse(whole);
  if (!isRecord(full) || full.e !== e || full.g !== g || full.n !== n || full.w !== w) return { kind: "bad" };
  return { kind: "value", record: { e, g, n, w, d: full.d }, chunks };
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** The behaviour id a relative key belongs to, for `v.<id>` and `c.<id>.<i>` keys; null for anything else. */
export function leafOwnerOf(key: string): string | null {
  if (key.startsWith("v.")) return key.indexOf(".", 2) < 0 ? key.slice(2) : null;
  if (key.startsWith("c.")) {
    const end = key.indexOf(".", 2);
    return end > 2 ? key.slice(2, end) : null;
  }
  return null;
}
