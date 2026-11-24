// Protected values: leaves `x.<key>` under the instance prefix, written with the room's protected scope. Only
// the space's owner and moderators can write them; everybody reads them. They suit what must not be forged:
// who is game master, a whitelist, the settings of a world-wide tool.
//
// They are not tied to a game's epoch: a fresh start keeps them, and the room keeps the path protected for its
// whole life.

import type { ProtectedView } from "./behaviour.ts";
import type { Core } from "./core.ts";
import { isPathSegment } from "./names.ts";
import { asciiJson, safeParse } from "./util.ts";
import { decodeValue, encodeValue } from "./values.ts";

export class ProtectedValues implements ProtectedView {
  private readonly core: Core;
  /** Told when a protected value changed. */
  onChanged: (key: string) => void = () => {};

  constructor(core: Core) {
    this.core = core;
  }

  listen(): void {
    this.core.onState((key) => {
      if (key.startsWith("x.")) this.core.guard("OnProtectedChanged", () => this.onChanged(key.slice(2)));
    });
  }

  get CanWrite(): boolean {
    return this.core.platform.local().isAdmin;
  }

  Set(key: string, value: unknown): void {
    if (!isPathSegment(key)) throw new Error(`a protected key must be 1-64 of A-Z a-z 0-9 _ - @, not '${key}'`);
    if (this.core.disposed) return;
    this.core.platform.stateSetProtected(`${this.core.prefix}.x.${key}`, asciiJson({ v: encodeValue(value) }));
  }

  Get<T>(key: string, fallback: T): T {
    const raw = safeParse(this.core.get(`x.${key}`));
    return raw && typeof raw === "object" && "v" in raw ? (decodeValue((raw as { v: unknown }).v) as T) : fallback;
  }

  Has(key: string): boolean {
    const raw = safeParse(this.core.get(`x.${key}`));
    return !!raw && typeof raw === "object" && "v" in raw;
  }
}
