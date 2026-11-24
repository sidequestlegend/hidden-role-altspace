// Rung 1, hidden roles: a client logging everything the room carries must not learn anyone's role before it is
// revealed. Checked on what the room actually stored and delivered, not on what the game meant to send:
//
//   - contents: no public leaf names a role until the end (or the lock-out of that one player); the sealed leaves
//     open only for the player they are addressed to;
//   - sizes: every beat and every sealed entry has the same ciphertext length, whoever wrote it and whatever they did;
//   - timing: every rostered player writes a beat every 250 ms for the whole match, acting or not, and the referee
//     rewrites the sealed leaf on the same fixed step;
//   - a whole run with the hidden role dealt to someone else produces the same write schedule.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector2 } from "../portkit/src/index.ts";
import { BsPlatform } from "../portkit/src/platform/bs.ts";
import { MatchState, Role } from "../src/GameTypes.ts";
import { STATION } from "../src/ShipMap.ts";
import { dealer, hud, match, newWorld, referee, runCrowd, SLUG, startMatch } from "./helpers.ts";

interface Write {
  t: number;
  who: string;
  scope: "space" | "user";
  path: string;
  value: unknown;
}

/**
 * Records every write a page sends, at the moment it sends it (the room's arrival times add its own latency jitter,
 * the same for everyone), with the writer's user id.
 */
