// Delayed events and the 20 Hz tick, on a clock the test controls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Scheduler, TICK_MS } from "../src/scheduler.ts";
import type { Clock } from "../src/types.ts";
import { FakeRoom } from "../src/platform/fake.ts";
import { enter, inst, probe, probeGame, untilStarted } from "./games.ts";

/** A clock that only moves when told to. */
class ManualClock implements Clock {
  time = 0;
  private timers: Array<{ at: number; id: number; fn: () => void }> = [];
  private next = 1;
  now(): number {
    return this.time;
  }
  wallSeconds(): number {
    return 1_000_000 + this.time / 1000;
  }
  setTimeout(fn: () => void, ms: number): number {
    const id = this.next++;
    this.timers.push({ at: this.time + ms, id, fn });
    return id;
  }
  clearTimeout(handle: number): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }
  advance(ms: number): void {
    const until = this.time + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= until).sort((x, y) => x.at - y.at || x.id - y.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.time = Math.max(this.time, due.at);
      due.fn();
    }
    this.time = until;
  }
  /** Time passes with nothing running, as when a page is frozen in the background. */
  stall(ms: number): void {
    this.time += ms;
  }
  get pending(): number {
    return this.timers.length;
  }
}

test("delayed events run once, at their time, in order; cancelled ones never run", () => {
  const clock = new ManualClock();
  const errors: string[] = [];
  const scheduler = new Scheduler(clock, (where, error) => errors.push(`${where}: ${String(error)}`));
  const ran: string[] = [];
  scheduler.after(300, () => ran.push(`c@${clock.time}`));
  scheduler.after(100, () => ran.push(`a@${clock.time}`));
  const cancelled = scheduler.after(150, () => ran.push("never"));
  scheduler.after(200, () => {
    ran.push(`b@${clock.time}`);
    scheduler.after(50, () => ran.push(`nested@${clock.time}`));
  });
  scheduler.after(120, () => {
    throw new Error("boom");
  });
  scheduler.cancel(cancelled);
  clock.advance(99);
  assert.deepEqual(ran, []);
  clock.advance(1000);
  assert.deepEqual(ran, ["a@100", "b@200", "nested@250", "c@300"]);
  assert.deepEqual(errors, ["delayed event: Error: boom"], "one event's exception does not stop the others");
  assert.equal(scheduler.pending, 0);
});

test("the tick runs 20 times a second and reports the time it covers", () => {
  const clock = new ManualClock();
  const scheduler = new Scheduler(clock, () => {});
  const deltas: number[] = [];
  scheduler.start((dt) => deltas.push(dt));
  clock.advance(1000);
  assert.equal(deltas.length, 20);
  assert.ok(deltas.every((dt) => Math.abs(dt - TICK_MS / 1000) < 1e-9));
  assert.ok(Math.abs(scheduler.time - 1) < 1e-9);

  // A page that was frozen for ten seconds gets one long tick (capped), not two hundred at once.
  clock.stall(10000);
  clock.advance(1);
  assert.equal(deltas.length, 21);
  assert.equal(deltas[20], 0.25);
  clock.advance(100);
  assert.equal(deltas.length, 23);

  // Frames are ticks.
  const ran: number[] = [];
  const at = scheduler.ticks;
  scheduler.afterTicks(3, () => ran.push(scheduler.ticks - at));
  scheduler.afterTicks(0, () => ran.push(scheduler.ticks - at));
  clock.advance(500);
  assert.deepEqual(ran, [1, 3]);

  // Stopping cancels everything and leaves no timer behind.
  scheduler.after(1000, () => ran.push(-1));
  scheduler.afterTicks(2, () => ran.push(-2));
  scheduler.stop();
  assert.equal(clock.pending, 0);
  clock.advance(5000);
  assert.deepEqual(ran, [1, 3]);
  assert.equal(deltas.length, 23 + 10);
});

test("in a running game: Update with elapsed time, delayed seconds and frames, and silence after teardown", async () => {
  const room = new FakeRoom({ seed: 81 });
  const g = probeGame();
  const a = enter(room, [g]);
  await untilStarted(room, [a], "probe");
  const p = probe(a);
  const instance = inst(a, "probe");

  const updates = p.updates;
  const elapsed = p.elapsed;
  const t0 = p.Time.time;
  p.SendCustomEventDelayedSeconds("Later", 1.5);
  p.SendCustomEventDelayedFrames("Frames", 4);
  const frame = p.Time.frameCount;
  await room.run(1000);
  assert.equal(p.updates - updates, 20);
  // Upstream code counts timers down by Time.deltaTime in Update: the sum is the time that passed.
  assert.ok(Math.abs(p.elapsed - elapsed - 1) < 1e-6);
  assert.ok(Math.abs(p.Time.time - t0 - 1) < 0.051);
  assert.deepEqual(p.delayed, [`Frames@${frame + 4}`]);
  await room.run(1000);
  assert.equal(p.delayed.length, 2);
  assert.ok(p.delayed[1]!.startsWith("Later@"));
  assert.ok(Math.abs(Number(p.delayed[1]!.slice(6)) - (t0 + 1.5)) < 0.011);

  // The element goes: nothing of the instance runs again, not even what was already scheduled.
  p.SendCustomEventDelayedSeconds("Later", 0.5);
  const before = p.updates;
  a.removeSnippet(a.env.doc.querySelectorAll("bs-snippet")[0] as never);
  await room.run(3000);
  assert.equal(instance.core.disposed, true);
  assert.equal(p.updates, before);
  assert.equal(p.delayed.length, 2);
  assert.equal(instance.scheduler.pending, 0);
});

test("the first Update runs as the instance starts, not one tick later (Unity: in Start's frame)", async () => {
  const room = new FakeRoom({ seed: 141 });
  const g = probeGame("first");
  const a = enter(room, [g]);
  let updatesAtStart = -1;
  const ok = await room.runUntil(() => {
    if (a.hasInstance("first") && a.instance("first").started && updatesAtStart < 0) updatesAtStart = probe(a, "first").updates;
    return updatesAtStart >= 0;
  }, 30000, 1);
  assert.ok(ok);
  assert.ok(updatesAtStart >= 1, `Update had run ${updatesAtStart} times when started became true`);
});
