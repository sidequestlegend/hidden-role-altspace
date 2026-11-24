// A longer random run than the unit tests can afford: node test/soak.ts [first seed] [last seed]
//
// Players join, leave (often the referee), write, race for ownership, send events and commands, in an order
// drawn from the seed; then the room is given time to settle and the invariants are checked. Prints one line
// per failing seed and exits non-zero if there is one.

import { argv, exit } from "node:process";
import { FakeRoom, type FakeClient } from "../src/platform/fake.ts";
import { seededRandom } from "../src/util.ts";
import { enter, inst, probe, probeGame, running } from "./games.ts";

const first = Number(argv[2] ?? 1);
const last = Number(argv[3] ?? 200);
let failures = 0;
const totals = { joins: 0, leaves: 0, refereeClaims: 0, ownerClaims: 0, repairs: 0, reverted: 0, applied: 0, eventsReceived: 0, commandsRun: 0, rateLimited: 0 };

for (let seed = first; seed <= last; seed++) {
  const rng = seededRandom(seed * 7717);
  const slow = seed % 5 === 0;
  const room = new FakeRoom({ seed, latency: slow ? [100, 700] : [10, 200] });
  const g = probeGame();
  const alive: FakeClient[] = [];
  let counter = 0;
  let value = 0;
  let commandsSent = 0;
  const everyone: FakeClient[] = [];
  const join = () => {
    const client = enter(room, [g], { uid: `u${String(Math.floor(rng() * 90) + 10)}-${counter++}` });
    alive.push(client);
    everyone.push(client);
    totals.joins++;
  };
  join();
  for (let step = 0; step < 45; step++) {
    const roll = rng();
    const started = alive.filter((client) => running(client, "probe"));
    if (roll < 0.22 && alive.length < 7) join();
    else if (roll < 0.42 && alive.length > 1) {
      const referee = started.find((client) => inst(client, "probe").networking.IsReferee);
      const leaver = rng() < 0.5 && referee ? referee : alive[Math.floor(rng() * alive.length)]!;
      tally(leaver);
      leaver.leave();
      alive.splice(alive.indexOf(leaver), 1);
      totals.leaves++;
    } else if (roll < 0.7 && started.length) {
      probe(started[Math.floor(rng() * started.length)]!).Set(++value);
    } else if (roll < 0.8 && started.length > 1) {
      // Two at once: a race for ownership.
      const x = started[Math.floor(rng() * started.length)]!;
      const y = started[Math.floor(rng() * started.length)]!;
      probe(x).Set(++value);
      if (y !== x) probe(y).Set(++value);
    } else if (roll < 0.9 && started.length) {
      probe(started[Math.floor(rng() * started.length)]!).Broadcast(step);
    } else if (started.length) {
      probe(started[Math.floor(rng() * started.length)]!).SendCommand("Add", 1000);
      commandsSent++;
    }
    await room.run(Math.floor(rng() * (slow ? 2500 : 1200)));
  }
  await room.run(slow ? 40000 : 20000);

  for (const client of alive) tally(client);
  totals.rateLimited += room.stats.rateLimited;
  const problems: string[] = [];
  const same = (values: string[]) => values.every((v) => v === values[0]);
  for (const client of alive) if (!running(client, "probe")) problems.push(`${client.name} never started`);
  const up = alive.filter((client) => running(client, "probe"));
  if (up.filter((client) => inst(client, "probe").networking.IsReferee).length !== 1) problems.push("not exactly one referee");
  if (!same(up.map((client) => JSON.stringify(inst(client, "probe").referee.current())))) problems.push("referee views differ");
  if (!same(up.map((client) => inst(client, "probe").digest()))) problems.push(`state differs: ${up.map((client) => probe(client).value).join(",")}`);
  const owners = up.map((client) => inst(client, "probe").networking.GetOwner(probe(client))?.sid ?? "none");
  if (!same(owners)) problems.push(`owners differ: ${owners.join(",")}`);
  if (!up.some((client) => client.sid === owners[0])) problems.push("the owner is not here");
  const ids = up.map((client) => inst(client, "probe").networking.LocalPlayer.playerId);
  if (new Set(ids).size !== ids.length) problems.push(`player ids clash: ${ids.join(",")}`);
  for (const client of up) {
    const seen = inst(client, "probe").networking.GetPlayers().map((p) => p.playerId).sort((x, y) => x - y).join(",");
    if (seen !== [...ids].sort((x, y) => x - y).join(",")) problems.push(`${client.name} sees players ${seen}, not ${ids.join(",")}`);
    if (client.logged("error").length) problems.push(`${client.name} logged: ${client.logged("error")[0]}`);
  }
  if (problems.length) {
    failures++;
    console.log(`seed ${seed}: ${problems.join("; ")}`);
  }
  void commandsSent;
  void everyone;
}

function tally(client: FakeClient): void {
  if (!running(client, "probe")) return;
  const i = inst(client, "probe");
  totals.refereeClaims += i.referee.claims;
  totals.ownerClaims += i.sync.stats.claims;
  totals.repairs += i.sync.stats.repairs;
  totals.reverted += i.sync.stats.reverted;
  totals.applied += i.sync.stats.applied;
  totals.eventsReceived += i.events.received;
  totals.commandsRun += i.commands.run;
}
console.log(JSON.stringify(totals));
console.log(`${last - first + 1 - failures} of ${last - first + 1} seeds held every invariant`);
if (failures) exit(1);
