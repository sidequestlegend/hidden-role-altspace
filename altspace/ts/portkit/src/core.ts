// What every part of one running instance shares: where it lives in the room's state, its timers, its options.

import { statePrefix } from "./names.ts";
import type { Scheduler } from "./scheduler.ts";
import type { LogLevel, Platform, PlatformPlayer, Unsubscribe } from "./types.ts";

export interface RuntimeOptions {
  /** A client that has just started judges no referee for this long, so a late arrival's player list can fill. */
  settleMs: number;
  /** Rank r claims the referee's seat after r times this (README: 400 ms). */
  claimStepMs: number;
  /** A referee claim that has not come back is made again after this long. */
  claimRetryMs: number;
  /** How long to wait for the first full state snapshot before starting from whatever is mirrored. */
  snapshotTimeoutMs: number;
  /** How long to wait for the synced clock's first answer. */
  clockTimeoutMs: number;
  /** How often the synced clock is asked again. */
  clockResyncMs: number;
  /** How long the start waits for a referee and a player id before it reports the instance as stuck. */
  admitWarnMs: number;
  /** An ownership claim that has not come back is given up after this long. */
  ownerClaimTimeoutMs: number;
  /** A behaviour in continuous mode is sent at most this often. */
  continuousIntervalMs: number;
  /** A network event waits at most this long for the sender's state write it was sent after. */
  eventHoldMs: number;
  /** "reset": a room found with nobody left from the last game starts fresh (as a VRChat instance would). */
  whenEmpty: "reset" | "keep";
}

export const DEFAULT_OPTIONS: RuntimeOptions = {
  settleMs: 1000,
  claimStepMs: 400,
  claimRetryMs: 3000,
  snapshotTimeoutMs: 8000,
  clockTimeoutMs: 2000,
  clockResyncMs: 60000,
  admitWarnMs: 15000,
  ownerClaimTimeoutMs: 5000,
  continuousIntervalMs: 200,
  eventHoldMs: 2000,
  whenEmpty: "reset",
};

export class Core {
  readonly platform: Platform;
  readonly slug: string;
  readonly inst: string;
  /** `pk1.<slug>.<inst>` */
  readonly prefix: string;
  readonly options: RuntimeOptions;
  readonly scheduler: Scheduler;
  /** The local player as the platform reported them when the instance started. */
  me: PlatformPlayer;
  disposed = false;
  private readonly unsubs: Unsubscribe[] = [];
  private readonly stateHandlers: Array<(key: string, value: string | undefined) => void> = [];

  constructor(platform: Platform, slug: string, inst: string, options: RuntimeOptions, scheduler: Scheduler) {
    this.platform = platform;
    this.slug = slug;
    this.inst = inst;
    this.prefix = statePrefix(slug, inst);
    this.options = options;
    this.scheduler = scheduler;
    this.me = platform.local();
  }

  /** Starts listening to the room's state under this instance's prefix. */
  listen(): void {
    const dot = this.prefix + ".";
    this.own(
      this.platform.onState(dot, (path, value) => {
        if (this.disposed) return;
        const key = path.slice(dot.length);
        for (const handler of this.stateHandlers.slice()) {
          try {
            handler(key, value);
          } catch (error) {
            this.error("state handler", error);
          }
        }
      }),
    );
  }

  /** Reads a leaf of this instance from the mirror. `key` is relative to the prefix. */
  get(key: string): string | undefined {
    return this.platform.stateGet(this.prefix + "." + key);
  }

  set(key: string, value: string): void {
    if (this.disposed) return;
    this.platform.stateSet(this.prefix + "." + key, value);
  }

  entries(): Array<[string, string]> {
    const dot = this.prefix + ".";
    return this.platform.stateEntries(dot).map(([path, value]) => [path.slice(dot.length), value]);
  }

  onState(handler: (key: string, value: string | undefined) => void): void {
    this.stateHandlers.push(handler);
  }

  /** Keeps an unsubscribe to run when the instance is disposed. */
  own(unsub: Unsubscribe): void {
    if (this.disposed) unsub();
    else this.unsubs.push(unsub);
  }

  log(level: LogLevel, message: string): void {
    this.platform.log(level, `[${this.slug}:${this.inst}] ${message}`);
  }

  error(where: string, error: unknown): void {
    const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.log("error", `${where}: ${text}`);
  }

  /** Runs game code so that one behaviour's exception cannot stop the others. */
  guard(where: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.error(where, error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.stop();
    for (const unsub of this.unsubs.splice(0)) {
      try {
        unsub();
      } catch {
        /* a listener that is already gone */
      }
    }
    this.stateHandlers.length = 0;
  }
}
