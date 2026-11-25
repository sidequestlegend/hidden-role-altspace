// A fake room for Node tests: N players' pages in one room, on virtual time.
//
// It stands in for three things at once, and keeps them apart:
//   - the room server      limits, rate buckets, ordering and echo rules of RELAY.md (PacketParty's rules)
//   - the app              the client that sits between page and server: it queues and merges string writes,
//                          sends one batch every 0.2 s and backs off (SpaceStateService.cs in the SDK)
//   - the page API         a `BS` namespace, a scene, a document and a window as injection.js presents them
// A client's Platform is the real adapter (BsPlatform) running on that fake page, so the adapter is exercised by
// every test.
//
// Where the sources do not say how the real thing behaves, this file guesses; each guess is marked "GUESS".

import { webcrypto } from "node:crypto";
import type { Bindings } from "../bindings.ts";
import { boot, type GameRuntime } from "../boot.ts";
import { parseRelayPayload, type RelayRecord } from "../host.ts";
import type { GameDefinition, GameInstance } from "../instance.ts";
import { holderName, relayKey } from "../names.ts";
import type { InputEvent, LocalPoses } from "../types.ts";
import { seededRandom, utf8Length } from "../util.ts";
import { KEY_CODES } from "./keycodes.ts";
import { Quaternion, Vector3 } from "../values.ts";
import { BsPlatform, type BsOptions, type PageEnv } from "./bs.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A game's own relay op in the fake graph: the record (`target` as sent, `args` still percent-coded) and, so that the
 * handler can answer the right instance with `client.graphEvent(slug, inst, ...)`, the instance it was sent for (`key`
 * is `<slug>:<inst>`; found by treasure hunt, whose handler had to guess the instance).
 */
export type RelayOpHandler = (record: { op: string; target: string; args: string[]; key: string; slug: string; inst: string }, client: FakeClient) => void;

export interface FakeRoomOptions {
  seed?: number;
  /** One-way network latency in ms, drawn per message between these bounds. */
  latency?: [number, number];
  /** Latency of a page-to-app bridge call. */
  bridgeMs?: number;
  /** Time from page load to the room being joined. GUESS: the app joins after its 3 s "scene settled" timer. */
  joinDelayMs?: number;
  /** Time a kit's bundle takes to load. */
  kitLoadMs?: number;
  /** The world's owner (user id): may write protected state, and counts as space admin. */
  owner?: string;
  moderators?: string[];
  maxRoomKeys?: number;
  maxLeafBytes?: number;
  /** RELAY.md: an inbound message over this closes the socket (1009). 256 KiB. */
  maxMessageBytes?: number;
  /** User-state leaves the page may hold per player (the server allows 128, the app keeps 64 back). */
  maxUserKeys?: number;
  bucketRate?: number;
  bucketBurst?: number;
  /** The synced clock's value, in seconds, at room time 0. */
  clockSeconds?: number;
  /** Print every client's log lines as they happen. */
  echoLogs?: boolean;
}

interface Timer {
  at: number;
  seq: number;
  fn: () => void;
  owner: object | null;
  dead: boolean;
}

class Bucket {
  private tokens: number;
  private last: number;
  private readonly rate: number;
  private readonly burst: number;
  constructor(rate: number, burst: number, now: number) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface Session {
  sid: string;
  uid: string;
  name: string;
  role: "owner" | "moderator" | "member";
  client: FakeClient;
  connected: boolean;
  /** Shared by state and object requests. GUESS: one bucket per session (RELAY.md does not say per what). */
  bucket: Bucket;
  userBucket: Bucket;
  userState: Map<string, unknown>;
  toServerAt: number;
  toClientAt: number;
}

interface StateOp {
  op: "set" | "delete" | "protect";
  path: string;
  value?: unknown;
}

interface StateResult {
  ok: boolean;
  error?: string;
  outcomes?: Array<{ ok: boolean; error?: string }>;
}

interface StateChange {
  path: string;
  value?: unknown;
  deleted?: boolean;
}

interface NetObject {
  owner: string | null;
  gen: number;
  pose: { p: [number, number, number]; r: [number, number, number, number] } | null;
}

const SEGMENT = /^[A-Za-z0-9_\-:@]{1,64}$/;

export interface RoomStats {
  stateBatches: number;
  /** Messages over maxMessageBytes: the relay closed the sender's socket (1009). */
  socketsClosed: number;
  /** The largest state batch message seen, in bytes. */
  largestBatch: number;
  rateLimited: number;
  oneShots: number;
  oneShotsDropped: number;
  userWrites: number;
  objectRequests: number;
  refusedWrites: number;
}

export class FakeRoom {
  readonly options: Required<Omit<FakeRoomOptions, "owner" | "moderators">> & { owner: string | null; moderators: string[] };
  /** Virtual milliseconds since the room was made. */
  now = 0;
  readonly rng: () => number;
  readonly stats: RoomStats = { stateBatches: 0, socketsClosed: 0, largestBatch: 0, rateLimited: 0, oneShots: 0, oneShotsDropped: 0, userWrites: 0, objectRequests: 0, refusedWrites: 0 };
  readonly clients: FakeClient[] = [];
  /** A game's own relay ops the fake graph answers to (`defineRelayOp`), with what each does here. */
  readonly relayOps = new Map<string, RelayOpHandler | null>();
  /** Whether kits answer the standard op pkHead (Networking.HeadOf); false stands for kits built before it. */
  headAnswers = true;
  private readonly timers: Timer[] = [];
  private seq = 0;
  private readonly sessions = new Map<string, Session>();
  private readonly state = new Map<string, unknown>();
  private readonly protectedPrefixes = new Set<string>();
  private revision = 0;
  private lastCommit = 0;
  private readonly objects = new Map<string, NetObject>();
  private readonly kits = new Map<string, { prefab: string; paths: Set<string>; refs: string[]; pathOfKey: Map<string, string>; layerOfPath: Map<string, number> }>();
  private readonly devices = new Map<string, Map<string, string>>();
  private nextSession = 1;
  /** Real asynchronous work in flight (WebCrypto), which `run` waits for between events. */
  pendingAsync = 0;

  constructor(options: FakeRoomOptions = {}) {
    this.options = {
      seed: options.seed ?? 1,
      latency: options.latency ?? [20, 60],
      bridgeMs: options.bridgeMs ?? 4,
      joinDelayMs: options.joinDelayMs ?? 400,
      kitLoadMs: options.kitLoadMs ?? 250,
      owner: options.owner ?? null,
      moderators: options.moderators ?? [],
      maxRoomKeys: options.maxRoomKeys ?? 2048,
      maxLeafBytes: options.maxLeafBytes ?? 16384,
      maxMessageBytes: options.maxMessageBytes ?? 256 * 1024,
      maxUserKeys: options.maxUserKeys ?? 64,
      bucketRate: options.bucketRate ?? 20,
      bucketBurst: options.bucketBurst ?? 40,
      clockSeconds: options.clockSeconds ?? 1_800_000_000,
      echoLogs: options.echoLogs ?? false,
    };
    this.rng = seededRandom(this.options.seed);
  }

  // ---- virtual time -------------------------------------------------------------------------------------------

  /**
   * An autoSync attachment (BS.AttachedObject) as the app networks it: user state `attachment_<BS Object Id>` (refused,
   * with the batch it rides in, unless the key is 1-64 of `A-Z a-z 0-9 _ - : @`), and each other client re-parents ITS
   * OWN object of that id (none: the attachment is not seen there). `at` null: detached. What each client reproduced is
   * `FakeClient.remoteAttached` (by the object's path there, with the wearer's uid and attachment point).
   */
  shareAttachment(from: FakeClient, id: string, at: { uid: string; point: number } | null): void {
    const key = "attachment_" + id;
    if (!id || !SEGMENT.test(key)) {
      from.notes.push(`attachment key refused: ${key}`);
      return;
    }
    for (const other of this.clients) {
      if (other === from) continue;
      this.schedule(this.latency() * 2, () => {
        const objects = Object.values(other.app.scene.objects as Record<string, FakeObject>);
        const object = objects.find((o) => o.networkId === id && !o.destroyed);
        if (!object) {
          if (at) other.notes.push(`attachment of an object this client does not have: ${id}`);
          return;
        }
        if (at) other.remoteAttached.set(object.path, at);
        else other.remoteAttached.delete(object.path);
      }, other);
    }
  }

  schedule(delayMs: number, fn: () => void, owner: object | null = null): number {
    const timer: Timer = { at: this.now + Math.max(0, delayMs), seq: ++this.seq, fn, owner, dead: false };
    let i = this.timers.length;
    while (i > 0 && (this.timers[i - 1]!.at > timer.at || (this.timers[i - 1]!.at === timer.at && this.timers[i - 1]!.seq > timer.seq))) i--;
    this.timers.splice(i, 0, timer);
    return timer.seq;
  }

  cancel(id: number): void {
    const timer = this.timers.find((t) => t.seq === id);
    if (timer) timer.dead = true;
  }

  cancelOwned(owner: object): void {
    for (const timer of this.timers) if (timer.owner === owner) timer.dead = true;
  }

  /** Lets everything that is already runnable run: promise chains, and real asynchronous work such as WebCrypto. */
  async settle(): Promise<void> {
    do {
      await new Promise<void>((resolve) => setImmediate(resolve));
    } while (this.pendingAsync > 0);
  }

