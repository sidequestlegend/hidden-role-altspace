// Saved data for the local player: localStorage under `pk1.<slug>.<inst>.<uid>.`.
// It belongs to the device and the host world, not to the account: say so wherever a port offers saving.

import { storagePrefix } from "./names.ts";
import type { KeyValueStore } from "./types.ts";
import { decodeValue, encodeValue } from "./values.ts";

export class Persistence {
  private readonly store: KeyValueStore;
  private readonly prefix: string;

  constructor(store: KeyValueStore, slug: string, inst: string, uid: string) {
    this.store = store;
    this.prefix = storagePrefix(slug, inst, uid);
  }

  /** The saved value, or `fallback` when there is none or it cannot be read. */
  get<T>(key: string, fallback: T): T {
    let text: string | null = null;
    try {
      text = this.store.get(this.prefix + key);
    } catch {
      return fallback;
    }
    if (text === null) return fallback;
    try {
      return decodeValue(JSON.parse(text)) as T;
    } catch {
      return fallback;
    }
  }

  /** False when the device refused to store it (storage full or switched off). */
  set(key: string, value: unknown): boolean {
    try {
      this.store.set(this.prefix + key, JSON.stringify(encodeValue(value)));
      return true;
    } catch {
      return false;
    }
  }

  has(key: string): boolean {
    try {
      return this.store.get(this.prefix + key) !== null;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.store.remove(this.prefix + key);
    } catch {
      /* nothing to remove */
    }
  }

  keys(): string[] {
    try {
      return this.store.keys(this.prefix).map((k) => k.slice(this.prefix.length));
    } catch {
      return [];
    }
  }
}
