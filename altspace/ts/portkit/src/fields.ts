// Reading and writing a behaviour's synced fields as plain JSON.

import { canonicalJson, isRecord } from "./util.ts";
import { decodeValue, encodeValue } from "./values.ts";

export function readFields(target: object, fields: readonly string[]): Record<string, unknown> {
  const bag = target as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field] = encodeValue(bag[field]);
  return out;
}

/**
 * Assigns the fields present in `data`, in the order the class lists them. Arrays and value types are rebuilt,
 * so nothing is shared with the mirror.
 *
 * A field with a change callback (UdonSharp's [FieldChangeCallback]) is not assigned: when the received value
 * differs from the current one, the named property's setter is called with it, and storing it is the setter's
 * job. When it does not differ, nothing happens.
 */
export function assignFields(target: object, fields: readonly string[], data: unknown, callbacks?: Readonly<Record<string, string>>): void {
  if (!isRecord(data)) return;
  const bag = target as Record<string, unknown>;
  for (const field of fields) {
    if (!(field in data)) continue;
    const property = callbacks ? callbacks[field] : undefined;
    if (property === undefined) {
      bag[field] = decodeValue(data[field]);
      continue;
    }
    if (canonicalJson(encodeValue(bag[field])) === canonicalJson(data[field] ?? null)) continue;
    bag[property] = decodeValue(data[field]);
  }
}
