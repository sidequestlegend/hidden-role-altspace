// The two sealed messages of the game, as fixed-length text, so that their size never depends on who sent them, on
// their role, or on what they did (PORT.md 3.9, "Why the beat").
//
//   Beat     every rostered player -> the referee, 4 times a second for the whole match, alive or not, acting or
//            not: the counterpart of the upstream Fusion input struct (NetworkInputData: direction, buttons, vote).
//            Position (self-reported, map units), the held buttons, the button edges of the last second with their
//            synced times, and an argument for the edges that need one (vote target, hatch index).
//   Secret   the referee -> one player, inside the dealer's leaf, rewritten for every player at a fixed rate: role,
//            fellow saboteurs, job masks, cooldowns.
//
// Both are padded with spaces to a fixed length before sealing (AES-GCM keeps the length).

import { Btn } from "./GameTypes.ts";

export const BEAT_CHARS = 360;
export const SECRET_CHARS = 160;
/** Edges kept in a beat: those of the last EDGE_WINDOW seconds, at most MAX_EDGES. */
export const MAX_EDGES = 8;
export const EDGE_WINDOW = 1.0;
/** Seconds between two beats, and between two rewrites of the dealer's leaf. */
export const BEAT_SECONDS = 0.25;
/** Instance ticks (50 ms) per beat. */
export const BEAT_TICKS = 5;

/** [button, down 1 / up 0, synced time relative to the match start, argument] */
export type Edge = [number, 0 | 1, number, number];

export interface Beat {
  /** Match number. */
  m: number;
  /** Sequence number of this beat within the match. */
  q: number;
  /** Synced time of the beat, seconds since the match started. */
  t: number;
  /** Position in map units. */
  p: [number, number];
  /** Held buttons, bit per Btn. */
  h: number;
  e: Edge[];
}

export interface Secret {
  /** Match number. */
  n: number;
  /** Role. */
  r: number;
  /** Slots of the other saboteurs (only a saboteur's own entry lists them). */
  f: number[];
  /** Assigned and completed job masks, last job handed out (-1: none). */
  a: number;
  c: number;
  l: number;
  /** Synced times (relative to the match start) when the next elimination and fault are allowed; 0 for a technician. */
  k: number;
  s: number;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

function pad(text: string, length: number): string {
  if (text.length > length) throw new Error(`a sealed message needs ${text.length} characters, more than ${length}`);
  return text + " ".repeat(length - text.length);
}

export function encodeBeat(beat: Beat): string {
  const edges = beat.e.slice(-MAX_EDGES).map((e): Edge => [e[0], e[1], round3(e[2]), e[3]]);
  for (;;) {
    const text = JSON.stringify({ m: beat.m, q: beat.q, t: round3(beat.t), p: [round2(beat.p[0]), round2(beat.p[1])], h: beat.h, e: edges });
    if (text.length <= BEAT_CHARS) return pad(text, BEAT_CHARS);
    edges.shift();
  }
}

export function decodeBeat(text: unknown): Beat | null {
  if (typeof text !== "string") return null;
  try {
    const b = JSON.parse(text.trimEnd()) as Beat;
    if (typeof b.m !== "number" || typeof b.q !== "number" || typeof b.t !== "number" || !Array.isArray(b.p) || !Array.isArray(b.e)) return null;
    const p: [number, number] = [Number(b.p[0]), Number(b.p[1])];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(b.t)) return null;
    const e: Edge[] = [];
    for (const raw of b.e.slice(0, MAX_EDGES)) {
      if (!Array.isArray(raw)) continue;
      const button = Number(raw[0]);
      const t = Number(raw[2]);
      if (!Number.isInteger(button) || button < 0 || button > Btn.Hatch || !Number.isFinite(t)) continue;
      e.push([button, raw[1] ? 1 : 0, t, Number.isFinite(Number(raw[3])) ? Number(raw[3]) : 0]);
    }
    return { m: b.m, q: b.q, t: b.t, p, h: Number(b.h) | 0, e };
  } catch {
    return null;
  }
}

export function encodeSecret(secret: Secret): string {
  return pad(JSON.stringify({ ...secret, k: round2(secret.k), s: round2(secret.s) }), SECRET_CHARS);
}

export function decodeSecret(value: unknown): Secret | null {
  if (typeof value !== "string") return null;
  try {
    const s = JSON.parse(value.trimEnd()) as Secret;
    return typeof s.n === "number" && typeof s.r === "number" ? s : null;
  } catch {
    return null;
  }
}
