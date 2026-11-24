// Small pure helpers. Nothing here touches the page, timers or randomness.

/** UTF-8 byte length of a string (lone surrogates count as U+FFFD, three bytes). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export function utf8Encode(text: string): Uint8Array {
  const out = new Uint8Array(utf8Length(text));
  let o = 0;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      c = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00);
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out[o++] = c;
    else if (c < 0x800) {
      out[o++] = 0xc0 | (c >> 6);
      out[o++] = 0x80 | (c & 0x3f);
    } else if (c < 0x10000) {
      out[o++] = 0xe0 | (c >> 12);
      out[o++] = 0x80 | ((c >> 6) & 0x3f);
      out[o++] = 0x80 | (c & 0x3f);
    } else {
      out[o++] = 0xf0 | (c >> 18);
      out[o++] = 0x80 | ((c >> 12) & 0x3f);
      out[o++] = 0x80 | ((c >> 6) & 0x3f);
      out[o++] = 0x80 | (c & 0x3f);
    }
  }
  return out;
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++]!;
    let c: number;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 0x1f) << 6) | (bytes[i++]! & 0x3f);
    else if (b < 0xf0) {
      c = ((b & 0x0f) << 12) | ((bytes[i]! & 0x3f) << 6) | (bytes[i + 1]! & 0x3f);
      i += 2;
    } else {
      c = ((b & 0x07) << 18) | ((bytes[i]! & 0x3f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f);
      i += 3;
    }
    out += String.fromCodePoint(c);
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url without padding: every character is legal in a state path and in a relay argument. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[a >> 2]! + B64[((a & 3) << 4) | (b >> 4)]!;
    if (i + 1 < bytes.length) out += B64[((b & 15) << 2) | (c >> 6)]!;
    if (i + 2 < bytes.length) out += B64[c & 63]!;
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    let v = B64.indexOf(clean[i]!);
    if (v < 0) v = clean[i] === "+" ? 62 : clean[i] === "/" ? 63 : -1;
    if (v < 0) throw new Error("bad base64 character");
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** FNV-1a, 32 bits, as eight hex digits. Used for digests that must match across clients, not for security. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** JSON with object keys sorted, so two clients produce the same text for the same value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) out[key] = sortKeys((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/**
 * JSON that is plain ASCII and holds none of the bridge's delimiter characters (¶ § | ‽ ¤).
 * The page's string calls strip or cut those in some app versions, and the escapes cost nothing to read back:
 * JSON.parse undoes them.
 */
export function asciiJson(value: unknown): string {
  const json = JSON.stringify(value);
  let out = "";
  let from = 0;
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    // The bar (0x7c) and everything from DEL up. In JSON these only occur inside strings, where an escape is legal.
    if (code !== 0x7c && code < 0x7f) continue;
    out += json.slice(from, i) + BACKSLASH + "u" + code.toString(16).padStart(4, "0");
    from = i + 1;
  }
  return from === 0 ? json : out + json.slice(from);
}

const BACKSLASH = String.fromCharCode(0x5c);

/** Size of a string once the server has encoded it as a JSON leaf: quotes plus escapes, in UTF-8 bytes. */
export function jsonLeafBytes(text: string): number {
  let bytes = 2;
  for (let i = 0; i < text.length; i++) bytes += leafCharBytes(text, i);
  return bytes;
}

/** Bytes one UTF-16 unit of a string adds to its JSON encoding (a surrogate pair is counted on its first half). */
export function leafCharBytes(text: string, i: number): number {
  const c = text.charCodeAt(i);
  if (c === 0x22 || c === 0x5c) return 2;
  if (c < 0x20) return c === 0x08 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d ? 2 : 6;
  if (c < 0x80) return 1;
  if (c < 0x800) return 2;
  if (c >= 0xdc00 && c <= 0xdfff) return i > 0 && (text.charCodeAt(i - 1) & 0xfc00) === 0xd800 ? 0 : 3;
  if (c >= 0xd800 && c <= 0xdbff) return i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 4 : 3;
  return 3;
}

export function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function safeParse(text: string | undefined | null): unknown {
  if (typeof text !== "string" || text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A promise with its resolver, for gates that open once. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  settled: boolean;
}

export function deferred<T>(): Deferred<T> {
  let resolveFn!: (value: T) => void;
  const d: Deferred<T> = {
    promise: new Promise<T>((resolve) => {
      resolveFn = resolve;
    }),
    resolve(value: T) {
      if (d.settled) return;
      d.settled = true;
      resolveFn(value);
    },
    settled: false,
  };
  return d;
}

/** mulberry32: a small seeded generator for the fake room and for tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
