// Delayed events and the 20 Hz tick. Everything goes through the platform's clock, so a test advances a
// virtual one and a stopped instance leaves no timer behind.

import type { Clock } from "./types.ts";

export const TICK_MS = 50;
export const TICK_SECONDS = TICK_MS / 1000;

export type Handle = number;

interface Delayed {
  timer: number;
}

interface Framed {
  id: Handle;
  ticks: number;
  fn: () => void;
}

export class Scheduler {
  private readonly clock: Clock;
  private readonly onError: (where: string, error: unknown) => void;
  private readonly delayed = new Map<Handle, Delayed>();
  private framed: Framed[] = [];
  private nextHandle = 1;
  private tickTimer = 0;
  private running = false;
  private stopped = false;
  private startedAt = 0;
  private lastTickAt = 0;
  private tickCount = 0;
  /** Seconds the last tick covered (0 outside a tick's first run). */
  deltaTime = 0;

  constructor(clock: Clock, onError: (where: string, error: unknown) => void) {
    this.clock = clock;
    this.onError = onError;
    this.startedAt = clock.now();
    this.lastTickAt = this.startedAt;
  }

  /** Seconds since the scheduler was made. */
  get time(): number {
    return (this.clock.now() - this.startedAt) / 1000;
  }

  get ticks(): number {
    return this.tickCount;
  }

  /** Starts the tick. `onTick` runs every 50 ms; a page that stalled is not paid back with a burst of ticks. */
  start(onTick: (deltaSeconds: number) => void): void {
    if (this.running || this.stopped) return;
    this.running = true;
    this.lastTickAt = this.clock.now();
    const step = () => {
      if (!this.running) return;
      const now = this.clock.now();
      const elapsed = now - this.lastTickAt;
      this.lastTickAt = now;
      this.tickCount++;
      this.deltaTime = Math.min(0.25, Math.max(0.001, elapsed / 1000));
      const due = this.framed.filter((f) => --f.ticks <= 0);
      if (due.length) this.framed = this.framed.filter((f) => f.ticks > 0);
      for (const f of due) this.guard("delayed frames", f.fn);
      this.guard("tick", () => onTick(this.deltaTime));
      if (this.running) this.tickTimer = this.clock.setTimeout(step, TICK_MS);
    };
    this.tickTimer = this.clock.setTimeout(step, TICK_MS);
  }

  /** Runs `fn` once after `ms`. Returns a handle for `cancel`. */
  after(ms: number, fn: () => void): Handle {
    const id = this.nextHandle++;
    if (this.stopped) return id;
    const timer = this.clock.setTimeout(
      () => {
        if (!this.delayed.delete(id)) return;
        this.guard("delayed event", fn);
      },
      Math.max(0, ms),
    );
    this.delayed.set(id, { timer });
    return id;
  }

  /** Runs `fn` at the start of the tick `ticks` ticks from now (at least the next one). */
  afterTicks(ticks: number, fn: () => void): Handle {
    const id = this.nextHandle++;
    if (!this.stopped) this.framed.push({ id, ticks: Math.max(1, Math.floor(ticks)), fn });
    return id;
  }

  cancel(handle: Handle): void {
    const d = this.delayed.get(handle);
    if (d) {
      this.clock.clearTimeout(d.timer);
      this.delayed.delete(handle);
      return;
    }
    this.framed = this.framed.filter((f) => f.id !== handle);
  }

  /** Cancels the tick and every pending delayed event. The scheduler cannot be started again. */
  stop(): void {
    this.running = false;
    this.stopped = true;
    this.clock.clearTimeout(this.tickTimer);
    for (const d of this.delayed.values()) this.clock.clearTimeout(d.timer);
    this.delayed.clear();
    this.framed = [];
  }

  get pending(): number {
    return this.delayed.size + this.framed.length;
  }

  private guard(where: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.onError(where, error);
    }
  }
}