function tapSent(): { log: Write[]; undo: () => void } {
  const log: Write[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = BsPlatform.prototype as any;
  const stateSet = proto.stateSet;
  const userSet = proto.userSet;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.stateSet = function (this: any, path: string, value: string) {
    log.push({ t: this.clock.now(), who: this.local().uid, scope: "space", path, value });
    return stateSet.call(this, path, value);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.userSet = function (this: any, path: string, value: string | null) {
    log.push({ t: this.clock.now(), who: this.local().uid, scope: "user", path, value });
    return userSet.call(this, path, value);
  };
  return { log, undo: () => ((proto.stateSet = stateSet), (proto.userSet = userSet)) };
}

/** Records every write the room receives, in order, with the writer's user id. */
function tap(world: ReturnType<typeof newWorld>): Write[] {
  const log: Write[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const room = world.room as any;
  const batch = room.serverStateBatch.bind(room);
  room.serverStateBatch = (session: { uid: string }, scope: string, ops: Array<{ op: string; path: string; value?: unknown }>, atomic: boolean, reply: unknown) => {
    for (const op of ops) if (op.op === "set") log.push({ t: room.now, who: session.uid, scope: "space", path: op.path, value: op.value });
    return batch(session, scope, ops, atomic, reply);
  };
  const user = room.serverUserSet.bind(room);
  room.serverUserSet = (session: { uid: string }, path: string, value: unknown, reply: unknown) => {
    log.push({ t: room.now, who: session.uid, scope: "user", path, value });
    return user(session, path, value, reply);
  };
  return log;
}

const P = `pk1.${SLUG}.0.`;

function parse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** The public match record inside a `v.match` leaf. */
function publicMatch(w: Write): Record<string, unknown> | null {
  if (w.scope !== "space" || w.path !== `${P}v.match`) return null;
  const leaf = parse(w.value) as { d?: { m?: Record<string, unknown> } };
  return leaf?.d?.m ?? null;
}

/** The sealed beat inside a player's `p0` leaf, or null. */
function beatBox(w: Write): { c: string; i: string } | null {
  if (w.scope !== "user" || !w.path.endsWith(".p0")) return null;
  const leaf = parse(w.value) as { b?: Record<string, [number, { b?: string }]> };
  const box = leaf?.b?.link?.[1]?.b;
  return box ? (JSON.parse(box) as { c: string; i: string }) : null;
}

/** The sealed entries inside the dealer's leaf, or null. */
function dealerBoxes(w: Write): Array<{ c: string } | null> | null {
  if (w.scope !== "space" || w.path !== `${P}v.dealer`) return null;
  const leaf = parse(w.value) as { d?: { box?: string } };
  if (!leaf?.d?.box) return null;
  const box = JSON.parse(leaf.d.box) as { s: string[] };
  return box.s.map((e) => (e ? (JSON.parse(e) as { c: string }) : null));
}

async function activeMatch(seed: number, saboteur: string) {
  const world = newWorld(seed);
  const log = tap(world);
  const t = await startMatch(world, 5, { forced: [saboteur] });
  return { world, log, t };
}

test("nothing public names a role before it is revealed; each sealed entry opens only for its own player", async () => {
  const { world, log, t } = await activeMatch(43, "0-u2");
  const [a, sab, ...rest] = t.drivers;
  // The saboteur is busy: a hatch trip, a fault, cover jobs and an elimination; the technicians work.
  sab!.go(STATION.Hatches[6]!.Position, 0.3).press("V").wait(1).go(STATION.PanelFor(1)!.Position, 0.5).press("F");
  for (const d of [a!, ...rest]) d.auto = "jobs";
  await runCrowd(world, t.drivers, () => sab!.idle, 120000);
  sab!.auto = "hunt";
  sab!.huntTarget = a!;
  await runCrowd(world, t.drivers, () => !a!.alive, 120000);
  sab!.auto = "jobs";
  await runCrowd(world, t.drivers, () => false, 10000);
  assert.equal(match(world, t.people[2]!).m.st, MatchState.Playing, "still playing: nothing has been revealed");

  const pubs = log.map(publicMatch).filter((m): m is Record<string, unknown> => m !== null);
  assert.ok(pubs.length > 10);
  for (const m of pubs) {
    assert.deepEqual(m.ro, [], "no roles in the public record before the end");
    assert.equal((m.an as number[])[2], 0, "no role in an announcement before a lock-out");
    // The record has exactly the documented fields: nothing else that could carry a role.
    assert.deepEqual(Object.keys(m).sort(), ["al", "an", "bd", "bp", "by", "cd", "ci", "ct", "d", "dl", "du", "er", "fe", "fk", "gn", "last", "mb", "me", "mr", "nt", "ntAt", "nw", "r", "ring", "ro", "rp", "sd", "sl", "sp", "st", "t0", "vo", "w", "wi", "ws"]);
  }
  // Every value anybody wrote, read as text: no plain role word, and no plaintext secret field.
  for (const w of log) {
    const text = typeof w.value === "string" ? w.value : JSON.stringify(w.value);
    assert.doesNotMatch(text, /[Ss]aboteur|[Tt]echnician/, `${w.path} names a role`);
  }
  // Each client opens its own entry and no other.
  const box = JSON.parse(dealer(world, t.people[0]!).box) as { s: string[] };
  for (let i = 0; i < t.people.length; i++) {
    const secrets = world.instance(t.people[i]!).behaviour(`hud`).Secrets;
    for (let j = 0; j < box.s.length; j++) {
      if (!box.s[j]) continue;
      if (i === t.drivers.findIndex((d) => d.slot === j)) {
        const plain = await secrets.open<string>(box.s[j]!);
        assert.match(plain, /"r":[12]/);
      } else {
        await assert.rejects(secrets.open(box.s[j]!), `client ${i} opened entry ${j}`);
      }
    }
  }
  // And beats open only for the referee.
  const ref = referee(world)!;
  const someone = t.people.find((c) => c !== ref)!;
  const theirBeat = log.filter((w) => w.who === "0-u2" && beatBox(w)).at(-1)!;
  const leaf = parse(theirBeat.value) as { b: { link: [number, { b: string }] } };
  await assert.rejects(world.instance(someone).behaviour("hud").Secrets.open(leaf.b.link[1].b));
  assert.match(await world.instance(ref).behaviour("hud").Secrets.open<string>(leaf.b.link[1].b), /^\{"m":/);
});

test("sizes and timing: every beat and every sealed entry is the same size, on the same fixed schedule, acting or not", async () => {
  const sent = tapSent();
  const { world, t } = await activeMatch(47, "0-u3");
  const log = sent.log;
  const [a, , sab, ...rest] = t.drivers;
  sab!.auto = "hunt";
  sab!.huntTarget = a!;
  for (const d of rest) d.auto = "jobs";
  const startedAt = world.room.now;
  await runCrowd(world, t.drivers, () => !a!.alive, 120000);
  sab!.go(STATION.PanelFor(3)!.Position, 0.5).wait(2).press("F");
  await runCrowd(world, t.drivers, () => world.room.now - startedAt > 70000, 120000);
  assert.equal(match(world, t.people[1]!).m.st, MatchState.Playing);

  const inMatch = log.filter((w) => w.t > startedAt + 2000 && w.t < world.room.now - 1000);
  // Beats: ciphertext length one constant for everyone; intervals per player exactly the beat period.
  const lengths = new Set<number>();
  const byWho = new Map<string, number[]>();
  for (const w of inMatch) {
    const box = beatBox(w);
    if (!box) continue;
    lengths.add(box.c.length);
    lengths.add(-box.i.length);
    if (!byWho.has(w.who)) byWho.set(w.who, []);
    byWho.get(w.who)!.push(w.t);
  }
  assert.equal(lengths.size, 2, `one ciphertext and one nonce length for every beat: ${[...lengths]}`);
  assert.deepEqual([...byWho.keys()].sort(), ["0-u1", "0-u2", "0-u3", "0-u4", "0-u5"], "the downed player keeps beating too");
  for (const [who, times] of byWho) {
    const gaps = new Set(times.slice(1).map((t, i) => Math.round(t - times[i]!)));
    assert.deepEqual([...gaps], [250], `${who} beats every 250 ms, whatever they do (gaps ${[...gaps]})`);
  }
  // The sealed leaf: rewritten by the referee on every 250 ms step, every entry the same size.
  const deals = inMatch.filter((w) => dealerBoxes(w));
  const dealTimes = deals.map((w) => w.t);
  const dealGaps = new Set(dealTimes.slice(1).map((t, i) => Math.round(t - dealTimes[i]!)));
  assert.deepEqual([...dealGaps], [250], `the sealed leaf is rewritten every step (gaps ${[...dealGaps]})`);
  const entryLengths = new Set(deals.flatMap((w) => dealerBoxes(w)!.map((e) => e?.c.length ?? -1)));
  assert.deepEqual([...entryLengths], [entryLengths.values().next().value], "every sealed entry has one length");
  // The public record is written only on the referee's step, never in between.
  const ref = referee(world)!;
  const refUid = world.instance(ref).networking.LocalPlayer.uid;
  const pubTimes = inMatch.filter((w) => publicMatch(w) && w.who === refUid).map((w) => w.t);
  const phase = (x: number) => Math.round(x - dealTimes[0]!) % 250;
  assert.ok(pubTimes.length > 5);
  assert.ok(pubTimes.every((x) => phase(x) === 0), `public writes fall on the step: ${[...new Set(pubTimes.map(phase))]}`);
  sent.undo();
});

test("the same match with the hidden role dealt to someone else has the same write schedule", async () => {
  async function run(saboteur: string) {
    const world = newWorld(53);
    const log = tap(world);
    const t = await startMatch(world, 4, { forced: [saboteur] });
    // Identical input from everyone in both runs: a walk, a muster at the post at about 20 s, all abstain.
    t.drivers[0]!.go(new Vector2(-6, 2), 0.3).go(STATION.MeetingPoint, 0.3).wait(15).press("E");
    await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.st === MatchState.Muster, 60000);
    for (const d of t.drivers) d.c.click(SLUG, "0", "abstainButton");
    await runCrowd(world, t.drivers, () => match(world, t.people[0]!).m.st === MatchState.Playing, 40000);
    await runCrowd(world, t.drivers, () => false, 10000);
    const roles = t.drivers.map((d) => hud(world, d.c).MyRole());
    return { log, roles, end: world.room.now };
  }
  const one = await run("0-u2");
  const two = await run("0-u3");
  assert.deepEqual(one.roles, [Role.Technician, Role.Saboteur, Role.Technician, Role.Technician]);
  assert.deepEqual(two.roles, [Role.Technician, Role.Technician, Role.Saboteur, Role.Technician]);
  const shape = (log: Write[]) =>
    log.map((w) => {
      const box = beatBox(w);
      const deals = dealerBoxes(w);
      const size = box ? `beat ${box.c.length}` : deals ? `deal ${deals.map((e) => e?.c.length ?? 0).join(",")}` : "";
      return `${w.t.toFixed(3)} ${w.who} ${w.scope} ${w.path} ${size}`;
    });
  const a = shape(one.log);
  const b = shape(two.log);
  assert.equal(a.length, b.length, "the same number of writes");
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `write ${i} differs`);
  // The public record differs only in the start positions (dealt in shuffled order, random either way).
  const pubs = (log: Write[]) => log.map(publicMatch).filter((m) => m).map((m) => JSON.stringify({ ...m, sp: null, t0: null }));
  assert.deepEqual(pubs(one.log), pubs(two.log));
});