  /** Advances virtual time by `ms`, running every timer and delivery that falls due, in order. */
  async run(ms: number): Promise<void> {
    const until = this.now + ms;
    await this.settle();
    for (;;) {
      const next = this.timers[0];
      if (!next || next.at > until) break;
      this.timers.shift();
      if (next.dead) continue;
      this.now = Math.max(this.now, next.at);
      next.fn();
      await this.settle();
    }
    this.now = until;
  }

  /** Runs until `done()` is true. Returns false when `maxMs` passed first. */
  async runUntil(done: () => boolean, maxMs = 30000, stepMs = 20): Promise<boolean> {
    const limit = this.now + maxMs;
    await this.settle();
    while (!done()) {
      if (this.now >= limit) return false;
      await this.run(stepMs);
    }
    return true;
  }

  latency(): number {
    const [lo, hi] = this.options.latency;
    return lo + (hi - lo) * this.rng();
  }

  clockSeconds(): number {
    return this.options.clockSeconds + this.now / 1000;
  }

  // ---- set-up -------------------------------------------------------------------------------------------------

  /** Registers what a bundle address holds: the kit prefab of these bindings. */
  /**
   * Tells every client's fake relay graph about an op of the game's own (what its kit builder adds in
   * KitBuilder.RelayOps): it is recorded in `graph(...).events` and `handler`, if any, runs, instead of the
   * "unknown op" note.
   */
  defineRelayOp(name: string, handler: RelayOpHandler | null = null): void {
    this.relayOps.set(name, handler);
  }

  defineKit(url: string, bindings: Bindings): void {
    const pathOfKey = new Map<string, string>();
    // The layer the kit builder gave each bound object: Grabbable (20) for grab, UI (5) for click and seat.
    const layerOfPath = new Map<string, number>();
    for (const key of Object.keys(bindings.objects)) {
      const o = bindings.objects[key]!;
      pathOfKey.set(key, o.path);
      layerOfPath.set(o.path, o.grab ? 20 : o.click || o.seat ? 5 : 0);
    }
    this.kits.set(url, { prefab: bindings.root ?? bindings.slug, paths: new Set(pathOfKey.values()), refs: bindings.refs.slice(), pathOfKey, layerOfPath });
  }

  kitAt(url: string) {
    return this.kits.get(url);
  }

  device(name: string): Map<string, string> {
    let store = this.devices.get(name);
    if (!store) this.devices.set(name, (store = new Map()));
    return store;
  }

  /** A new player opens the world. Their page loads, and joins the room a little later. */
  join(options: { uid?: string; name?: string; device?: string; adapter?: Partial<BsOptions>; solo?: boolean } = {}): FakeClient {
    const n = this.clients.length + 1;
    const uid = options.uid ?? `user-${String(n).padStart(2, "0")}`;
    const client = new FakeClient(this, uid, options.name ?? `Player ${n}`, options.device ?? uid, options.adapter ?? {}, options.solo === true);
    this.clients.push(client);
    return client;
  }

  roleOf(uid: string): "owner" | "moderator" | "member" {
    if (this.options.owner !== null && uid === this.options.owner) return "owner";
    return this.options.moderators.indexOf(uid) >= 0 ? "moderator" : "member";
  }

  // ---- the server ---------------------------------------------------------------------------------------------

  /** Client to server: arrives after latency, in the order the client sent. */
  toServer(session: Session, fn: () => void): void {
    session.toServerAt = Math.max(session.toServerAt, this.now + this.latency());
    this.schedule(session.toServerAt - this.now, () => {
      if (session.connected) fn();
    });
  }

  /** Server to client: arrives after latency, in the order the server sent. */
  toClient(session: Session, fn: () => void): void {
    session.toClientAt = Math.max(session.toClientAt, this.now + this.latency());
    this.schedule(session.toClientAt - this.now, () => {
      if (session.connected) fn();
    });
  }

  private connected(): Session[] {
    return [...this.sessions.values()].filter((s) => s.connected);
  }

  /** The join, all at once, as RELAY.md section 2 lists it. */
  serverJoin(client: FakeClient): Session {
    // GUESS: space state expires 24 h after its last change, and that is noticed when someone joins.
    if (this.now - this.lastCommit > 24 * 3600 * 1000 && this.connected().length === 0 && this.state.size > 0) {
      this.state.clear();
      this.protectedPrefixes.clear();
      this.revision++;
    }
    const session: Session = {
      sid: `rsess_${String(this.nextSession++).padStart(4, "0")}`,
      uid: client.uid,
      name: client.name,
      role: this.roleOf(client.uid),
      client,
      connected: true,
      bucket: new Bucket(this.options.bucketRate, this.options.bucketBurst, this.now),
      userBucket: new Bucket(this.options.bucketRate, this.options.bucketBurst, this.now),
      userState: new Map(),
      toServerAt: this.now,
      toClientAt: this.now,
    };
    const others = this.connected();
    this.sessions.set(session.sid, session);
    for (const other of others) this.toClient(other, () => other.client.app.onPeerJoined(session.sid, session.uid, session.name, session.role));
    const peers = others.map((s) => ({ sid: s.sid, uid: s.uid, name: s.name, role: s.role }));
    const publicState: Record<string, unknown> = {};
    const protectedState: Record<string, unknown> = {};
    for (const [path, value] of this.state) (this.isProtected(path) ? protectedState : publicState)[path] = value;
    const users: Record<string, Record<string, unknown>> = {};
    for (const s of this.sessions.values()) if (s.userState.size) users[s.sid] = Object.fromEntries(s.userState);
    this.toClient(session, () => client.app.onWelcome(session.sid, peers, publicState, protectedState, users));
    return session;
  }

  /** A closing socket is the only way to leave: peerLeft at once, the rest after the graces. */
  serverLeave(session: Session): void {
    if (!session.connected) return;
    session.connected = false;
    for (const other of this.connected()) this.toClient(other, () => other.client.app.onPeerLeft(session.sid));
    this.schedule(1000, () => this.reassignObjects(session));
    this.schedule(30000, () => {
      session.userState.clear();
      this.sessions.delete(session.sid);
    });
  }

  private isProtected(path: string): boolean {
    for (const prefix of this.protectedPrefixes) if (path === prefix || path.startsWith(prefix + ".")) return true;
    return false;
  }

  private validPath(path: string): boolean {
    if (typeof path !== "string" || path.length === 0 || path.length > 256) return false;
    const segments = path.split(".");
    return segments.length <= 64 && segments.every((s) => SEGMENT.test(s));
  }

  /** `app.state.batch`: one token whatever its size. The reply goes out before the broadcast it causes. */
  serverStateBatch(session: Session, scope: "public" | "protected", ops: StateOp[], atomic: boolean, reply: (result: StateResult) => void): void {
    this.stats.stateBatches++;
    const answer = (result: StateResult) => this.toClient(session, () => reply(result));
    // RELAY.md 1: an inbound message over 256 KiB closes the socket with 1009 before anything in it is read
    const bytes = utf8Length(JSON.stringify({ t: "app.state.batch", scope, atomic, ops }));
    this.stats.largestBatch = Math.max(this.stats.largestBatch, bytes);
    if (bytes > this.options.maxMessageBytes) {
      this.stats.socketsClosed++;
      return answer({ ok: false, error: "socket_closed" });
    }
    if (!session.bucket.take(this.now)) {
      this.stats.rateLimited++;
      return answer({ ok: false, error: "rate_limited" });
    }
    if (ops.length < 1 || ops.length > 128) return answer({ ok: false, error: "invalid_batch" });
    if (scope === "protected" && session.role === "member") {
      this.stats.refusedWrites += ops.length;
      return answer({ ok: false, error: "not_space_admin" });
    }
    const work = new Map(this.state);
    const workProtected = new Set(this.protectedPrefixes);
    const changes: StateChange[] = [];
    const outcomes: Array<{ ok: boolean; error?: string }> = [];
    for (const op of ops) {
      const error = this.applyOp(work, workProtected, scope, op, changes);
      outcomes.push(error ? { ok: false, error } : { ok: true });
      if (error) this.stats.refusedWrites++;
    }
    const failed = outcomes.some((o) => !o.ok);
    if (failed && atomic) return answer({ ok: false, error: "batch_failed", outcomes });
    // A batch that is not atomic keeps what worked: apply again without the failed ops.
    if (failed) {
      changes.length = 0;
      const again = new Map(this.state);
      const againProtected = new Set(this.protectedPrefixes);
      ops.forEach((op, i) => {
        if (outcomes[i]!.ok) this.applyOp(again, againProtected, scope, op, changes);
      });
      this.commit(again, againProtected, scope, changes);
    } else this.commit(work, workProtected, scope, changes);
    answer(failed ? { ok: false, error: "batch_failed", outcomes } : { ok: true, outcomes });
  }

