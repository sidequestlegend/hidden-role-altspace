// What belongs to one player, kept in that player's own user state (which only they can write and everybody
// can read), under the instance prefix:
//
//   d          PlayerData: {r: 1, d: {<key>: value}}. Written once the saved copy has been loaded (`r`), so
//              others can tell "restored" from "not there yet". Also saved on the device (localStorage).
//   p0 .. p3   Per-player behaviours (VRChat: PlayerObjects): {b: {<behaviour id>: [n, fields]}}. A behaviour is
//              only listed once it has been serialised, so idle ones cost nothing; the ids are spread over at
//              most four leaves so that changing one does not resend them all.
//
// With the announcement leaf `k` that is at most six user-state leaves per instance per player.

import type { Behaviour } from "./behaviour.ts";
import type { Core } from "./core.ts";
import { assignFields, readFields } from "./fields.ts";
import type { Persistence } from "./persistence.ts";
import type { Player } from "./players.ts";
import { asciiJson, canonicalJson, isRecord, jsonLeafBytes, safeParse } from "./util.ts";
import { decodeValue, encodeValue } from "./values.ts";

export const MAX_PLAYER_LEAVES = 4;
/** Behaviours per `p` leaf before another leaf is used. */
const PER_LEAF = 24;

export interface PlayerDataView {
  /** Sets one of the local player's values. Everyone present sees it; it is saved on this device. */
  Set(key: string, value: unknown): void;
  Delete(key: string): void;
  /** Reads a value of any present player from the local mirror. */
  Get<T>(player: Player, key: string, fallback: T): T;
  Has(player: Player, key: string): boolean;
  Keys(player: Player): string[];
  /** True once that player's saved data has been loaded and published. */
  IsRestored(player: Player): boolean;
  SetString(key: string, value: string): void;
  SetInt(key: string, value: number): void;
  SetFloat(key: string, value: number): void;
  SetBool(key: string, value: boolean): void;
  GetString(player: Player, key: string): string;
  GetInt(player: Player, key: string): number;
  GetFloat(player: Player, key: string): number;
  GetBool(player: Player, key: string): boolean;
}

export interface PerUserHooks {
  restored(player: Player): void;
  dataUpdated(player: Player, keys: string[]): void;
  deserialized(behaviour: Behaviour): void;
  refused(kind: "playerData" | "playerObject", code: string, key: string, behaviour: Behaviour | null): void;
}

interface RemoteData {
  data: Record<string, unknown>;
  restored: boolean;
  announced: boolean;
}

interface Owned {
  id: string;
  behaviour: Behaviour;
  fields: readonly string[];
  callbacks: Readonly<Record<string, string>> | undefined;
  persistent: boolean;
  bucket: number;
  /** Sequence number of the value held: 0 until the behaviour has been serialised or received once. */
  n: number;
}

export class PerUser implements PlayerDataView {
  private readonly core: Core;
  private readonly storage: Persistence;
  private readonly hooks: PerUserHooks;
  private readonly remote = new Map<string, RemoteData>();
  private readonly delivered = new Map<string, Player>();
  private local: Record<string, unknown> = {};
  private localLoaded = false;
  private localDirty = false;
  private readonly changedKeys = new Set<string>();
  /** sid -> behaviour id -> the per-player behaviour */
  private readonly owned = new Map<string, Map<string, Owned>>();
  private readonly dirtyBuckets = new Set<number>();
  private readonly lastWrite = new Map<string, number>();
  private typeIds: string[] = [];
  /** PlayerData is published only when the game uses it. */
  dataEnabled = false;
  started = false;

  constructor(core: Core, storage: Persistence, hooks: PerUserHooks) {
    this.core = core;
    this.storage = storage;
    this.hooks = hooks;
  }

  private path(leaf: string): string {
    return `${this.core.prefix}.${leaf}`;
  }

  /** Declares the per-player behaviour ids of this game, in bindings order (it fixes which leaf each uses). */
  declareTypes(ids: string[]): void {
    this.typeIds = ids.slice();
  }

  private bucketOf(id: string): number {
    const index = Math.max(0, this.typeIds.indexOf(id));
    const leaves = Math.min(MAX_PLAYER_LEAVES, Math.max(1, Math.ceil(this.typeIds.length / PER_LEAF)));
    return Math.floor((index * leaves) / Math.max(1, this.typeIds.length));
  }

  listen(): void {
    const dot = this.core.prefix + ".";
    this.core.own(
      this.core.platform.onUser(dot, (sid, path) => {
        if (this.core.disposed || sid === this.core.me.sid) return;
        const leaf = path.slice(dot.length);
        if (leaf === "d") this.readRemoteData(sid);
        else if (/^p[0-3]$/.test(leaf)) this.readRemoteBucket(sid, Number(leaf.slice(1)));
      }),
    );
  }

  // ---- PlayerData ---------------------------------------------------------------------------------------------

  /** Loads the local player's saved values and publishes them. Called once behaviours have started. */
  restoreLocal(): void {
    if (this.localLoaded) return;
    this.localLoaded = true;
    const saved = this.storage.get<unknown>("playerdata", null);
    this.local = isRecord(saved) ? (encodeValue(saved) as Record<string, unknown>) : {};
    if (this.dataEnabled) this.localDirty = true;
  }

