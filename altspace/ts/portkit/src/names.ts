// Every name the protocol puts on the wire, in one place. See "Names (protocol tag pk1)" in the README.

export const TAG = "pk1";
export const PROTOCOL = 1;

/** `[a-z0-9-]`, at most 24 characters. Empty when nothing usable is left. */
export function sanitizeInstanceKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

/** A slug is what the snippet is registered under: lower-case letters, digits and hyphens. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
}

/** The instance key for an element: `room`, else `instance`, else its index among same-name elements. */
export function instanceKeyFor(attrs: { room?: string | null; instance?: string | null }, indexAmongSameName: number): string {
  return sanitizeInstanceKey(attrs.room) || sanitizeInstanceKey(attrs.instance) || String(indexAmongSameName);
}

export function holderName(slug: string, inst: string): string {
  return `${TAG}:${slug}:${inst}`;
}

/** What the relay graph compares with its holder's name, and the key of the page registry's holders. */
export function relayKey(slug: string, inst: string): string {
  return `${slug}:${inst}`;
}

export function networkId(slug: string, inst: string, objKey: string): string {
  return `${TAG}/${slug}/${inst}/${objKey}`;
}

/**
 * The BS Object Id of a kit object that is attached to a player with autoSync (bindings `"attach": true`). The app
 * networks such an attachment as the user-state key `attachment_<id>` and each other client re-parents its own copy of
 * the object with that id, so every client gives the object the id as the kit loads (not only the page that attaches
 * it), and the id must make a valid key: 1-64 of `A-Z a-z 0-9 _ - : @` with the prefix, so at most 53 characters, no
 * `/` and no `.` (the synced-object ids above would be refused). `pk1:<slug>:<inst>:<objKey>`; one that would be longer,
 * or whose key holds other characters, becomes `pk1:<slug>:<inst>:<hash>`, and then `pk1:<hash of it all>`.
 */
export function attachId(slug: string, inst: string, objKey: string): string {
  const ok = (s: string) => s.length <= 53 && /^[A-Za-z0-9_\-:@]+$/.test(s);
  const plain = `${TAG}:${slug}:${inst}:${objKey}`;
  if (ok(plain)) return plain;
  const short = `${TAG}:${slug}:${inst}:${fnv(objKey)}`;
  if (ok(short)) return short;
  return `${TAG}:${fnv(`${slug}:${inst}:${objKey}`)}${fnv(`${objKey}:${inst}:${slug}`)}`;
}

/** 32-bit FNV-1a as 8 hex digits (a short, stable name, not a security hash). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Space-state and user-state prefix, without the trailing dot. */
export function statePrefix(slug: string, inst: string): string {
  return `${TAG}.${slug}.${inst}`;
}

export function storagePrefix(slug: string, inst: string, uid: string): string {
  return `${TAG}.${slug}.${inst}.${uid}.`;
}

/** A state path segment may hold A-Z a-z 0-9 _ - @ and be up to 64 characters (StatePathCodec's verbatim set). */
export function isPathSegment(segment: string): boolean {
  return /^[A-Za-z0-9_\-@]{1,64}$/.test(segment);
}

export interface Envelope {
  pk: 1;
  g: string;
  i: string;
  t: string;
  [field: string]: unknown;
}

export function makeEnvelope(slug: string, inst: string, type: string, fields: Record<string, unknown>): Envelope {
  return { pk: 1, g: slug, i: inst, t: type, ...fields };
}

/** Anything that is not one of ours is ignored before use. */
export function parseEnvelope(data: string): Envelope | null {
  if (typeof data !== "string" || data.length < 20 || data.charCodeAt(0) !== 0x7b) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const e = parsed as Record<string, unknown>;
  if (e.pk !== PROTOCOL || typeof e.g !== "string" || typeof e.i !== "string" || typeof e.t !== "string") return null;
  return e as Envelope;
}