  private applyOp(work: Map<string, unknown>, workProtected: Set<string>, scope: string, op: StateOp, changes: StateChange[]): string | null {
    if (!this.validPath(op.path)) return "invalid_path";
    const covered = (path: string) => [...workProtected].some((p) => path === p || path.startsWith(p + "."));
    const touches = (path: string) => covered(path) || [...workProtected].some((p) => p.startsWith(path + "."));
    if (op.op === "protect") {
      if (!covered(op.path)) workProtected.add(op.path);
      return null;
    }
    if (scope === "public" && touches(op.path)) return "protected_path";
    if (op.op === "delete") {
      const doomed = [...work.keys()].filter((p) => p === op.path || p.startsWith(op.path + "."));
      if (!doomed.length) return "not_found";
      for (const path of doomed) {
        work.delete(path);
        changes.push({ path, deleted: true });
      }
      return null;
    }
    // set: an object flattens into leaves and merges; arrays and {} are leaves.
    const leaves: Array<[string, unknown]> = [];
    const flatten = (path: string, value: unknown) => {
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
        for (const key of Object.keys(value)) flatten(`${path}.${key}`, (value as Record<string, unknown>)[key]);
      } else leaves.push([path, value]);
    };
    flatten(op.path, op.value === undefined ? null : op.value);
    for (const [path, value] of leaves) {
      if (!this.validPath(path)) return "invalid_path";
      if (utf8Length(JSON.stringify(value)) > this.options.maxLeafBytes) return "value_too_large";
      if (!work.has(path) && work.size >= this.options.maxRoomKeys) return "too_many_keys";
    }
    for (const [path, value] of leaves) {
      if (work.has(path) && JSON.stringify(work.get(path)) === JSON.stringify(value)) continue; // equal: a no-op
      work.set(path, value);
      changes.push({ path, value });
    }
    return null;
  }

  private commit(work: Map<string, unknown>, workProtected: Set<string>, scope: string, changes: StateChange[]): void {
    const protectionChanged = workProtected.size !== this.protectedPrefixes.size;
    if (!changes.length && !protectionChanged) return;
    this.state.clear();
    for (const [path, value] of work) this.state.set(path, value);
    this.protectedPrefixes.clear();
    for (const prefix of workProtected) this.protectedPrefixes.add(prefix);
    this.revision++;
    this.lastCommit = this.now;
    if (!changes.length) return;
    const prefixes = protectionChanged ? [...this.protectedPrefixes] : null;
    for (const s of this.connected()) this.toClient(s, () => s.client.app.onStateChanged(scope, this.revision, changes, prefixes));
  }

  serverUserSet(session: Session, path: string, value: unknown, reply: (result: StateResult) => void): void {
    this.stats.userWrites++;
    const answer = (result: StateResult) => this.toClient(session, () => reply(result));
    if (!session.userBucket.take(this.now)) {
      this.stats.rateLimited++;
      return answer({ ok: false, error: "rate_limited" });
    }
    if (!this.validPath(path)) return answer({ ok: false, error: "invalid_path" });
    const deleted = value === undefined;
    if (deleted) {
      if (!session.userState.has(path)) return answer({ ok: false, error: "not_found" });
      session.userState.delete(path);
    } else {
      if (utf8Length(JSON.stringify(value)) > this.options.maxLeafBytes) return answer({ ok: false, error: "value_too_large" });
      if (!session.userState.has(path) && session.userState.size >= this.options.maxUserKeys) return answer({ ok: false, error: "too_many_keys" });
      if (session.userState.has(path) && JSON.stringify(session.userState.get(path)) === JSON.stringify(value)) return answer({ ok: true });
      session.userState.set(path, value);
    }
    answer({ ok: true });
    for (const s of this.connected()) this.toClient(s, () => s.client.app.onUserStateChanged(session.sid, [{ path, value, deleted }]));
  }

  /** Delivered to every connected session except the sender; not stored, not acknowledged. */
  serverOneShot(session: Session, data: string): void {
    this.stats.oneShots++;
    if (utf8Length("banter\n" + data) > 4096) {
      this.stats.oneShotsDropped++;
      return;
    }
    const fromAdmin = session.role === "owner";
    for (const s of this.connected()) if (s !== session) this.toClient(s, () => s.client.app.onOneShot(session.sid, fromAdmin, data));
  }

  /** The first declarer of an id owns it. A request costs a token from the bucket state writes use. */
  serverObjectCreate(session: Session, id: string, done: (ok: boolean) => void): void {
    this.stats.objectRequests++;
    if (!session.bucket.take(this.now)) {
      this.stats.rateLimited++;
      return this.toClient(session, () => done(false));
    }
    let object = this.objects.get(id);
    if (!object) this.objects.set(id, (object = { owner: session.sid, gen: 0, pose: null }));
    else if (object.owner === null) object.owner = session.sid;
    const pose = object.pose;
    this.toClient(session, () => {
      done(true);
      if (pose) session.client.app.onObjectPose(id, pose.p, pose.r);
    });
  }

  serverObjectAcquire(session: Session, id: string): void {
    this.stats.objectRequests++;
    if (!session.bucket.take(this.now)) {
      this.stats.rateLimited++;
      return;
    }
    const object = this.objects.get(id);
    if (!object || object.owner === session.sid) return;
    object.owner = session.sid;
    object.gen++;
  }

  serverObjectOwner(id: string): string | null {
    return this.objects.get(id)?.owner ?? null;
  }

  /** The owner's pose, forwarded to everyone else; frames from anyone but the owner are dropped. */
  serverObjectPose(session: Session, id: string, p: [number, number, number], r: [number, number, number, number]): void {
    const object = this.objects.get(id);
    if (!object || object.owner !== session.sid) return;
    object.pose = { p, r };
    for (const s of this.connected()) if (s !== session) this.toClient(s, () => s.client.app.onObjectPose(id, p, r));
  }

  private reassignObjects(left: Session): void {
    if (left.connected) return;
    const live = this.connected();
    for (const object of this.objects.values()) {
      if (object.owner !== left.sid) continue;
      if (!live.length) {
        object.owner = null;
        continue;
      }
      // "The connected session that owns the fewest objects."
      const counts = new Map(live.map((s) => [s.sid, 0]));
      for (const o of this.objects.values()) if (o.owner && counts.has(o.owner)) counts.set(o.owner, counts.get(o.owner)! + 1);
      object.owner = [...counts].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
      object.gen++;
    }
  }

  // ---- inspection ---------------------------------------------------------------------------------------------

  /** The room's space state, as the server holds it. */
  stateSnapshot(): Record<string, unknown> {
    return Object.fromEntries(this.state);
  }

  stateKeys(prefix = ""): string[] {
    return [...this.state.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  /** Writes a leaf straight into the server's state, as someone outside the game would (for tests of limits). */
  stuff(path: string, value: unknown): void {
    this.state.set(path, value);
    this.lastCommit = this.now;
  }

  userStateOf(sid: string): Record<string, unknown> {
    return Object.fromEntries(this.sessions.get(sid)?.userState ?? []);
  }
}

// ---- the page -------------------------------------------------------------------------------------------------

class Emitter {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();
  On(name: string, handler: (event: any) => void): void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(handler);
  }
  Off(name: string, handler: (event: any) => void): void {
    this.listeners.get(name)?.delete(handler);
  }
  emit(name: string, detail?: unknown): void {
    for (const handler of [...(this.listeners.get(name) ?? [])]) handler({ type: name, detail });
  }
}

export interface FakeSnippet {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getAttributeNames(): string[];
  isConnected: boolean;
  ownsSingleton: string | null;
}

/** What a kit's graphs did on one client, as the relay ops asked. Targets are binding keys, or "@<path>". */
export interface GraphState {
  text: Map<string, string>;
  active: Map<string, boolean>;
  anim: Map<string, Record<string, string>>;
  color: Map<string, string[]>;
  floats: Map<string, string>;
  uiColor: Map<string, string[]>;
  /** The other value ops, by "<target>/<op>": audioPitch, audioVolume, animEnabled, uiSetToggle, uiSetSlider, scale, rbKinematic. */
  values: Map<string, string[]>;
  /** Triggers, particle bursts, clips, spawns and a game's own ops, in the order they were asked for. */
  events: Array<{ op: string; target: string; args: string[] }>;
  /** Payloads and records of the game's ops, as received (clock requests are only counted). */
  payloads: string[];
  records: RelayRecord[];
  clockRequests: number;
}

class FakeObject extends Emitter {
  readonly name: string;
  readonly path: string;
  readonly children: FakeObject[] = [];
  readonly components: any[] = [];
  hasUnity = true;
  /** Held by the local player (FakeClient.grab), until drop or ReleaseGrab. */
  held = false;
  heldSide = 1;
  destroyed = false;
  active = true;
  /** Clicks reach layers 5 and 22 only; grabs layer 20 (Grabbable) only. */
  layer = 0;
  networkId = "";
  /** Where the object really is (the host's truth). */
  truePosition = new Vector3();
  trueRotation = new Quaternion();
  /** What the page has been told: only refreshed by a watch. */
  transform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  watched = false;
  watchCallback: (() => void) | null = null;
  kit: { url: string; loaded: boolean } | null = null;
  graph: GraphState | null = null;
  /** The page's handle for the object, and the key of `scene.objects` once the page knows it. */
  readonly unityId: number;
  /** The object above this one in the scene; the page reads it as that object's id. */
  readonly above: FakeObject | null;
  private readonly app: FakeApp;

  constructor(app: FakeApp, name: string, parent: FakeObject | null) {
    super();
    this.app = app;
    this.name = name;
    this.above = parent;
    this.unityId = app.nextUnityId++;
    this.path = parent ? `${parent.path}/${name}` : name;
    if (parent) parent.children.push(this);
  }

  /** As the page API has it: the parent's id as text, "0" at the top of the scene. */
  get parent(): string {
    return this.above ? String(this.above.unityId) : "0";
  }

