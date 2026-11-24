// Shared set-up for the tests: a fake room, players, and the sample game on their pages.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateBindings, type Bindings } from "../src/index.ts";
import type { GameDefinition, GameInstance } from "../src/instance.ts";
import { FakeRoom, type FakeClient, type FakeRoomOptions } from "../src/platform/fake.ts";
import sample from "../sample/src/index.ts";
import type { TicTacToe } from "../sample/src/TicTacToe.ts";

export const SAMPLE_KIT = "https://kits.test/tic-tac-toe.bundle";
export const SLUG = "tic-tac-toe";

export function sampleBindings(): Bindings {
  const text = readFileSync(fileURLToPath(new URL("../sample/bindings.json", import.meta.url)), "utf8");
  return validateBindings(JSON.parse(text));
}

export interface World {
  room: FakeRoom;
  clients: FakeClient[];
}

/** A room where the sample game's kit is known, with nobody in it yet. */
export function makeRoom(options: FakeRoomOptions = {}): FakeRoom {
  const room = new FakeRoom(options);
  room.defineKit(SAMPLE_KIT, sampleBindings());
  return room;
}

/** A player arrives with the sample game on their page: one script, one element per entry of `instances`. */
export function arrive(room: FakeRoom, options: { uid?: string; name?: string; device?: string; instances?: Array<Record<string, string>>; game?: GameDefinition } = {}): FakeClient {
  const client = room.join({ uid: options.uid, name: options.name, device: options.device });
  client.load(options.game ?? sample, sampleBindings());
  for (const attributes of options.instances ?? [{}]) client.addSnippet(SLUG, { windows: SAMPLE_KIT, ...attributes });
  return client;
}

/** `count` players in one room, all started. */
export async function world(count: number, options: FakeRoomOptions = {}, instances?: Array<Record<string, string>>): Promise<World> {
  const room = makeRoom(options);
  const clients: FakeClient[] = [];
  for (let i = 0; i < count; i++) clients.push(arrive(room, { instances }));
  const keys = (instances ?? [{}]).map((attributes, index) => attributes.room ?? String(index));
  // Started, and everyone has seen everyone else arrive.
  const settled = (c: FakeClient, key: string) => started(c, key) && c.instance(SLUG, key).networking.GetPlayerCount() === count;
  const ok = await room.runUntil(() => clients.every((c) => keys.every((key) => settled(c, key))), 20000);
  if (!ok) throw new Error("the players did not all start: " + clients.map((c) => `${c.name}: ${c.logged("warn").concat(c.logged("error")).join(" | ")}`).join("; "));
  return { room, clients };
}

export function started(client: FakeClient, inst = "0", slug = SLUG): boolean {
  return client.hasInstance(slug, inst) && client.instance(slug, inst).started;
}

export function instanceOf(client: FakeClient, inst = "0", slug = SLUG): GameInstance {
  return client.instance(slug, inst);
}

export function gameOf(client: FakeClient, inst = "0"): TicTacToe {
  return client.instance(SLUG, inst).behaviour<TicTacToe>("game");
}

/** Every client's digest of the synced state of one instance. */
export function digests(clients: FakeClient[], inst = "0", slug = SLUG): string[] {
  return clients.map((c) => c.instance(slug, inst).digest());
}

export function allEqual(values: string[]): boolean {
  return values.every((v) => v === values[0]);
}

/** The player id each client has in an instance. */
export function idOf(client: FakeClient, inst = "0", slug = SLUG): number {
  return client.instance(slug, inst).networking.LocalPlayer.playerId;
}

/** Error and warning lines of every client, for "nothing went wrong" assertions. */
export function problems(clients: FakeClient[]): string[] {
  const out: string[] = [];
  for (const c of clients) for (const line of c.logged("error")) out.push(`${c.name}: ${line}`);
  for (const c of clients) for (const note of c.notes) if (note.startsWith("graph")) out.push(`${c.name}: ${note}`);
  return out;
}
