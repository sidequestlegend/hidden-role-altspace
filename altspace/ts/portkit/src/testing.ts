// For a game's own tests: players in a fake room with the game on their pages, in a few lines.
//
//   const world = new TestWorld(game, bindings);
//   const [ann, bob] = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
//   await world.settle();
//   world.behaviour<Board>(ann, "b1").Reset();
//   await world.run(1500);
//   assert.equal(world.behaviour<Board>(bob, "b1").turn, 0);
//
// Nothing here is part of a built script: it imports the fake room, which needs Node.

import { validateBindings, type Bindings } from "./bindings.ts";
import type { Behaviour } from "./behaviour.ts";
import type { GameDefinition, GameInstance } from "./instance.ts";
import { FakeRoom, type FakeClient, type FakeRoomOptions } from "./platform/fake.ts";

export interface JoinOptions {
  uid?: string;
  name?: string;
  /** Whose localStorage: the same device on a second visit finds what the first saved. */
  device?: string;
  /** One element per entry, with these attributes (for example `{ room: "north" }`). Default: one plain element. */
  elements?: Array<Record<string, string>>;
  /** Play mode on your own: no room at all. */
  solo?: boolean;
}

export class TestWorld {
  readonly room: FakeRoom;
  readonly game: GameDefinition;
  readonly bindings: Bindings;
  /** The address the fake room serves the game's kit from. */
  readonly kit: string;
  readonly clients: FakeClient[] = [];

  constructor(game: GameDefinition, bindings: unknown, options: FakeRoomOptions = {}) {
    this.game = game;
    this.bindings = validateBindings(bindings);
    this.room = new FakeRoom(options);
    this.kit = `https://kits.test/${game.slug}.bundle`;
    this.room.defineKit(this.kit, this.bindings);
  }

  /** A player opens the world with the game's script and elements on the page. */
  join(options: JoinOptions = {}): FakeClient {
    const client = this.room.join({ uid: options.uid, name: options.name, device: options.device, solo: options.solo });
    client.load(this.game, this.bindings);
    for (const attributes of options.elements ?? [{}]) client.addSnippet(this.game.slug, { windows: this.kit, ...attributes });
    this.clients.push(client);
    return client;
  }

  /** A player leaves the world. */
  leave(client: FakeClient): void {
    client.leave();
    const at = this.clients.indexOf(client);
    if (at >= 0) this.clients.splice(at, 1);
  }

  /** Advances virtual time. */
  run(ms: number): Promise<void> {
    return this.room.run(ms);
  }

  started(client: FakeClient, inst = "0"): boolean {
    return client.hasInstance(this.game.slug, inst) && client.instance(this.game.slug, inst).started;
  }

  /** Runs until every player here has started the instance and sees every other player in it. */
  async settle(inst = "0", maxMs = 30000): Promise<void> {
    const everyone = this.clients.slice();
    const count = everyone.filter((c) => !c.solo).length || 1;
    const done = () => everyone.every((c) => this.started(c, inst) && (c.solo || this.instance(c, inst).networking.GetPlayerCount() >= count));
    if (await this.room.runUntil(done, maxMs)) return;
    const why = everyone.map((c) => `${c.name}: started=${this.started(c, inst)} ${c.logged("warn").concat(c.logged("error")).slice(-3).join(" | ")}`);
    throw new Error(`not everyone started ${this.game.slug}:${inst}\n  ${why.join("\n  ")}`);
  }

  instance(client: FakeClient, inst = "0"): GameInstance {
    return client.instance(this.game.slug, inst);
  }

  /** An ordinary behaviour of one player's copy of the game, by its bindings id. */
  behaviour<T extends Behaviour = Behaviour>(client: FakeClient, id: string, inst = "0"): T {
    return this.instance(client, inst).behaviour<T>(id);
  }

  /** Each player's digest of the game's synced state: all equal when they agree. */
  digests(inst = "0"): string[] {
    return this.clients.filter((c) => this.started(c, inst)).map((c) => this.instance(c, inst).digest());
  }

  agree(inst = "0"): boolean {
    const all = this.digests(inst);
    return all.every((d) => d === all[0]);
  }

  /** Error lines any player's page logged, and payloads a kit graph could not read. */
  problems(): string[] {
    const out: string[] = [];
    for (const client of this.clients) {
      for (const line of client.logged("error")) out.push(`${client.name}: ${line}`);
      for (const note of client.notes) if (note.startsWith("graph")) out.push(`${client.name}: ${note}`);
    }
    return out;
  }
}

export { RulesBench } from "./bench.ts";
export type { BenchOptions } from "./bench.ts";