  /** The page gets to know the object (it carries a BS Object Id, or the script made it). */
  announce(): void {
    if (!this.destroyed) this.app.scene.objects[this.unityId] = this;
  }

  Async(): Promise<this> {
    return this.app.bridge(() => this);
  }

  SetTransform(patch: any): Promise<void> {
    return this.app.bridge(() => {
      const p = patch.position ?? patch.localPosition;
      const r = patch.rotation ?? patch.localRotation;
      if (p) this.truePosition = new Vector3(p.x, p.y, p.z);
      if (r) this.trueRotation = new Quaternion(r.x, r.y, r.z, r.w);
      if (patch.localEulerAngles) this.trueRotation = Quaternion.Euler(patch.localEulerAngles.x, patch.localEulerAngles.y, patch.localEulerAngles.z);
      this.app.objectMoved(this, false);
    });
  }

  SetActive(active: boolean): Promise<void> {
    return this.app.bridge(() => {
      this.active = active;
    });
  }

  SetLayer(layer: number): Promise<void> {
    return this.app.bridge(() => {
      this.layer = layer;
    });
  }

  SetNetworkId(id: string): Promise<void> {
    return this.app.bridge(() => {
      this.networkId = id;
    });
  }

  AddComponent(component: any): Promise<any> {
    return this.app.bridge(() => {
      component.gameObject = this;
      this.components.push(component);
      if (typeof component.attached === "function") component.attached(this);
      return component;
    });
  }

  GetComponent(type: string): any {
    return this.components.find((c) => c.componentType === type) ?? null;
  }

  /** BSScene.InlineJsObject: the child at a path gets an id and becomes known to the page. */
  AddInlineObject(path: string): Promise<FakeObject> {
    return this.app.bridge(() => {
      const parts = path.split("/");
      const root = this.children.find((c) => c.name === parts[0]);
      if (!root || !this.kit || !this.kit.loaded) throw "INLINE_OBJECT: Could not find child at path: " + path;
      const rest = parts.slice(1).join("/");
      if (rest === "") return root;
      const kit = this.app.room.kitAt(this.kit.url);
      if (!kit || !kit.paths.has(rest)) throw "INLINE_OBJECT: Could not find child at path: " + path;
      let node = root;
      for (const part of parts.slice(1)) node = node.children.find((c) => c.name === part) ?? new FakeObject(this.app, part, node);
      node.announce(); // it now carries a BS Object Id
      return node;
    });
  }

  /** BSScene.WatchJsTransform: sets the watch, pushes the current transform, then answers. */
  WatchTransform(_properties: unknown[], callback: () => void): Promise<void> {
    return this.app.bridge(() => {
      this.watched = true;
      this.watchCallback = callback;
      this.pushTransform();
    });
  }

  pushTransform(): void {
    this.transform.position = { x: this.truePosition.x, y: this.truePosition.y, z: this.truePosition.z };
    this.transform.rotation = { x: this.trueRotation.x, y: this.trueRotation.y, z: this.trueRotation.z, w: this.trueRotation.w };
    this.watchCallback?.();
  }

  /** Lets go of the object if the local player holds it: the page then hears "drop", as from the app. */
  ReleaseGrab(): Promise<boolean> {
    return this.app.bridge(() => {
      if (!this.held) return false;
      this.held = false;
      this.emit("drop", { side: this.heldSide });
      return true;
    });
  }

  Destroy(): void {
    this.destroyed = true;
    this.app.destroyObject(this);
  }
}

/** The app between one page and the server, and the page API on top of it. */
class FakeApp {
  readonly room: FakeRoom;
  readonly client: FakeClient;
  readonly scene: Emitter & Record<string, any>;
  readonly BS: any;
  readonly holders = new Map<string, FakeObject>();
  readonly netObjects = new Map<string, FakeObject>();
  nextUnityId = 1000;
  session: Session | null = null;
  private joinedAt = -Infinity;
  private readonly mirror = new Map<string, unknown>();
  private readonly knownProtected = new Set<string>();
  private revision = 0;
  private readonly pending = new Map<string, { path: string; value: string; scope: "public" | "protected"; seq: number }>();
  private order: string[] = [];
  private seq = 0;
  private inFlight = false;
  private nextSendAt = 0;
  private backoff = 0;
  private pumpTimer = 0;
  private protectedOff = false;
  /**
   * kitsLoading: kit items attached and not yet loaded on this page; kitsLoadingAtOnce: the most there ever were (the app
   * loses kit data when kit loads overlap: BsPlatform.kitTurn).
   */
  readonly stats = { batches: 0, rateLimited: 0, writesQueued: 0, relayCalls: 0, kitsLoading: 0, kitsLoadingAtOnce: 0 };

  constructor(room: FakeRoom, client: FakeClient) {
    this.room = room;
    this.client = client;
    const app = this;
    const scene = new Emitter() as Emitter & Record<string, any>;
    this.scene = scene;
    scene.users = {};
    scene.objects = {};
    scene.localUser = undefined;
    scene.spaceStateJson = { public: {}, protected: {} };
    scene.spaceState = { public: {}, protected: {} };
    scene.SetPublicSpaceProps = (props: Record<string, string>) => app.queueProps(props, "public");
    scene.SetProtectedSpaceProps = (props: Record<string, string>) => app.queueProps(props, "protected");
    scene.SpaceStateDelete = (path: string) => app.directDelete(path);
    scene.SpaceStateGetAll = () =>
      app.bridge(() => ({ revision: app.revision, public: { ...scene.spaceStateJson.public }, protected: { ...scene.spaceStateJson.protected } }));
    scene.UserStateSet = (path: string, value: unknown) => app.userWrite(path, value);
    scene.UserStateDelete = (path: string) => app.userWrite(path, undefined);
    scene.OneShot = (data: unknown) =>
      app.bridge(() => {
        const text = typeof data === "string" ? data : JSON.stringify(data);
        // "A bigger message, or one sent before you've joined the room, is dropped."
        if (!app.session) return;
        room.toServer(app.session, () => room.serverOneShot(app.session!, text));
      });
    scene.SendToVisualScripting = (id: string, data: unknown) => app.bridge(() => app.graphReceive(id, JSON.stringify(data)));
    scene.Raycast = () => app.bridge(() => null);
    scene.SendHapticImpulse = (strength: number, seconds: number, side: number) => app.bridge(() => void client.haptics.push({ side, strength, seconds }));
    scene.IsVR = () => app.bridge(() => client.vr);
    scene.TeleportTo = (position: any, yDegrees: number, stop: boolean) =>
      app.bridge(() => void client.teleports.push({ position: new Vector3(position.x, position.y, position.z), yDegrees, stop }));
    for (const ability of ["Move", "Rotate", "Crouch", "Teleport", "Grapple", "Jump", "Grab"]) {
      scene["SetCan" + ability] = (allowed: boolean) => app.bridge(() => void client.abilities.set(ability, allowed));
    }
    for (const control of ["LeftThumbstick", "RightThumbstick", "LeftPrimary", "RightPrimary", "LeftSecondary", "RightSecondary", "LeftThumbstickClick", "RightThumbstickClick", "LeftTrigger", "RightTrigger"]) {
      scene["SetBlock" + control] = (blocked: boolean) => app.bridge(() => void client.blocks.set(control, blocked));
    }

    class Vec3 {
      x: number;
      y: number;
      z: number;
      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    }
    class Quat {
      x: number;
      y: number;
      z: number;
      w: number;
      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      }
    }
    class Component extends Emitter {
      componentType = "";
      gameObject: FakeObject | null = null;
      isLoaded = false;
    }
    class AssetBundle extends Component {
      windowsUrl: string;
      androidUrl: string;
      constructor(windows = "", _osx = "", _linux = "", android = "") {
        super();
        this.componentType = "AssetBundle";
        this.windowsUrl = windows;
        this.androidUrl = android;
      }
    }
    class KitItem extends Component {
      path: string;
      constructor(path = "") {
        super();
        this.componentType = "KitItem";
        this.path = path;
      }
      attached(holder: FakeObject): void {
        const bundle = holder.components.find((c) => c.componentType === "AssetBundle") as AssetBundle | undefined;
        const url = bundle ? bundle.windowsUrl || bundle.androidUrl : "";
        holder.kit = { url, loaded: false };
        app.stats.kitsLoading++;
        app.stats.kitsLoadingAtOnce = Math.max(app.stats.kitsLoadingAtOnce, app.stats.kitsLoading);
        room.schedule(
          room.options.kitLoadMs,
          () => {
            app.stats.kitsLoading--;
            const kit = room.kitAt(url);
            if (kit && !holder.destroyed) {
              const root = new FakeObject(app, `${kit.prefab}(Clone)`, holder);
              holder.kit!.loaded = true;
              holder.graph = emptyGraph();
              // The kit builder put a BS Object Id on every bound object and on each of its parents; the page
              // hears of them one by one, after `loaded`.
              const arriving: FakeObject[] = [root];
              for (const path of kit.paths) {
                let node = root;
                for (const part of path.split("/")) {
                  let next = node.children.find((c) => c.name === part);
                  if (!next) {
                    next = new FakeObject(app, part, node);
                    arriving.push(next);
                  }
                  node = next;
                }
                node.layer = kit.layerOfPath.get(path) ?? 0;
              }
              arriving.forEach((object, index) => room.schedule(2 + index * 3, () => object.announce(), client));
            }
            // "A model that fails to load fires it too": the latch reports once either way.
            this.isLoaded = true;
            this.emit("loaded");
          },
          client,
        );
      }
    }
    class SyncedObject extends Component {
      config: any;
      constructor(config: any = {}) {
        super();
        this.componentType = "SyncedObject";
        this.config = config;
      }
      attached(object: FakeObject): void {
        app.registerNetObject(object);
      }
      TakeOwnership(): Promise<void> {
        return app.bridge(() => {
          const object = this.gameObject!;
          if (app.session) room.toServer(app.session, () => room.serverObjectAcquire(app.session!, object.networkId));
        });
      }
      DoIOwn(): Promise<boolean> {
        return app.bridge(() => !!app.session && room.serverObjectOwner(this.gameObject!.networkId) === app.session.sid);
      }
    }
    class AttachedObject extends Component {
      config: any;
      constructor(config: any) {
        super();
        this.componentType = "AttachedObject";
        this.config = config ?? {};
      }
      set attachmentPoint(v: number) { this.config.attachmentPoint = v; }
      set attachmentPosition(v: any) { this.config.attachmentPosition = v; }
      set attachmentRotation(v: any) { this.config.attachmentRotation = v; }
      set autoSync(v: boolean) { this.config.autoSync = v; }
      Attach(uid: string): Promise<void> {
        return app.bridge(() => {
          const object = this.gameObject!;
          client.attached.set(object.path, this.config.autoSync ? { uid, point: this.config.attachmentPoint, autoSync: true, networkId: object.networkId } : { uid, point: this.config.attachmentPoint });
          if (this.config.autoSync) room.shareAttachment(client, object.networkId, { uid, point: this.config.attachmentPoint });
          // Attached to the head (point 0): the app moves the object there, if this client has a head position.
          if (this.config.attachmentPoint === 0 && client.head && uid === client.uid) {
            const offset = this.config.attachmentPosition ?? { x: 0, y: 0, z: 0 };
            object.truePosition = new Vector3(client.head.x + Number(offset.x || 0), client.head.y + Number(offset.y || 0), client.head.z + Number(offset.z || 0));
            app.objectMoved(object, false);
          }
        });
      }
      Detach(): Promise<void> {
        return app.bridge(() => {
          const was = client.attached.get(this.gameObject!.path);
          client.attached.delete(this.gameObject!.path);
          if (was?.autoSync) room.shareAttachment(client, this.gameObject!.networkId, null);
        });
      }
    }
    class Seat extends Component {
      constructor() {
        super();
        this.componentType = "Seat";
      }
      Sit(): Promise<void> {
        return app.bridge(() => void client.seated.add(this.gameObject!.path));
      }
      Stand(): Promise<void> {
        return app.bridge(() => void client.seated.delete(this.gameObject!.path));
      }
    }
    this.BS = {
      Scene: { GetInstance: () => scene },
      GameObject: class extends FakeObject {
        constructor(nameOrConfig: any) {
          super(app, typeof nameOrConfig === "string" ? nameOrConfig : String(nameOrConfig?.name ?? "New Game Object"), null);
          app.holders.set(this.name, this);
          this.announce();
        }
      },
      Vector3: Vec3,
      Quaternion: Quat,
      AssetBundle,
      KitItem,
      SyncedObject,
      Seat,
      AttachedObject,
      PN: { position: 1, rotation: 2 },
      CT: { AudioSource: "AudioSource" },
      KeyCode: { ...KEY_CODES },
      ButtonType: { TRIGGER: 0, GRIP: 1, PRIMARY: 2, SECONDARY: 3, THUMBSTICKCLICK: 4 },
      HandSide: { LEFT: 0, RIGHT: 1 },
    };
  }