  enableData(): void {
    if (this.dataEnabled) return;
    this.dataEnabled = true;
    if (this.localLoaded) this.localDirty = true;
  }

  Set(key: string, value: unknown): void {
    const encoded = encodeValue(value);
    if (canonicalJson(this.local[key] ?? null) === canonicalJson(encoded) && key in this.local) return;
    this.local[key] = encoded;
    this.changedKeys.add(key);
    this.localDirty = true;
    this.enableData();
  }

  Delete(key: string): void {
    if (!(key in this.local)) return;
    delete this.local[key];
    this.changedKeys.add(key);
    this.localDirty = true;
  }

  private bag(player: Player): Record<string, unknown> | null {
    if (player.isLocal) return this.local;
    return this.remote.get(player.sid)?.data ?? null;
  }

  Get<T>(player: Player, key: string, fallback: T): T {
    const bag = this.bag(player);
    return bag && key in bag ? (decodeValue(bag[key]) as T) : fallback;
  }
  Has(player: Player, key: string): boolean {
    const bag = this.bag(player);
    return !!bag && key in bag;
  }
  Keys(player: Player): string[] {
    const bag = this.bag(player);
    return bag ? Object.keys(bag) : [];
  }
  IsRestored(player: Player): boolean {
    return player.isLocal ? this.localLoaded : !!this.remote.get(player.sid)?.restored;
  }
  SetString(key: string, value: string): void { this.Set(key, String(value)); }
  SetInt(key: string, value: number): void { this.Set(key, Math.trunc(value)); }
  SetFloat(key: string, value: number): void { this.Set(key, value); }
  SetBool(key: string, value: boolean): void { this.Set(key, !!value); }
  GetString(player: Player, key: string): string { return String(this.Get<unknown>(player, key, "")); }
  GetInt(player: Player, key: string): number { return Math.trunc(Number(this.Get<unknown>(player, key, 0)) || 0); }
  GetFloat(player: Player, key: string): number { return Number(this.Get<unknown>(player, key, 0)) || 0; }
  GetBool(player: Player, key: string): boolean { return this.Get<unknown>(player, key, false) === true; }