  /** A page-to-app call: it lands a moment later, and its promise settles then. */
  bridge<T>(work: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.room.schedule(
        this.room.options.bridgeMs,
        () => {
          try {
            resolve(work());
          } catch (error) {
            reject(error);
          }
        },
        this.client,
      );
    });
  }

  // -- joining and presence --

  start(): void {
    const { room, client, scene } = this;
    // GUESS: the local user exists from the start with the id "local", and that id is filled in when the room
    // has been joined ("updates in place"), without another user-joined event.
    const me = { id: "local", uid: client.uid, name: client.name, isLocal: true, isSpaceAdmin: room.roleOf(client.uid) !== "member", state: {}, props: {} };
    scene.users[client.uid] = me;
    scene.localUser = me;
    if (client.solo) {
      // Play mode on your own (local-testing.md): "only you, with a random name, id, uid"; space state is kept in
      // memory; JSON user state answers app_unavailable; one-shots go nowhere.
      me.id = `solo_${Math.floor(room.rng() * 1e9).toString(36)}`;
      room.schedule(0, () => scene.emit("user-joined", me), client);
      room.schedule(1, () => this.pushFull(), client);
      return;
    }
    room.schedule(0, () => scene.emit("user-joined", me), client);
    room.schedule(room.options.joinDelayMs, () => room.serverJoin(client), client);
  }

  /** Play mode on your own: a write lands in the page's own copy of the state, and its events fire at once. */
  private soloWrite(path: string, value: string | undefined): boolean {
    const exists = this.mirror.has(path);
    if (value === undefined ? !exists : exists && this.mirror.get(path) === value) return false;
    this.onStateChanged("public", this.revision + 1, [value === undefined ? { path, deleted: true } : { path, value }], null);
    return true;
  }

  onWelcome(sid: string, peers: Array<{ sid: string; uid: string; name: string; role: string }>, publicState: Record<string, unknown>, protectedState: Record<string, unknown>, users: Record<string, Record<string, unknown>>): void {
    const { scene } = this;
    this.session = [...(this.room as any).sessions.values()].find((s: Session) => s.sid === sid) ?? null;
    this.joinedAt = this.room.now;
    this.nextSendAt = this.room.now;
    // GUESS at the order the page sees a join in: the others, the space state, everyone's user state, and only
    // then its own session id.
    for (const peer of peers) this.addUser(peer.sid, peer.uid, peer.name, peer.role);
    this.mirror.clear();
    this.knownProtected.clear();
    for (const path of Object.keys(publicState)) this.mirror.set(path, publicState[path]);
    for (const path of Object.keys(protectedState)) {
      this.mirror.set(path, protectedState[path]);
      this.knownProtected.add(path);
    }
    this.pushFull();
    for (const peerSid of Object.keys(users)) {
      if (peerSid === sid) continue;
      const user = Object.values(scene.users as Record<string, any>).find((u) => u.id === peerSid);
      if (!user) continue;
      const changes = Object.keys(users[peerSid]!).map((path) => ({ path, value: users[peerSid]![path], deleted: false }));
      for (const change of changes) user.state[change.path] = change.value;
      scene.emit("user-state", { user, id: user.id, uid: user.uid, full: true, changes });
    }
    scene.localUser.id = sid;
    this.schedulePump();
  }

  private addUser(sid: string, uid: string, name: string, role: string): void {
    const { scene } = this;
    const existing = scene.users[uid];
    if (existing) {
      // injection.js: a second user-joined for a known uid updates the entry and dispatches nothing.
      existing.id = sid;
      existing.name = name;
      return;
    }
    const user = { id: sid, uid, name, isLocal: false, isSpaceAdmin: role !== "member", state: {} as Record<string, unknown>, props: {} };
    scene.users[uid] = user;
    scene.emit("user-joined", user);
  }

  onPeerJoined(sid: string, uid: string, name: string, role: string): void {
    this.addUser(sid, uid, name, role);
  }

  onPeerLeft(sid: string): void {
    const { scene } = this;
    const user = Object.values(scene.users as Record<string, any>).find((u) => u.id === sid && !u.isLocal);
    if (!user) return;
    // injection.js dispatches user-left first and removes the entry after.
    scene.emit("user-left", user);
    delete scene.users[user.uid];
  }

  // -- space state: the app's write queue (SpaceStateService) --

  private isKnownProtected(path: string): boolean {
    for (const prefix of this.knownProtected) if (path === prefix || path.startsWith(prefix + ".")) return true;
    return false;
  }

  private queueProps(props: Record<string, string>, scope: "public" | "protected"): void {
    // The call itself is fire-and-forget: it reaches the app over the bridge, in order.
    this.room.schedule(
      this.room.options.bridgeMs,
      () => {
        for (const path of Object.keys(props)) {
          const value = String(props[path]);
          if (this.client.solo) {
            this.soloWrite(path, value);
            continue;
          }
          if (utf8Length(JSON.stringify(value)) > this.room.options.maxLeafBytes) {
            this.writeFailed(path, "value_too_large");
            continue;
          }
          const id = (scope === "protected" ? "x:" : "p:") + path;
          if (!this.pending.has(id)) this.order.push(id);
          this.pending.set(id, { path, value, scope, seq: ++this.seq });
          this.stats.writesQueued++;
        }
        this.schedulePump();
      },
      this.client,
    );
  }

  private sendInterval(): number {
    // "Object registration burns the burst in the first second. Be politest exactly then."
    const base = this.room.now - this.joinedAt < 3000 ? 500 : 200;
    return Math.max(base, this.backoff);
  }

  private schedulePump(): void {
    if (this.pumpTimer || this.inFlight || !this.session || !this.order.length) return;
    this.pumpTimer = this.room.schedule(
      Math.max(0, this.nextSendAt - this.room.now),
      () => {
        this.pumpTimer = 0;
        this.pump();
      },
      this.client,
    );
  }

  private pump(): void {
    const session = this.session;
    if (!session || this.inFlight || !this.order.length) return;
    const scope = this.pending.get(this.order[0]!)!.scope;
    const taken: Array<{ id: string; path: string; value: string; seq: number }> = [];
    const ops: StateOp[] = [];
    for (const id of this.order) {
      const write = this.pending.get(id)!;
      if (write.scope !== scope) continue;
      const slots = scope === "protected" ? 2 : 1;
      if (ops.length + slots > 64) break;
      // Local refusals that must never spend a rate-limit token.
      if (scope === "public" && this.isKnownProtected(write.path)) {
        this.drop(id, write.seq);
        this.writeFailed(write.path, "protected_path");
        continue;
      }
      if (scope === "protected" && this.protectedOff) {
        this.drop(id, write.seq);
        this.writeFailed(write.path, "not_authorized");
        continue;
      }
      if (scope === "protected") ops.push({ op: "protect", path: write.path });
      ops.push({ op: "set", path: write.path, value: write.value });
      taken.push({ id, path: write.path, value: write.value, seq: write.seq });
    }
    if (!ops.length) {
      this.nextSendAt = this.room.now + this.sendInterval();
      this.schedulePump();
      return;
    }
    this.inFlight = true;
    this.stats.batches++;
    const slotsPer = scope === "protected" ? 2 : 1;
    this.room.toServer(session, () =>
      this.room.serverStateBatch(session, scope, ops, scope === "protected", (result) => {
        this.inFlight = false;
        if (result.ok) {
          for (const t of taken) this.drop(t.id, t.seq);
          this.backoff = 0;
          this.nextSendAt = this.room.now + this.sendInterval();
          if (scope === "protected") for (const t of taken) this.knownProtected.add(t.path);
        } else if (result.error === "socket_closed") {
          // the app reconnects and sends the same queue again: everything stays queued (and is too big again)
          this.client.notes.push(`socket closed 1009: a state batch of ${ops.length} writes was over the relay's message limit`);
          this.backoff = this.backoff <= 0 ? 1000 : Math.min(this.backoff * 2, 4000);
          this.nextSendAt = this.room.now + this.backoff;
        } else if (result.error === "rate_limited") {
          // Everything stays queued; never surfaced to the page as an error.
          this.stats.rateLimited++;
          this.backoff = this.backoff <= 0 ? 250 : Math.min(this.backoff * 2, 4000);
          this.nextSendAt = this.room.now + this.backoff + this.room.rng() * 100;
          this.client.notes.push(`rate_limited ${taken.map((t) => t.path).join(",")}`);
        } else if (result.error === "batch_failed" && result.outcomes) {
          taken.forEach((t, i) => {
            const failure = result.outcomes!.slice(i * slotsPer, i * slotsPer + slotsPer).find((o) => !o.ok);
            if (failure) {
              this.drop(t.id, t.seq);
              this.writeFailed(t.path, failure.error ?? "batch_failed");
            } else if (scope !== "protected") this.drop(t.id, t.seq);
          });
          this.nextSendAt = this.room.now + this.sendInterval();
        } else {
          if (result.error === "not_space_admin" || result.error === "not_authorized") this.protectedOff = true;
          for (const t of taken) {
            this.drop(t.id, t.seq);
            this.writeFailed(t.path, result.error ?? "internal_error");
          }
          this.nextSendAt = this.room.now + this.sendInterval();
        }
        this.schedulePump();
      }),
    );
  }

  /** Drops a queued write, but only if it has not been replaced by a newer one while it was in flight. */
  private drop(id: string, seq: number): void {
    if (this.pending.get(id)?.seq !== seq) return;
    this.pending.delete(id);
    this.order = this.order.filter((o) => o !== id);
  }

  private writeFailed(path: string, code: string): void {
    this.scene.emit("space-state-error", { key: path, code, message: code });
  }

  private directDelete(path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.room.schedule(
        this.room.options.bridgeMs,
        () => {
          const session = this.session;
          if (this.client.solo) {
            const doomed = [...this.mirror.keys()].filter((p) => p === path || p.startsWith(path + "."));
            if (!doomed.length) return reject({ code: "not_found" });
            for (const p of doomed) this.soloWrite(p, undefined);
            return resolve();
          }
          if (!session) return reject({ code: "not_connected" });
          this.room.toServer(session, () =>
            this.room.serverStateBatch(session, "public", [{ op: "delete", path }], false, (result) => {
              if (result.ok) resolve();
              else reject({ code: result.outcomes?.find((o) => !o.ok)?.error ?? result.error ?? "internal_error" });
            }),
          );
        },
        this.client,
      );
    });
  }

  onStateChanged(_scope: string, revision: number, changes: StateChange[], protectedPrefixes: string[] | null): void {
    this.revision = revision;
    if (protectedPrefixes) for (const prefix of protectedPrefixes) this.knownProtected.add(prefix);
    const { scene } = this;
    for (const change of changes) {
      const previous = this.mirror.get(change.path);
      if (change.deleted) this.mirror.delete(change.path);
      else this.mirror.set(change.path, change.value);
      const isPublic = !this.isKnownProtected(change.path);
      const json = isPublic ? scene.spaceStateJson.public : scene.spaceStateJson.protected;
      delete (isPublic ? scene.spaceStateJson.protected : scene.spaceStateJson.public)[change.path];
      if (change.deleted) delete json[change.path];
      else json[change.path] = change.value;
      const rendered = change.deleted ? "" : typeof change.value === "string" ? change.value : JSON.stringify(change.value);
      // The string event first, then the JSON one, as SpaceStateSdkBridge.OnChanged does.
      scene.emit("space-state-changed", { changes: [{ property: change.path, newValue: rendered, oldValue: previous === undefined ? null : String(previous), isPublic }] });
      scene.emit("space-state", {
        revision,
        full: false,
        changes: [{ path: change.path, value: change.deleted ? null : change.value, oldValue: previous, scope: isPublic ? "public" : "protected", deleted: !!change.deleted }],
      });
    }
  }

  private pushFull(): void {
    const { scene } = this;
    scene.spaceStateJson = { public: {}, protected: {} };
    const changes: any[] = [];
    for (const [path, value] of this.mirror) {
      const scope = this.isKnownProtected(path) ? "protected" : "public";
      scene.spaceStateJson[scope][path] = value;
      changes.push({ path, value, scope, deleted: false });
    }
    scene.emit("space-state", { revision: this.revision, full: true, canProtect: !this.protectedOff, changes });
  }

  // -- user state --

  private userWrite(path: string, value: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.room.schedule(
        this.room.options.bridgeMs,
        () => {
          const session = this.session;
          // GUESS: before the room is joined the app has nobody to send user state to.
          if (!session) return reject({ code: "app_unavailable" });
          this.room.toServer(session, () =>
            this.room.serverUserSet(session, path, value, (result) => {
              if (result.ok) resolve();
              else reject({ code: result.error ?? "internal_error" });
            }),
          );
        },
        this.client,
      );
    });
  }

  onUserStateChanged(sid: string, changes: Array<{ path: string; value: unknown; deleted: boolean }>): void {
    const { scene } = this;
    const user = Object.values(scene.users as Record<string, any>).find((u) => u.id === sid);
    if (!user) return;
    for (const change of changes) {
      if (change.deleted) delete user.state[change.path];
      else user.state[change.path] = change.value;
    }
    scene.emit("user-state", { user, id: sid, uid: user.uid, full: false, changes });
  }

  onOneShot(fromSid: string, fromAdmin: boolean, data: string): void {
    this.scene.emit("one-shot", { fromId: fromSid, fromAdmin, data });
  }

  // -- synced objects --

  registerNetObject(object: FakeObject): void {
    if (!object.networkId) return;
    this.netObjects.set(object.networkId, object);
    if (this.client.solo) return; // "Physics runs as authored; nothing is shared."
    const create = () => {
      const session = this.session;
      if (!session) return void this.room.schedule(100, create, this.client);
      this.room.toServer(session, () =>
        this.room.serverObjectCreate(session, object.networkId, (ok) => {
          // GUESS: the app tries again when the shared bucket was empty.
          if (!ok) this.room.schedule(500, create, this.client);
        }),
      );
    };
    create();
  }

  /** The object's real pose changed here: the page hears of it a frame later, the room if this client owns it. */
  objectMoved(object: FakeObject, fromNetwork: boolean): void {
    if (object.watched) this.room.schedule(16, () => object.pushTransform(), this.client);
    if (fromNetwork || !object.networkId || !this.session) return;
    const session = this.session;
    const p: [number, number, number] = [object.truePosition.x, object.truePosition.y, object.truePosition.z];
    const r: [number, number, number, number] = [object.trueRotation.x, object.trueRotation.y, object.trueRotation.z, object.trueRotation.w];
    this.room.toServer(session, () => this.room.serverObjectPose(session, object.networkId, p, r));
  }

  onObjectPose(id: string, p: [number, number, number], r: [number, number, number, number]): void {
    const object = this.netObjects.get(id);
    if (!object || object.destroyed) return;
    object.truePosition = new Vector3(p[0], p[1], p[2]);
    object.trueRotation = new Quaternion(r[0], r[1], r[2], r[3]);
    this.objectMoved(object, true);
  }

  destroyObject(object: FakeObject): void {
    if (this.holders.get(object.name) === object) this.holders.delete(object.name);
    const sweep = (o: FakeObject) => {
      o.destroyed = true;
      delete this.scene.objects[o.unityId];
      if (o.networkId && this.netObjects.get(o.networkId) === o) this.netObjects.delete(o.networkId);
      o.children.forEach(sweep);
    };
    sweep(object);
  }

  // -- the kit's relay graph --

  /** What the generated relay graph does with "On BullSchript Callback Received": `text` is a JSON string literal. */
  private graphReceive(id: string, text: string): void {
    this.stats.relayCalls++;
    if (id !== "pk1") return;
    if (text.length < 2 || text[0] !== '"' || text[text.length - 1] !== '"' || text.indexOf("\\") >= 0) {
      this.client.notes.push(`graph cannot read payload ${text}`);
      return;
    }
    const payload = text.slice(1, -1); // drop the quotes; nothing else needs undoing, by the encoding's design
    const parsed = parseRelayPayload(payload);
    if (!parsed) return;
    // Every kit's graph hears every payload and ignores those not addressed to its holder.
    const holder = this.holders.get("pk1:" + parsed.key);
    if (!holder || !holder.kit || !holder.kit.loaded || !holder.graph) return;
    const kit = this.room.kitAt(holder.kit.url);
    if (!kit) return;
    const graph = holder.graph;
    // Clock requests are the runtime's own traffic: counted, but kept out of what a game's ops look like.
    if (parsed.records.some((record) => record.op !== "clock")) graph.payloads.push(payload);
    for (const record of parsed.records) {
      if (record.op === "clock") graph.clockRequests++;
      else graph.records.push(record);
      const target = record.target.startsWith("@") ? record.target : (kit.refs[Number(record.target)] ?? `#${record.target}`);
      const args = record.args;
      switch (record.op) {
        case "text":
          graph.text.set(target, args[0] ?? "");
          break;
        case "active": {
          graph.active.set(target, args[0] === "1");
          // As in Unity: the object itself is switched (inactive ones included), found by path under the kit root.
          const path = target.startsWith("@") ? target.slice(1) : kit.pathOfKey.get(target);
          let node: FakeObject | undefined = path === undefined ? undefined : holder.children[0];
          if (path) for (const part of path.split("/")) node = node?.children.find((c) => c.name === part);
          if (node) node.active = args[0] === "1";
          break;
        }
        case "animBool":
        case "animFloat":
        case "animInt":
          graph.anim.set(target, { ...(graph.anim.get(target) ?? {}), [args[0] ?? ""]: args[1] ?? "" });
          break;
        case "color":
          graph.color.set(`${target}/${args[0]}`, args.slice(1));
          break;
        case "matFloat":
          graph.floats.set(`${target}/${args[0]}`, args[1] ?? "");
          break;
        case "uiColor":
          graph.uiColor.set(target, args);
          break;
        case "audio":
          // As built: "<clip>|<holder's refs index>", the holder's PkClips list (the graph cannot read BS Audio Source)
          if (!/^\d+$/.test(args[0] ?? "") || !/^\d+$/.test(args[1] ?? "") || kit.refs[Number(args[1])] === undefined) {
            this.client.notes.push(`graph: audio needs a clip index and a holder's refs index, got ${args.join("|")}`);
            break;
          }
          graph.events.push({ op: record.op, target, args: [args[0]!, kit.refs[Number(args[1])]!] });
          break;
        case "audioScaled":
          if (!/^\d+$/.test(args[0] ?? "") || kit.refs[Number(args[1])] === undefined || !Number.isFinite(Number(args[2]))) {
            this.client.notes.push(`graph: audioScaled needs a clip index, a holder's refs index and a volume scale, got ${args.join("|")}`);
            break;
          }
          graph.events.push({ op: record.op, target, args: [args[0]!, kit.refs[Number(args[1])]!, args[2]!] });
          break;
        case "audioPitch":
        case "audioVolume":
        case "animEnabled":
        case "uiSetToggle":
        case "uiSetSlider":
        case "scale":
        case "rbKinematic":
          graph.values.set(`${target}/${record.op}`, args);
          break;
        case "animTrigger":
        case "animResetTrigger":
        case "animPlay":
        case "particles":
        case "rbVelocity":
        case "rbLaunch":
        case "spawn":
        case "despawn":
          graph.events.push({ op: record.op, target, args });
          break;
        case "clock": {
          const requestId = args[0] ?? "";
          const seconds = String(this.room.clockSeconds());
          this.room.schedule(16, () => this.client.env.win.__pk1?.clock(parsed.key, requestId, seconds), this.client);
          break;
        }
        case "pkHead": {
          // The SDK's Get User State, as the app answers it: where it places that session's head (the room's
          // `client.head`, set by pose()), 0 0 0 for a session it does not know or whose head it has not placed.
          // `room.headAnswers = false` stands for a kit built before the op (no answer at all).
          if (!this.room.headAnswers) break;
          const [requestId = "", sid = ""] = args;
          const head = this.room.clients.find((c) => c.sid === sid && !c.hasLeft)?.head ?? null;
          const at = head ?? new Vector3(0, 0, 0);
          graph.events.push({ op: record.op, target, args });
          this.room.schedule(16, () => this.client.env.win.__pk1?.event(parsed.key, "pkHead", `${requestId}|${at.x}|${at.y}|${at.z}`), this.client);
          break;
        }
        default: {
          // A game's own op (KitBuilder.RelayOps), when the test told the room about it.
          const handler = this.room.relayOps.get(record.op);
          if (handler === undefined) {
            this.client.notes.push(`graph: unknown op ${record.op}`);
            break;
          }
          graph.events.push({ op: record.op, target, args });
          const [slug = "", inst = ""] = [parsed.key.slice(0, parsed.key.indexOf(":")), parsed.key.slice(parsed.key.indexOf(":") + 1)];
          if (handler) handler({ op: record.op, target, args, key: parsed.key, slug, inst }, this.client);
        }
      }
    }
  }
}

/** getRandomValues from a seeded generator: deterministic bytes for tests. */
function seededBytes(next: () => number): <T extends Uint8Array>(array: T) => T {
  return (array) => {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(next() * 256) & 0xff;
    return array;
  };
}

function emptyGraph(): GraphState {
  return { text: new Map(), active: new Map(), anim: new Map(), color: new Map(), floats: new Map(), uiColor: new Map(), values: new Map(), events: [], payloads: [], records: [], clockRequests: 0 };
}

export class FakeClient {
  readonly room: FakeRoom;
  readonly uid: string;
  readonly name: string;
  readonly app: FakeApp;
  readonly env: PageEnv;
  readonly logs: Array<{ level: string; text: string }> = [];
  /** Things the fake itself noticed (rate limits, payloads a graph could not read). */
  readonly notes: string[] = [];
  readonly haptics: Array<{ side: number; strength: number; seconds: number }> = [];
  /** What scene.IsVR() answers on this client's page (set before the player arrives). */
  vr = false;
  readonly teleports: Array<{ position: Vector3; yDegrees: number; stop: boolean }> = [];
  readonly abilities = new Map<string, boolean>();
  readonly blocks = new Map<string, boolean>();
  readonly seated = new Set<string>();
  /**
   * Where the local player's head is, for a page that asks (an object attached to the head goes there). Null by
   * default: then nothing answers, as an app that never moves the object would. `pose()` keeps it current.
   */
  head: Vector3 | null = null;
  /** Kit objects attached to this player (BS.AttachedObject), by path: who and where (0 head, 1 left hand, 2 right hand). */
  readonly attached = new Map<string, { uid: string; point: number; autoSync?: boolean; networkId?: string }>();
  /** Other players' autoSync attachments this client reproduced on its own copies (room.shareAttachment), by path. */
  readonly remoteAttached = new Map<string, { uid: string; point: number }>();
  readonly runtimes = new Map<string, GameRuntime>();
  readonly platforms: BsPlatform[] = [];
  private readonly elements: FakeSnippet[] = [];
  private readonly singletons = new Map<string, FakeSnippet>();
  private readonly observers: Array<() => void> = [];
  private readonly adapterOptions: Partial<BsOptions>;
  private gone = false;
  /** True once the player has left (leave()). */
  get hasLeft(): boolean {
    return this.gone;
  }
  /** Play mode on your own: no room, so no other players, no one-shots and no user state. */
  readonly solo: boolean;