  private readRemoteData(sid: string): void {
    const raw = safeParse(this.core.platform.userGet(sid, this.path("d")));
    let entry = this.remote.get(sid);
    if (!entry) this.remote.set(sid, (entry = { data: {}, restored: false, announced: false }));
    const before = entry.data;
    const now = isRecord(raw) && isRecord(raw.d) ? raw.d : {};
    entry.data = now;
    entry.restored = isRecord(raw) && raw.r === 1;
    const player = this.delivered.get(sid);
    if (!player || !this.started) return;
    if (entry.restored && !entry.announced) {
      // The order is fixed (README): OnPlayerRestored first, then OnPlayerDataUpdated with every key the player
      // has, so code that only listens for updates sees a returning player's saved values too.
      entry.announced = true;
      this.hooks.restored(player);
      const all = Object.keys(now).sort();
      if (all.length) this.hooks.dataUpdated(player, all);
      return;
    }
    const keys: string[] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
      if (canonicalJson(before[key] ?? null) !== canonicalJson(now[key] ?? null) || key in before !== key in now) keys.push(key);
    }
    if (keys.length) this.hooks.dataUpdated(player, keys.sort());
  }

  // ---- per-player behaviours ----------------------------------------------------------------------------------

  /** Registers a per-player behaviour that has just been made for `player`. Returns true if it already has data. */
  adopt(
    player: Player,
    id: string,
    behaviour: Behaviour,
    fields: readonly string[],
    persistent: boolean,
    callbacks?: Readonly<Record<string, string>>,
  ): boolean {
    let mine = this.owned.get(player.sid);
    if (!mine) this.owned.set(player.sid, (mine = new Map()));
    const entry: Owned = { id, behaviour, fields, callbacks, persistent, bucket: this.bucketOf(id), n: 0 };
    mine.set(id, entry);
    if (player.isLocal) {
      if (!persistent) return false;
      const saved = this.storage.get<unknown>(`po.${id}`, null);
      if (!isRecord(saved)) return false;
      this.core.guard(`${id} field change callback`, () => assignFields(behaviour, fields, encodeValue(saved), callbacks));
      entry.n = 1;
      this.dirtyBuckets.add(entry.bucket);
      return true;
    }
    const stored = this.remoteBucket(player.sid, entry.bucket)[id];
    if (!stored) return false;
    this.core.guard(`${id} field change callback`, () => assignFields(behaviour, fields, stored[1], callbacks));
    entry.n = stored[0];
    return true;
  }

  behaviour(sid: string, id: string): Behaviour | null {
    return this.owned.get(sid)?.get(id)?.behaviour ?? null;
  }

  behavioursOf(sid: string): Behaviour[] {
    return [...(this.owned.get(sid)?.values() ?? [])].map((o) => o.behaviour);
  }

  /** The local player asked to send one of their per-player behaviours. */
  requestSerialization(behaviour: Behaviour): void {
    const mine = this.owned.get(this.core.me.sid);
    if (!mine) return;
    for (const entry of mine.values()) {
      if (entry.behaviour !== behaviour) continue;
      entry.n++;
      this.dirtyBuckets.add(entry.bucket);
      return;
    }
  }

  private remoteBucket(sid: string, bucket: number): Record<string, [number, unknown]> {
    const raw = safeParse(this.core.platform.userGet(sid, this.path(`p${bucket}`)));
    const out: Record<string, [number, unknown]> = {};
    if (!isRecord(raw) || !isRecord(raw.b)) return out;
    for (const id of Object.keys(raw.b)) {
      const entry = raw.b[id];
      if (Array.isArray(entry) && typeof entry[0] === "number") out[id] = [entry[0], entry[1]];
    }
    return out;
  }

  private readRemoteBucket(sid: string, bucket: number): void {
    const theirs = this.owned.get(sid);
    if (!theirs) return; // not made yet: `adopt` reads the mirror when they are
    const stored = this.remoteBucket(sid, bucket);
    for (const entry of theirs.values()) {
      const value = stored[entry.id];
      if (!value || value[0] === entry.n) continue;
      entry.n = value[0];
      this.core.guard(`${entry.id} field change callback`, () => assignFields(entry.behaviour, entry.fields, value[1], entry.callbacks));
      if (this.started) this.hooks.deserialized(entry.behaviour);
    }
  }

  // ---- players coming and going -------------------------------------------------------------------------------

  /** Called after OnPlayerJoined has been delivered for `player`. */
  playerDelivered(player: Player): void {
    this.delivered.set(player.sid, player);
    if (player.isLocal) {
      if (this.dataEnabled || this.hasPersistentLocal()) {
        this.hooks.restored(player);
        const all = Object.keys(this.local).sort();
        if (this.dataEnabled && all.length) this.hooks.dataUpdated(player, all);
      }
      return;
    }
    this.readRemoteData(player.sid);
  }

  private hasPersistentLocal(): boolean {
    for (const entry of this.owned.get(this.core.me.sid)?.values() ?? []) if (entry.persistent) return true;
    return false;
  }

  /** Drops everything kept for a player who left. Returns their per-player behaviours, for OnDestroy. */
  playerGone(sid: string): Behaviour[] {
    const gone = this.behavioursOf(sid);
    this.owned.delete(sid);
    this.remote.delete(sid);
    this.delivered.delete(sid);
    return gone;
  }

  // ---- writing ------------------------------------------------------------------------------------------------

  /** Writes what changed, at most a few times a second per leaf. Called once per tick. */
  flush(): void {
    if (this.core.disposed || !this.started) return;
    const now = this.core.platform.clock.now();
    const due = (leaf: string) => now - (this.lastWrite.get(leaf) ?? -Infinity) >= this.core.options.continuousIntervalMs;
    const limit = this.core.platform.limits.maxLeafBytes - 64;

    for (const bucket of [...this.dirtyBuckets]) {
      const leaf = `p${bucket}`;
      if (!due(leaf)) continue;
      this.dirtyBuckets.delete(bucket);
      const b: Record<string, [number, unknown]> = {};
      const mine = [...(this.owned.get(this.core.me.sid)?.values() ?? [])].filter((o) => o.bucket === bucket && o.n > 0);
      for (const entry of mine) b[entry.id] = [entry.n, readFields(entry.behaviour, entry.fields)];
      const text = asciiJson({ b });
      if (jsonLeafBytes(text) > limit) {
        this.hooks.refused("playerObject", "value_too_large", this.path(leaf), mine[0]?.behaviour ?? null);
        continue;
      }
      this.lastWrite.set(leaf, now);
      this.core.platform.userSet(this.path(leaf), text);
      for (const entry of mine) if (entry.persistent) this.storage.set(`po.${entry.id}`, decodeValue(b[entry.id]![1]));
    }

    if (this.localDirty && this.localLoaded && this.dataEnabled && due("d")) {
      this.localDirty = false;
      const keys = [...this.changedKeys].sort();
      this.changedKeys.clear();
      const text = asciiJson({ r: 1, d: this.local });
      if (jsonLeafBytes(text) > limit) {
        this.hooks.refused("playerData", "value_too_large", this.path("d"), null);
      } else {
        this.lastWrite.set("d", now);
        this.core.platform.userSet(this.path("d"), text);
        this.storage.set("playerdata", decodeValue(this.local));
      }
      const me = this.delivered.get(this.core.me.sid);
      if (me && keys.length) this.hooks.dataUpdated(me, keys);
    }
  }

  /** Removes the local player's leaves, when the instance stops while they stay in the room. */
  retire(): void {
    const { platform } = this.core;
    if (this.dataEnabled) platform.userSet(this.path("d"), null);
    const leaves = new Set<number>();
    for (const entry of this.owned.get(this.core.me.sid)?.values() ?? []) if (entry.n > 0) leaves.add(entry.bucket);
    for (const bucket of leaves) platform.userSet(this.path(`p${bucket}`), null);
  }
}