  constructor(room: FakeRoom, uid: string, name: string, device: string, adapterOptions: Partial<BsOptions>, solo = false) {
    this.room = room;
    this.uid = uid;
    this.name = name;
    this.adapterOptions = adapterOptions;
    this.solo = solo;
    this.app = new FakeApp(room, this);
    const client = this;
    const store = room.device(device);
    const loadedListeners: Array<() => void> = [];
    let loaded = false;
    const subtle = (webcrypto as any).subtle;
    const tracked = new Proxy(subtle, {
      get(target, property) {
        const member = target[property];
        if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
          room.pendingAsync++;
          return (member.apply(target, args) as Promise<unknown>).finally(() => {
            room.pendingAsync--;
          });
        };
      },
    });
    const log = (level: string) => (...args: unknown[]) => {
      const text = args.map(String).join(" ");
      client.logs.push({ level, text });
      if (room.options.echoLogs) console.log(`${String(Math.round(room.now)).padStart(7)} ${client.name} ${level}: ${text}`);
    };
    this.env = {
      BS: this.app.BS,
      win: {
        // The SDK latches bs-loaded: a listener added after it fired is still called.
        addEventListener(type: string, handler: () => void) {
          if (type !== "bs-loaded") return;
          if (loaded) room.schedule(0, handler, client);
          else loadedListeners.push(handler);
        },
      },
      doc: {
        querySelectorAll: (selector: string) => (selector === "bs-snippet" ? client.elements.filter((e) => e.isConnected) : []),
        documentElement: {},
      },
      MutationObserver: class {
        private readonly callback: (records: unknown[]) => void;
        constructor(callback: (records: unknown[]) => void) {
          this.callback = callback;
        }
        observe(): void {
          client.observers.push(() => this.callback([{ addedNodes: [], removedNodes: [] }]));
        }
        disconnect(): void {}
      },
      storage: {
        getItem: (key) => (store.has(key) ? store.get(key)! : null),
        setItem: (key, value) => void store.set(key, String(value)),
        removeItem: (key) => void store.delete(key),
        get length() {
          return store.size;
        },
        key: (index) => [...store.keys()][index] ?? null,
      },
      // Seeded, so a test with the same seed sees the same nonces, secrets and RandomBytes (keys come from subtle).
      crypto: { subtle: tracked, getRandomValues: seededBytes(seededRandom(room.options.seed * 104729 + room.clients.length + 17)) },
      setTimeout: (fn, ms) => room.schedule(ms, fn, client),
      clearTimeout: (handle) => room.cancel(handle),
      now: () => room.now,
      wallMs: () => room.options.clockSeconds * 1000 + room.now,
      random: seededRandom(room.options.seed * 7919 + room.clients.length + 1),
      console: { log: log("info"), warn: log("warn"), error: log("error") },
    };
    room.schedule(
      200,
      () => {
        loaded = true;
        for (const listener of loadedListeners.splice(0)) listener();
      },
      this,
    );
    this.app.start();
  }

  /** The session id, once the room has been joined. */
  get sid(): string {
    return this.app.session?.sid ?? String(this.app.scene.localUser?.id ?? "local");
  }

  get joined(): boolean {
    return this.app.session !== null;
  }

  // ---- the page -----------------------------------------------------------------------------------------------

  /** A game's script is loaded into the page. Null when the script was already there (it does nothing twice). */
  load(game: GameDefinition, bindings: unknown): GameRuntime | null {
    const platform = new BsPlatform(this.env, this.adapterOptions);
    this.platforms.push(platform);
    const runtime = boot(platform, game, bindings);
    if (runtime) this.runtimes.set(game.slug, runtime);
    return runtime;
  }

  /** Adds a `<bs-snippet name=...>` element to the page. */
  addSnippet(name: string, attributes: Record<string, string> = {}): FakeSnippet {
    const attrs = new Map(Object.entries({ name, ...attributes }));
    const element: FakeSnippet = {
      getAttribute: (key) => (attrs.has(key) ? attrs.get(key)! : null),
      setAttribute: (key, value) => void attrs.set(key, value),
      getAttributeNames: () => [...attrs.keys()],
      isConnected: true,
      ownsSingleton: null,
    };
    // The element's own single-instance rule: the first to load claims the name, later copies are skipped.
    const single = element.getAttribute("single");
    if (single !== null && single !== "false") {
      const holder = this.singletons.get(name);
      if (!holder || !holder.isConnected) {
        this.singletons.set(name, element);
        element.ownsSingleton = name;
      }
    }
    this.elements.push(element);
    this.mutated();
    return element;
  }

  removeSnippet(element: FakeSnippet): void {
    element.isConnected = false;
    const name = element.getAttribute("name") ?? "";
    if (this.singletons.get(name) === element) this.singletons.delete(name);
    element.ownsSingleton = null;
    const at = this.elements.indexOf(element);
    if (at >= 0) this.elements.splice(at, 1);
    this.mutated();
  }

  private mutated(): void {
    this.room.schedule(0, () => this.observers.forEach((notify) => notify()), this);
  }

  /** The player leaves: the socket closes, and the page is gone. */
  leave(): void {
    if (this.gone) return;
    this.gone = true;
    if (this.app.session) this.room.serverLeave(this.app.session);
    this.room.cancelOwned(this);
    for (const runtime of this.runtimes.values()) runtime.stop();
    this.room.cancelOwned(this);
  }

  // ---- reaching into a running game ---------------------------------------------------------------------------

  instance(slug: string, inst = "0"): GameInstance {
    const instance = this.runtimes.get(slug)?.instance(inst);
    if (!instance) throw new Error(`${this.name} runs no instance ${slug}:${inst}`);
    return instance;
  }

  hasInstance(slug: string, inst = "0"): boolean {
    return !!this.runtimes.get(slug)?.instance(inst);
  }

  private holder(slug: string, inst: string): FakeObject {
    const holder = this.app.holders.get(holderName(slug, inst));
    if (!holder) throw new Error(`${this.name} has no kit holder for ${slug}:${inst}`);
    return holder;
  }

  hasHolder(slug: string, inst = "0"): boolean {
    return this.app.holders.has(holderName(slug, inst));
  }

  /** A kit object as the host has it, by its bindings key. */
  object(slug: string, inst: string, key: string): FakeObject {
    const holder = this.holder(slug, inst);
    const kit = holder.kit ? this.room.kitAt(holder.kit.url) : undefined;
    const path = kit?.pathOfKey.get(key);
    let node: FakeObject | undefined = holder.children[0];
    for (const part of (path ?? "").split("/")) node = node?.children.find((c) => c.name === part);
    if (!node) throw new Error(`${this.name}: kit object '${key}' of ${slug}:${inst} is not known to the page`);
    return node;
  }

  /** The local player clicks a kit object. */
  /** The local player clicks a kit object. Returns false (and nothing happens) when it is not on a clickable layer (5, 22). */
  click(slug: string, inst: string, key: string, point?: Vector3): boolean {
    const object = this.object(slug, inst, key);
    if (object.layer !== 5 && object.layer !== 22) return false;
    object.emit("click", point ? { point: { x: point.x, y: point.y, z: point.z }, normal: { x: 0, y: 1, z: 0 } } : {});
    return true;
  }

  /** The local player grabs a kit object. Returns false (and nothing happens) when it is not on the Grabbable layer (20). */
  grab(slug: string, inst: string, key: string): boolean {
    const object = this.object(slug, inst, key);
    if (object.layer !== 20) return false;
    object.held = true;
    object.heldSide = 1;
    object.emit("grab", { side: 1 });
    return true;
  }

  /** The local player lets go of an object where it now is. */
  drop(slug: string, inst: string, key: string): void {
    const object = this.object(slug, inst, key);
    object.held = false;
    object.emit("drop", { side: 1 });
  }

  /** Moves an object as a hand or physics would: the host knows at once, the page only through its watch. */
  move(slug: string, inst: string, key: string, position: Vector3, rotation: Quaternion = new Quaternion()): void {
    const object = this.object(slug, inst, key);
    object.truePosition = position.clone();
    object.trueRotation = rotation.clone();
    this.app.objectMoved(object, false);
  }

  /** What the kit's relay graph has been asked to do on this client. */
  graph(slug: string, inst = "0"): GraphState {
    return this.holder(slug, inst).graph ?? emptyGraph();
  }

  /** A graph of the kit reports to the page: `window.__pk1.event("<slug>:<inst>", name, "<arg>|<arg>")`. */
  graphEvent(slug: string, inst: string, name: string, args = ""): void {
    this.env.win.__pk1?.event(relayKey(slug, inst), name, args);
  }

  /** Controller or keyboard input from the local player, as the scene reports it. */
  input(event: InputEvent): void {
    const { scene } = this.app;
    if (event.type === "button") scene.emit(event.pressed ? "button-pressed" : "button-released", { button: event.button, side: event.side });
    else if (event.type === "thumbstick") scene.emit("controller-axis-update", { hand: event.side, x: event.x, y: event.y });
    else if (event.type === "trigger") scene.emit("trigger-axis-update", { hand: event.side, value: event.value });
    else scene.emit(event.pressed ? "key-press" : "key-release", { key: this.app.BS.KeyCode[event.key] ?? 0 });
  }

  /** The local player's head and hands, as `pose-update` reports them. */
  pose(poses: LocalPoses | Vector3): void {
    const at = (p: Vector3, r: Quaternion) => ({ position: { x: p.x, y: p.y, z: p.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w } });
    const full = poses instanceof Vector3 ? { head: { position: poses, rotation: new Quaternion() }, leftHand: { position: poses, rotation: new Quaternion() }, rightHand: { position: poses, rotation: new Quaternion() } } : poses;
    this.head = full.head.position.clone();
    this.app.scene.emit("pose-update", { head: at(full.head.position, full.head.rotation), leftHand: at(full.leftHand.position, full.leftHand.rotation), rightHand: at(full.rightHand.position, full.rightHand.rotation) });
  }

  /** The app teleported the local player (a spawn, a portal): the page hears `player-teleported`. */
  teleported(position: Vector3, isSpawn = false): void {
    this.app.scene.emit("player-teleported", { position: { x: position.x, y: position.y, z: position.z }, rotation: { x: 0, y: 0, z: 0 }, isSpawn });
  }

  /** Log lines of one level, for assertions. */
  logged(level: string): string[] {
    return this.logs.filter((l) => l.level === level).map((l) => l.text);
  }
}
