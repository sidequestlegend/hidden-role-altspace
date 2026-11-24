// The app: the Platform over the page API (`window.BS`). This is the only file that may touch the page's
// globals, and it does so in exactly one function, `pageEnv()`. Everything else works on a PageEnv value, which
// is what lets the fake room run this same adapter in Node.
//
// Sources this adapter is written from (Creator SDK 4.0.29): Runtime/Resources/injection.js, Docs/javascript-api,
// Docs/multiplayer/overview.md, Runtime/LocalMultiplayer/State (a mirror of the app's state client).
// What could only be read, not run, is marked "UNVERIFIED" below and listed in the README.

import { parseEventArgs } from "../host.ts";
import { TAG } from "../names.ts";
import {
  DEFAULT_LIMITS,
  type Ability,
  type BlockableControl,
  type Clock,
  type CryptoLike,
  type HandSide,
  type HostEventDetail,
  type HostEventKind,
  type HostObject,
  type InputEvent,
  type KeyValueStore,
  type Kit,
  type KitObjectSpec,
  type KitSpec,
  type Limits,
  type LocalPoses,
  type LogLevel,
  type Platform,
  type PlatformPlayer,
  type Pose,
  type RayHit,
  type RelayHandlers,
  type SnippetElement,
  type TransformPatch,
  type Unsubscribe,
} from "../types.ts";
import { deferred, utf8Length } from "../util.ts";
import { Quaternion, Vector3 } from "../values.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Everything the adapter needs from the page. */
export interface PageEnv {
  /** The page API namespace. */
  BS: any;
  /** The window: `addEventListener("bs-loaded")` and the registry property `__pk1`. */
  win: { addEventListener(type: string, handler: () => void): void; __pk1?: any; __pk1_debug?: boolean };
  doc: { querySelectorAll(selector: string): ArrayLike<any>; documentElement: any };
  MutationObserver: new (callback: (records: any[]) => void) => { observe(target: any, options: any): void; disconnect(): void };
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; length: number; key(index: number): string | null } | null;
  crypto: CryptoLike;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  /** Milliseconds, monotonic. */
  now(): number;
  /** Milliseconds of wall time. */
  wallMs(): number;
  random(): number;
  console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
}

/** The real page. The one place the globals are read. */
export function pageEnv(): PageEnv {
  const g = globalThis as any;
  let storage: PageEnv["storage"] = null;
  try {
    storage = g.localStorage ?? null;
  } catch {
    storage = null; // storage switched off for this page
  }
  return {
    get BS() {
      return g.BS;
    },
    win: g.window,
    doc: g.document,
    MutationObserver: g.MutationObserver,
    storage,
    crypto: g.crypto,
    setTimeout: (fn, ms) => g.setTimeout(fn, ms),
    clearTimeout: (handle) => g.clearTimeout(handle),
    now: () => g.performance.now(),
    wallMs: () => g.Date.now(),
    random: () => g.Math.random(),
    console: g.console,
  };
}

export interface BsOptions {
  /** How long to wait for the local player to be in the room before going on alone. */
  joinTimeoutMs: number;
  /** How long to wait for a kit's bundle and prefab. */
  kitTimeoutMs: number;
  /** How long to keep looking for a kit's bound objects after the kit item reports loaded. */
  kitFindMs: number;
  /** User-state leaves are sent at most this often each. */
  userFlushMs: number;
  /** How long the one reading of the local head's position at start may take (localPosition). */
  headProbeMs: number;
  /**
   * Space-state bytes handed to the app and not yet seen back from the room, at most (see queueSet). The app sends what
   * it holds in batches of up to 64 writes of up to 16 KiB each, and the relay closes the socket on a message over
   * 256 KiB (RELAY.md, code 1009): what the page lets out of its own queue is what bounds a batch.
   */
  stateBudgetBytes: number;
  /** A write not seen back after this long stops counting against the budget (it failed quietly, or was a no-op). */
  stateEchoMs: number;
  /** Debug logging to the console. */
  verbose: boolean;
}

const DEFAULT_BS_OPTIONS: BsOptions = { joinTimeoutMs: 30000, kitTimeoutMs: 120000, kitFindMs: 20000, userFlushMs: 200, headProbeMs: 5000, stateBudgetBytes: 96 * 1024, stateEchoMs: 4000, verbose: false };

const HOST_EVENTS: Partial<Record<HostEventKind, string>> = {
  click: "click",
  grab: "grab",
  drop: "drop",
  triggerEnter: "trigger-enter",
  triggerExit: "trigger-exit",
  collisionEnter: "collision-enter",
  collisionExit: "collision-exit",
};

/** The bridge's delimiter characters: a value written through the string calls must hold none of them. */
const DELIMITER_CODES = [0xb6, 0xa7, 0x7c, 0x203d, 0xa4];

function hasDelimiter(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (DELIMITER_CODES.indexOf(text.charCodeAt(i)) >= 0) return true;
  return false;
}

interface Registry {
  v: number;
  games: Record<string, unknown>;
  holders: Record<string, { clock(id: string, seconds: string): void; event(name: string, args: string): void }>;
  debug: Record<string, Record<string, unknown>>;
  clock(key: string, id: string, seconds: string): void;
  event(key: string, name: string, args?: string): void;
}

type StateHandler = { prefix: string; fn: (path: string, value: string | undefined) => void };
type ErrorHandler = { prefix: string; fn: (path: string, code: string, final: boolean) => void };
type UserHandler = { prefix: string; fn: (sid: string, path: string, value: string | undefined) => void };

export class BsPlatform implements Platform {
  readonly clock: Clock;
  readonly limits: Limits = { ...DEFAULT_LIMITS };
  readonly storage: KeyValueStore;
  readonly crypto: CryptoLike;
  private readonly env: PageEnv;
  private readonly options: BsOptions;
  private scene: any = null;
  private readyPromise: Promise<void> | null = null;
  private readonly mirror = new Map<string, string>();
  private readonly snapshot = deferred<boolean>();
  private fullSeen = false;
  private readonly stateHandlers: StateHandler[] = [];
  private readonly errorHandlers: ErrorHandler[] = [];
  private readonly userHandlers: UserHandler[] = [];
  private readonly oneShotHandlers: Array<(fromSid: string, data: string) => void> = [];
  private readonly playerHandlers: Array<(kind: "join" | "leave", player: PlatformPlayer) => void> = [];
  private readonly sessionHandlers: Array<() => void> = [];
  private readonly snippetHandlers: Array<() => void> = [];
  private readonly poseHandlers: Array<(poses: LocalPoses) => void> = [];
  private readonly teleportHandlers: Array<(position: Vector3) => void> = [];
  private headReading: Promise<Vector3 | null> | null = null;
  private readonly inputHandlers: Array<(event: InputEvent) => void> = [];
  private readonly wrappers = new WeakMap<object, SnippetElement>();
  /** uid -> the page's UserData object for everyone in the room. */
  private readonly roster = new Map<string, any>();
  private pendingPublic: Record<string, string> | null = null;
  private pendingProtected: Record<string, string> | null = null;
  /** Turns of writes not handed to the app yet (each turn is one action's writes: kept together while it fits). */
  private readonly stateQueue: Array<{ scope: "public" | "protected"; writes: Array<[string, string]> }> = [];
  /** Handed to the app, not yet seen back: path -> bytes and when. */
  private readonly unechoed = new Map<string, { bytes: number; at: number }>();
  private unechoedBytes = 0;
  private stateTimer = 0;
  private warnedSplit = false;
  /** For tests and diagnostics: handoffs to the app, and the largest one in bytes. */
  readonly stateStats = { handoffs: 0, largest: 0, deferred: 0 };
  private readonly pendingUser = new Map<string, string | null>();
  private userTimer = 0;
  private userLastFlush = -Infinity;
  private userBackoff = 0;
  /** Own user state when the app has no user state to offer (Play mode on your own). */
  private localUser: Map<string, string> | null = null;
  private readonly ownUser = new Map<string, string>();
  private sessionId = "";
  private keyNames: Record<number, string> | null = null;
  private observer: { disconnect(): void } | null = null;

  constructor(env: PageEnv, options: Partial<BsOptions> = {}) {
    this.env = env;
    this.options = { ...DEFAULT_BS_OPTIONS, ...options };
    this.crypto = env.crypto;
    this.clock = {
      now: () => env.now(),
      wallSeconds: () => env.wallMs() / 1000,
      setTimeout: (fn, ms) => env.setTimeout(fn, ms),
      clearTimeout: (handle) => env.clearTimeout(handle),
    };
    const store = env.storage;
    this.storage = {
      get: (key) => (store ? store.getItem(key) : null),
      set: (key, value) => {
        if (!store) throw new Error("no storage on this page");
        store.setItem(key, value);
      },
      remove: (key) => store?.removeItem(key),
      keys: (prefix) => {
        const out: string[] = [];
        if (!store) return out;
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key !== null && key.startsWith(prefix)) out.push(key);
        }
        return out;
      },
    };
  }

  random(): number {
    return this.env.random();
  }

  log(level: LogLevel, message: string): void {
    if (level === "debug" && !this.options.verbose) return;
    const text = "[pk1] " + message;
    if (level === "error") this.env.console.error(text);
    else if (level === "warn") this.env.console.warn(text);
    else this.env.console.log(text);
  }

  // ---- the page registry --------------------------------------------------------------------------------------

  /** `window.__pk1`: made by whichever game script comes first, shared by all of them, so kept small and stable. */
  private registry(): Registry {
    const win = this.env.win;
    let registry = win.__pk1 as Registry | undefined;
    if (!registry || typeof registry !== "object" || !registry.holders) {
      const made: Registry = {
        v: 1,
        games: {},
        holders: {},
        debug: {},
        clock(key, id, seconds) {
          const holder = made.holders[key];
          if (holder) holder.clock(String(id), String(seconds));
        },
        event(key, name, args) {
          const holder = made.holders[key];
          if (holder) holder.event(String(name), args === undefined || args === null ? "" : String(args));
        },
      };
      registry = made;
      win.__pk1 = made;
    }
    return registry;
  }

  claimGame(slug: string, info: Record<string, unknown>): boolean {
    const registry = this.registry();
    if (Object.prototype.hasOwnProperty.call(registry.games, slug)) return false;
    registry.games[slug] = info;
    return true;
  }

  /**
   * Debugging hooks (state digests, a game's own test helpers such as "remove a cup" or "make me the saboteur") reach
   * the page registry only on a test page: one that set `window.__pk1_debug = true` before the script ran (the Play-mode
   * kit test's page does). A published page never does, so a shipped script exposes nothing to call.
   */
  expose(key: string, hooks: Record<string, unknown> | null): void {
    const registry = this.registry();
    if (hooks && this.env.win.__pk1_debug === true) registry.debug[key] = hooks;
    else delete registry.debug[key];
  }

  onRelay(key: string, handlers: RelayHandlers): Unsubscribe {
    const registry = this.registry();
    const holder = {
      clock: (id: string, seconds: string) => handlers.clock(id, Number(seconds)),
      event: (name: string, args: string) => handlers.event(name, parseEventArgs(args)),
    };
    registry.holders[key] = holder;
    return () => {
      if (registry.holders[key] === holder) delete registry.holders[key];
    };
  }

  relaySend(payload: string): void {
    // injection.js: SendToVisualScripting(id, data) sends JSON.stringify(data), so the graph gets a quoted string.
    this.attempt("relay", () => this.scene.SendToVisualScripting(TAG, payload));
  }

  // ---- ready --------------------------------------------------------------------------------------------------

  whenReady(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.becomeReady();
    return this.readyPromise;
  }

  private async becomeReady(): Promise<void> {
    const { env } = this;
    const loaded = deferred<void>();
    // `bs-loaded` is latched by the SDK: a listener added late is still called.
    env.win.addEventListener("bs-loaded", () => loaded.resolve());
    await loaded.promise;
    // GetInstance() restarts the page's 3 s "scene settled" timer each time it is called before the scene has
    // loaded, and the room is only joined after that timer: call it once and keep the result.
    this.scene = env.BS.Scene.GetInstance();
    this.listen();
    const started = env.now();
    let warned = false;
    while (!this.joined()) {
      if (env.now() - started > this.options.joinTimeoutMs) {
        if (!warned) this.log("warn", "the local player has not joined a room; carrying on as the only player");
        warned = true;
        break;
      }
      await this.sleep(100);
    }
    this.sessionId = this.local().sid;
    this.seedMirror();
    this.watchSession();
    this.observeSnippets();
  }

  /** The local user exists and has a real session id (it reads "local" until the room is joined). */
  private joined(): boolean {
    const user = this.scene.localUser;
    return !!user && typeof user.id === "string" && user.id !== "" && user.id !== "local";
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.env.setTimeout(resolve, ms));
  }

  private watchSession(): void {
    const check = () => {
      const now = this.local().sid;
      if (now !== this.sessionId) {
        this.sessionId = now;
        for (const handler of this.sessionHandlers.slice()) this.attempt("session handler", handler);
      }
      this.env.setTimeout(check, 1000);
    };
    this.env.setTimeout(check, 1000);
  }

  private listen(): void {
    const scene = this.scene;
    const present = scene.users ?? {};
    for (const uid of Object.keys(present)) this.roster.set(uid, present[uid]);
    const on = (name: string, handler: (detail: any) => void) =>
      scene.On(name, (event: any) => {
        try {
          handler(event ? event.detail : undefined);
        } catch (error) {
          this.log("error", `${name} handler: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

    on("space-state", (detail) => this.onSpaceState(detail));
    // The string events carry the same changes; they only matter where the JSON ones do not fire.
    on("space-state-changed", (detail) => {
      if (this.fullSeen || !detail || !Array.isArray(detail.changes)) return;
      for (const change of detail.changes) {
        if (typeof change.property !== "string" || !change.property.startsWith(TAG + ".")) continue;
        this.applyChange(change.property, typeof change.newValue === "string" ? change.newValue : undefined);
      }
    });
    on("space-state-error", (detail) => this.onStateErrorEvent(detail));
    on("user-state-error", (detail) => this.onStateErrorEvent(detail));
    on("one-shot", (detail) => {
      if (!detail || typeof detail.data !== "string") return;
      for (const handler of this.oneShotHandlers.slice()) handler(String(detail.fromId ?? ""), detail.data);
    });
    on("user-joined", (user) => this.emitPlayer("join", user));
    on("user-left", (user) => this.emitPlayer("leave", user));
    on("user-state", (detail) => {
      if (!detail || !Array.isArray(detail.changes)) return;
      const sid = String(detail.id ?? detail.user?.id ?? "");
      for (const change of detail.changes) {
        if (typeof change.path !== "string" || !change.path.startsWith(TAG + ".")) continue;
        const value = change.deleted || typeof change.value !== "string" ? undefined : (change.value as string);
        if (sid === this.local().sid) {
          if (value === undefined) this.ownUser.delete(change.path);
          else this.ownUser.set(change.path, value);
        }
        this.emitUser(sid, change.path, value);
      }
    });
    on("player-teleported", (detail) => {
      if (!detail || !detail.position) return;
      const position = from3(detail.position);
      for (const handler of this.teleportHandlers.slice()) handler(position);
    });
    on("pose-update", (detail) => {
      if (!detail || !detail.head) return;
      const poses: LocalPoses = { head: pose(detail.head), leftHand: pose(detail.leftHand), rightHand: pose(detail.rightHand) };
      for (const handler of this.poseHandlers.slice()) handler(poses);
    });
    const input = (event: InputEvent) => {
      for (const handler of this.inputHandlers.slice()) handler(event);
    };
    on("button-pressed", (d) => input({ type: "button", button: clampInt(d.button, 4) as 0 | 1 | 2 | 3 | 4, side: clampInt(d.side, 1) as HandSide, pressed: true }));
    on("button-released", (d) => input({ type: "button", button: clampInt(d.button, 4) as 0 | 1 | 2 | 3 | 4, side: clampInt(d.side, 1) as HandSide, pressed: false }));
    on("controller-axis-update", (d) => input({ type: "thumbstick", side: clampInt(d.hand, 1) as HandSide, x: Number(d.x) || 0, y: Number(d.y) || 0 }));
    on("trigger-axis-update", (d) => input({ type: "trigger", side: clampInt(d.hand, 1) as HandSide, value: Number(d.value) || 0 }));
    on("key-press", (d) => input({ type: "key", key: this.keyName(d.key), pressed: true }));
    on("key-release", (d) => input({ type: "key", key: this.keyName(d.key), pressed: false }));
  }

  private keyName(code: unknown): string {
    if (!this.keyNames) {
      this.keyNames = {};
      const codes = this.env.BS.KeyCode ?? {};
      for (const name of Object.keys(codes)) if (typeof codes[name] === "number") this.keyNames[codes[name]] = name;
    }
    return this.keyNames[Number(code)] ?? String(code);
  }

  // ---- players ------------------------------------------------------------------------------------------------

  private toPlayer(user: any): PlatformPlayer {
    return { sid: String(user.id ?? ""), uid: String(user.uid ?? ""), name: String(user.name ?? ""), isLocal: user.isLocal === true, isAdmin: user.isSpaceAdmin === true };
  }

  local(): PlatformPlayer {
    const user = this.scene?.localUser;
    if (!user) return { sid: "local", uid: "local", name: "", isLocal: true, isAdmin: false };
    const player = this.toPlayer(user);
    player.isLocal = true;
    if (!player.sid) player.sid = "local";
    return player;
  }

  /**
   * Who is in the room. The page keeps `scene.users` keyed by user id (so two sessions of one account show as
   * one player), and it removes a leaver only after `user-left` has been dispatched: the list is kept here, and
   * each player's fields are read live, because a session id is filled in after the fact.
   */
  players(): PlatformPlayer[] {
    const out: PlatformPlayer[] = [];
    let sawLocal = false;
    for (const user of this.roster.values()) {
      const player = this.toPlayer(user);
      if (player.isLocal) {
        sawLocal = true;
        if (!player.sid) player.sid = "local";
      } else if (!player.sid || player.sid === "local") continue;
      out.push(player);
    }
    if (!sawLocal) out.push(this.local());
    return out;
  }

  onPlayers(handler: (kind: "join" | "leave", player: PlatformPlayer) => void): Unsubscribe {
    return subscribe(this.playerHandlers, handler);
  }

  onSessionChanged(handler: () => void): Unsubscribe {
    return subscribe(this.sessionHandlers, handler);
  }

  private emitPlayer(kind: "join" | "leave", user: any): void {
    if (!user) return;
    const uid = String(user.uid ?? "");
    if (kind === "join") this.roster.set(uid, user);
    else this.roster.delete(uid);
    const player = this.toPlayer(user);
    for (const handler of this.playerHandlers.slice()) this.attempt("player handler", () => handler(kind, player));
  }

  // ---- space state --------------------------------------------------------------------------------------------

  private onSpaceState(detail: any): void {
    if (!detail || !Array.isArray(detail.changes)) return;
    if (detail.full) {
      const next = new Map<string, string>();
      for (const change of detail.changes) {
        if (typeof change.path === "string" && change.path.startsWith(TAG + ".") && !change.deleted && typeof change.value === "string") next.set(change.path, change.value);
      }
      this.replaceMirror(next);
      this.fullSeen = true;
      this.snapshot.resolve(true);
      return;
    }
    for (const change of detail.changes) {
      if (typeof change.path !== "string" || !change.path.startsWith(TAG + ".")) continue;
      this.applyChange(change.path, change.deleted || typeof change.value !== "string" ? undefined : change.value);
    }
  }

  private replaceMirror(next: Map<string, string>): void {
    const gone = [...this.mirror.keys()].filter((path) => !next.has(path));
    for (const path of gone) this.applyChange(path, undefined);
    for (const [path, value] of next) this.applyChange(path, value);
  }

  /** Applies one change to the mirror and tells the listeners, unless the mirror already says so. */
  private applyChange(path: string, value: string | undefined): void {
    if (this.unechoed.has(path)) {
      this.release(path);
      if (this.stateQueue.length) Promise.resolve().then(() => this.pumpState());
    }
    const before = this.mirror.get(path);
    if (before === value) return;
    if (value === undefined) this.mirror.delete(path);
    else this.mirror.set(path, value);
    for (const handler of this.stateHandlers.slice()) {
      if (!path.startsWith(handler.prefix)) continue;
      try {
        handler.fn(path, value);
      } catch (error) {
        this.log("error", `state handler: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * The mirror at the moment the adapter became ready. When the snapshot's own event was missed (the script
   * arrived after it), the page's copy of the state is asked for instead.
   */
  private seedMirror(): void {
    if (this.fullSeen) return;
    const take = (entries: any) => {
      if (this.fullSeen || !entries) return;
      const next = new Map<string, string>(this.mirror);
      for (const scope of ["public", "protected"]) {
        const map = entries[scope];
        if (!map) continue;
        for (const path of Object.keys(map)) if (path.startsWith(TAG + ".") && typeof map[path] === "string") next.set(path, map[path]);
      }
      this.replaceMirror(next);
    };
    take(this.scene.spaceStateJson);
    if (!this.joined()) return; // no room: a snapshot may never come, and whenSnapshot's timeout decides
    this.attemptAsync("SpaceStateGetAll", async () => {
      const all = await this.scene.SpaceStateGetAll();
      take(all);
      this.snapshot.resolve(true);
    }).then((ok) => {
      // UNVERIFIED: that the page's own mirror is complete once the local player has a session id.
      if (!ok) this.snapshot.resolve(true);
    });
  }

  whenSnapshot(timeoutMs: number): Promise<boolean> {
    if (this.snapshot.settled) return this.snapshot.promise;
    const gate = deferred<boolean>();
    const timer = this.env.setTimeout(() => gate.resolve(false), timeoutMs);
    this.snapshot.promise.then((ok) => {
      this.env.clearTimeout(timer);
      gate.resolve(ok);
    });
    return gate.promise;
  }

  stateGet(path: string): string | undefined {
    return this.mirror.get(path);
  }

  stateEntries(prefix: string): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const [path, value] of this.mirror) if (path.startsWith(prefix)) out.push([path, value]);
    return out;
  }

  /**
   * Writes go through the page's string calls (SetPublicSpaceProps / SetProtectedSpaceProps): those are the ones
   * the app queues, merges per key, sends as one batch every 0.2 s for a single rate-limit token, and retries
   * when the bucket is empty. The JSON calls (SpaceStateSet) are sent one by one and are refused outright when
   * the bucket is empty. (Runtime/LocalMultiplayer/State/SpaceStateService.cs.)
   */
  stateSet(path: string, value: string): void {
    this.queueSet(path, value, false);
  }

  stateSetProtected(path: string, value: string): void {
    this.queueSet(path, value, true);
  }

  private queueSet(path: string, value: string, isProtected: boolean): void {
    if (hasDelimiter(value) || hasDelimiter(path)) {
      this.log("error", `a state value for ${path} holds a bridge delimiter character and was not sent`);
      this.emitError(path, "invalid_value", true);
      return;
    }
    const first = this.pendingPublic === null && this.pendingProtected === null;
    if (isProtected) (this.pendingProtected ??= {})[path] = value;
    else (this.pendingPublic ??= {})[path] = value;
    if (!first) return;
    // Everything written in this turn (one action) goes to the app together, as one bridge call, while it fits.
    Promise.resolve().then(() => {
      const pub = this.pendingPublic;
      const prot = this.pendingProtected;
      this.pendingPublic = null;
      this.pendingProtected = null;
      if (pub) this.stateQueue.push({ scope: "public", writes: Object.entries(pub) });
      if (prot) this.stateQueue.push({ scope: "protected", writes: Object.entries(prot) });
      this.pumpState();
    });
  }

  /**
   * Hands queued turns to the app while the bytes it holds that the room has not echoed stay within the budget. The
   * app merges whatever it holds into its next batch (64 writes of up to 16 KiB: over the relay's 256 KiB), and does
   * so even more while it backs off, so the page's own queue is the only place a batch's size can be bounded. A turn
   * bigger than the budget is split (logged once); the leaves of one sync slot are one write each and never split.
   */
  private pumpState(): void {
    const budget = this.options.stateBudgetBytes;
    const now = this.env.now();
    for (const [path, entry] of this.unechoed) {
      if (now - entry.at >= this.options.stateEchoMs) this.release(path);
    }
    while (this.stateQueue.length) {
      const turn = this.stateQueue[0]!;
      const room = budget - this.unechoedBytes;
      const size = (w: [string, string]) => utf8Length(w[0]) + utf8Length(w[1]) + 16;
      const total = turn.writes.reduce((sum, w) => sum + size(w), 0);
      let take: Array<[string, string]>;
      if (total <= room) take = turn.writes.splice(0);
      else if (this.unechoedBytes > 0) break; // wait for what is out to come back
      else {
        // larger than the whole budget: as much as fits (at least one write)
        take = [];
        let bytes = 0;
        while (turn.writes.length && (take.length === 0 || bytes + size(turn.writes[0]!) <= budget)) {
          bytes += size(turn.writes[0]!);
          take.push(turn.writes.shift()!);
        }
        if (!this.warnedSplit) {
          this.warnedSplit = true;
          this.log("info", `one turn wrote ${total} bytes of space state, more than the ${budget} bytes sent at once: it goes in parts`);
        }
      }
      if (!turn.writes.length) this.stateQueue.shift();
      const props: Record<string, string> = {};
      let bytes = 0;
      for (const w of take) {
        props[w[0]] = w[1];
        bytes += size(w);
        if (this.mirror.get(w[0]) === w[1]) continue; // the room has it already: no echo will come
        this.release(w[0]);
        this.unechoed.set(w[0], { bytes: size(w), at: now });
        this.unechoedBytes += size(w);
      }
      this.stateStats.handoffs++;
      this.stateStats.largest = Math.max(this.stateStats.largest, bytes);
      if (turn.scope === "protected") this.attempt("SetProtectedSpaceProps", () => this.scene.SetProtectedSpaceProps(props));
      else this.attempt("SetPublicSpaceProps", () => this.scene.SetPublicSpaceProps(props));
    }
    if (this.stateQueue.length) {
      this.stateStats.deferred++;
      if (!this.stateTimer) {
        this.stateTimer = this.env.setTimeout(() => {
          this.stateTimer = 0;
          this.pumpState();
        }, 250);
      }
    }
  }

  /** A handed-off write came back (or failed, or timed out): it no longer counts against the budget. */
  private release(path: string): void {
    const entry = this.unechoed.get(path);
    if (!entry) return;
    this.unechoed.delete(path);
    this.unechoedBytes -= entry.bytes;
  }

  async stateDelete(path: string): Promise<void> {
    let delay = 250;
    for (let tries = 0; tries < 8; tries++) {
      try {
        await this.scene.SpaceStateDelete(path);
        return;
      } catch (error) {
        const code = errorCode(error);
        if (code === "not_found") return;
        if (code !== "rate_limited" && code !== "timeout") {
          this.emitError(path, code, true);
          return;
        }
        this.emitError(path, code, false);
        await this.sleep(delay);
        delay = Math.min(delay * 2, 4000);
      }
    }
    this.emitError(path, "rate_limited", true);
  }

  onState(prefix: string, handler: (path: string, value: string | undefined) => void): Unsubscribe {
    return subscribe(this.stateHandlers, { prefix, fn: handler });
  }

  onStateError(prefix: string, handler: (path: string, code: string, final: boolean) => void): Unsubscribe {
    return subscribe(this.errorHandlers, { prefix, fn: handler });
  }

  private onStateErrorEvent(detail: any): void {
    if (!detail || typeof detail.key !== "string") return;
    if (detail.key.startsWith(TAG + ".")) this.emitError(detail.key, String(detail.code ?? "internal"), true);
  }

  private emitError(path: string, code: string, final: boolean): void {
    if (final && this.unechoed.has(path)) {
      this.release(path);
      if (this.stateQueue.length) Promise.resolve().then(() => this.pumpState());
    }
    for (const handler of this.errorHandlers.slice()) {
      if (path.startsWith(handler.prefix)) this.attempt("state error handler", () => handler.fn(path, code, final));
    }
  }

  // ---- user state ---------------------------------------------------------------------------------------------

  /**
   * Own user state goes through the JSON calls (UserStateSet / UserStateDelete), which answer per write. They
   * are sent one by one from a separate rate bucket, so writes are merged per leaf here and sent at most every
   * 0.2 s. Where the app offers no user state at all (Play mode on your own), the values are kept locally.
   */
  userSet(path: string, value: string | null): void {
    if (this.localUser) {
      this.setLocalUser(path, value);
      return;
    }
    this.pendingUser.set(path, value);
    this.scheduleUserFlush();
  }

  private scheduleUserFlush(): void {
    if (this.userTimer) return;
    const wait = Math.max(0, this.userLastFlush + Math.max(this.options.userFlushMs, this.userBackoff) - this.env.now());
    this.userTimer = this.env.setTimeout(() => {
      this.userTimer = 0;
      void this.flushUser();
    }, wait);
  }

  private async flushUser(): Promise<void> {
    this.userLastFlush = this.env.now();
    const batch = [...this.pendingUser];
    this.pendingUser.clear();
    let limited = false;
    for (const [path, value] of batch) {
      if (this.localUser) {
        this.setLocalUser(path, value);
        continue;
      }
      try {
        if (value === null) await this.scene.UserStateDelete(path);
        else await this.scene.UserStateSet(path, value);
      } catch (error) {
        const code = errorCode(error);
        if (code === "not_found") continue;
        if (code === "app_unavailable") {
          this.log("info", "no user state in this session: keeping the local player's own values locally");
          this.localUser = new Map();
          this.setLocalUser(path, value);
        } else if (code === "rate_limited" || code === "timeout") {
          limited = true;
          if (!this.pendingUser.has(path)) this.pendingUser.set(path, value);
          this.emitError(path, code, false);
        } else this.emitError(path, code, true);
      }
    }
    this.userBackoff = limited ? Math.min(Math.max(this.userBackoff * 2, 250), 4000) : 0;
    if (this.pendingUser.size) this.scheduleUserFlush();
  }

  private setLocalUser(path: string, value: string | null): void {
    const store = this.localUser!;
    if (value === null) store.delete(path);
    else store.set(path, value);
    const sid = this.local().sid;
    // Told later, as the room's echo would be.
    Promise.resolve().then(() => this.emitUser(sid, path, value === null ? undefined : value));
  }

  userGet(sid: string, path: string): string | undefined {
    if (sid === this.local().sid) {
      if (this.localUser) return this.localUser.get(path);
      const own = this.ownUser.get(path);
      if (own !== undefined) return own;
    }
    for (const user of this.roster.values()) {
      if (user && user.id === sid) {
        const value = user.state ? user.state[path] : undefined;
        return typeof value === "string" ? value : undefined;
      }
    }
    return undefined;
  }

  onUser(prefix: string, handler: (sid: string, path: string, value: string | undefined) => void): Unsubscribe {
    return subscribe(this.userHandlers, { prefix, fn: handler });
  }

  private emitUser(sid: string, path: string, value: string | undefined): void {
    for (const handler of this.userHandlers.slice()) {
      if (path.startsWith(handler.prefix)) this.attempt("user state handler", () => handler.fn(sid, path, value));
    }
  }

  // ---- one-shots ----------------------------------------------------------------------------------------------

  oneShot(data: string): boolean {
    if (utf8Length(data) > this.limits.oneShotMaxBytes) return false;
    this.attempt("OneShot", () => this.scene.OneShot(data));
    return true;
  }

  onOneShot(handler: (fromSid: string, data: string) => void): Unsubscribe {
    return subscribe(this.oneShotHandlers, handler);
  }

  // ---- kit ----------------------------------------------------------------------------------------------------

  async loadKit(spec: KitSpec): Promise<Kit> {
    const BS = this.env.BS;
    const holder = new BS.GameObject(spec.holderName);
    await holder.Async();
    const placement: Record<string, unknown> = {};
    if (spec.position) placement.localPosition = toBs3(BS, spec.position);
    if (spec.rotation) placement.localEulerAngles = toBs3(BS, spec.rotation);
    if (spec.scale) placement.localScale = toBs3(BS, spec.scale);
    if (Object.keys(placement).length) await holder.SetTransform(placement);
    // As vehicle-kits.js does: a bundle component, then a kit item whose path "*" means the bundle's first prefab.
    await holder.AddComponent(new BS.AssetBundle(spec.windows, "", "", spec.android, "", "", false, false));
    const item = new BS.KitItem("*");
    const loaded = deferred<boolean>();
    item.On("loaded", () => loaded.resolve(true));
    await holder.AddComponent(item);
    if (item.isLoaded) loaded.resolve(true);
    const timer = this.env.setTimeout(() => loaded.resolve(false), this.options.kitTimeoutMs);
    const ok = await loaded.promise;
    this.env.clearTimeout(timer);
    if (!ok) this.log("error", `kit ${spec.holderName}: the kit item never reported loaded`);

    // The page only knows objects that carry a BS Object Id: the kit builder puts one on every bound object and on
    // each of its parents, and the page hears of them one by one after `loaded`. They are found by walking
    // `scene.objects` from the kit root (the holder's one child) by parent and name, with retries.
    // (Proven in editor Play mode by spike S1; see spikes/RESULTS.md.)
    const scene = this.scene;
    const childrenOf = (parent: any): any[] => {
      const id = String(parent.unityId);
      return Object.values(scene.objects ?? {}).filter((o: any) => String(o.parent) === id && !o.destroyed);
    };
    const byPath = (root: any, path: string): any => {
      let at = root;
      if (path === "") return at;
      for (const name of path.split("/")) {
        at = childrenOf(at).find((o: any) => o.name === name);
        if (!at) return null;
      }
      return at;
    };
    const found = new Map<string, any>();
    let waiting = spec.objects.slice();
    const deadline = this.env.now() + this.options.kitFindMs;
    for (;;) {
      const roots = childrenOf(holder);
      const root = roots.find((o: any) => o.name === spec.rootName) ?? roots[0];
      if (root) {
        waiting = waiting.filter((object) => {
          const go = byPath(root, object.path);
          if (go) found.set(object.key, go);
          return !go;
        });
      }
      if (!waiting.length || this.env.now() >= deadline) break;
      await this.sleep(200);
    }
    // Last resort for an object the builder gave no id: ask the host for the child at that path, which gives it
    // one (BSScene.InlineJsObject). UNVERIFIED in the app.
    for (const object of waiting) {
      try {
        const go = await holder.AddInlineObject(spec.rootName + "/" + object.path);
        if (go) found.set(object.key, go);
      } catch {
        /* reported below as missing */
      }
    }

    const objects = new Map<string, HostObject>();
    const missing: string[] = [];
    const prepare = async (object: KitObjectSpec): Promise<void> => {
      const go = found.get(object.key);
      if (!go) {
        missing.push(object.key);
        return;
      }
      try {
        // The id first, then the synced components: two copies of a kit must not share ids.
        if (object.networkId) await go.SetNetworkId(object.networkId);
        let synced: any = null;
        let seat: any = null;
        if (object.sync === "transform") {
          synced = await go.AddComponent(
            new BS.SyncedObject({
              syncPosition: true,
              syncRotation: true,
              takeOwnershipOnCollision: false,
              takeOwnershipOnProximity: false,
              takeOwnershipOnGrab: object.grab,
              kinematicIfNotOwned: false,
            }),
          );
        }
        if (object.seat) seat = await go.AddComponent(new BS.Seat({}));
        objects.set(object.key, new BsHostObject(this, object.key, object.path, go, synced, seat, object.networkId, object.attachNetworkId ?? ""));
      } catch (error) {
        this.log("warn", `kit object ${object.key} (${object.path}): ${describe(error)}`);
        missing.push(object.key);
      }
    };
    await Promise.all(spec.objects.map(prepare));
    return {
      objects,
      missing,
      find: async (path) => {
        const roots = childrenOf(holder);
        const root = roots.find((o: any) => o.name === spec.rootName) ?? roots[0];
        const known = root ? byPath(root, path) : null;
        if (known) return new BsHostObject(this, "", path, known, null, null);
        try {
          const go = await holder.AddInlineObject(spec.rootName + "/" + path);
          return go ? new BsHostObject(this, "", path, go, null, null) : null;
        } catch {
          return null;
        }
      },
      destroy: () => {
        try {
          holder.Destroy();
        } catch {
          /* already gone */
        }
      },
    };
  }

  bundles(slug: string): { windows: string; android: string } | null {
    const table = (this.env.win as { __pk1_bundles?: Record<string, { windows?: unknown; android?: unknown }> }).__pk1_bundles;
    const entry = table ? table[slug] : undefined;
    if (!entry) return null;
    const address = (value: unknown) => (typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "");
    const out = { windows: address(entry.windows), android: address(entry.android) };
    return out.windows || out.android ? out : null;
  }

  // ---- snippets -----------------------------------------------------------------------------------------------

  snippets(slug: string): SnippetElement[] {
    const all = Array.from(this.env.doc.querySelectorAll("bs-snippet"));
    const mine = all.filter((el) => (el.getAttribute("name") || "") === slug);
    return mine.map((el, index) => this.wrap(el, slug, index, mine));
  }

  private wrap(el: any, slug: string, index: number, sameName: any[]): SnippetElement {
    let wrapper = this.wrappers.get(el) as (SnippetElement & { _index: number; _peers: any[] }) | undefined;
    if (!wrapper) {
      const made = {
        _index: index,
        _peers: sameName,
        getAttribute: (name: string) => el.getAttribute(name),
        attributeNames: () => (typeof el.getAttributeNames === "function" ? (el.getAttributeNames() as string[]) : []),
        get connected() {
          return el.isConnected !== false;
        },
        get active() {
          // The second copy of a single-instance snippet is skipped by the page, and must be here too.
          const single = el.getAttribute("single");
          if (single === null || single === "false") return true;
          if ("ownsSingleton" in el) return el.ownsSingleton === slug;
          return made._peers.indexOf(el) === 0;
        },
        get index() {
          return made._index;
        },
      };
      wrapper = made;
      this.wrappers.set(el, made);
    }
    wrapper._index = index;
    wrapper._peers = sameName;
    return wrapper;
  }

  onSnippetsChanged(handler: () => void): Unsubscribe {
    return subscribe(this.snippetHandlers, handler);
  }

  private observeSnippets(): void {
    if (this.observer || !this.env.MutationObserver) return;
    let queued = false;
    const observer = new this.env.MutationObserver(() => {
      if (queued) return;
      queued = true;
      this.env.setTimeout(() => {
        queued = false;
        for (const handler of this.snippetHandlers.slice()) this.attempt("snippet handler", handler);
      }, 0);
    });
    observer.observe(this.env.doc.documentElement, { childList: true, subtree: true });
    this.observer = observer;
  }

  // ---- the local player ---------------------------------------------------------------------------------------

  async isVR(): Promise<boolean> {
    try {
      return (await this.scene.IsVR()) === true;
    } catch {
      return false;
    }
  }

  async raycast(origin: Vector3, direction: Vector3, maxDistance: number, layerMask: number): Promise<RayHit | null> {
    const BS = this.env.BS;
    const reply = await this.scene.Raycast(toBs3(BS, origin), toBs3(BS, direction), maxDistance, layerMask);
    if (typeof reply !== "string") return null;
    // "A string of ¶-separated values: a command code, the id of the object hit, the point, the normal."
    const parts = reply.split("¶");
    if (parts.length < 8) return null;
    const n = parts.slice(2, 8).map(Number);
    return { objectId: parts[1]!, point: new Vector3(n[0], n[1], n[2]), normal: new Vector3(n[3], n[4], n[5]) };
  }

  onPose(handler: (poses: LocalPoses) => void): Unsubscribe {
    return subscribe(this.poseHandlers, handler);
  }

  onTeleported(handler: (position: Vector3) => void): Unsubscribe {
    return subscribe(this.teleportHandlers, handler);
  }

  localPosition(): Promise<Vector3 | null> {
    if (!this.headReading) this.headReading = this.readHead();
    return this.headReading;
  }

  /**
   * The page has no call that answers where the local player is. A throwaway object attached to the local
   * player's head (BS.AttachedObject, NonPhysics, attachment point Head = 0) is moved there by the app; its
   * transform, read once, is the head's position. The object starts at the origin, so the first reading away
   * from it is the answer. Then the object goes. UNVERIFIED in the app (checked in editor Play mode only, see
   * spikes/RESULTS.md S7).
   */
  private async readHead(): Promise<Vector3 | null> {
    const BS = this.env.BS;
    const uid = this.local().uid;
    let probe: any = null;
    const answer = deferred<Vector3 | null>();
    const timer = this.env.setTimeout(() => answer.resolve(null), this.options.headProbeMs);
    try {
      probe = new BS.GameObject("pk1-head-probe");
      await probe.Async();
      const attached = await probe.AddComponent(
        new BS.AttachedObject({
          uid,
          attachmentPosition: new BS.Vector3(0, 0, 0),
          attachmentRotation: new BS.Quaternion(0, 0, 0, 1),
          attachmentType: 1, // NonPhysics
          attachmentPoint: 0, // Head
          autoSync: false,
          jointAvatar: false,
        }),
      );
      const PN = this.api.PN ?? this.api.PropertyName;
      const look = () => {
        const p = probe.transform?.position;
        if (p && (Number(p.x) || Number(p.y) || Number(p.z))) answer.resolve(from3(p));
      };
      await probe.WatchTransform([PN.position], look);
      await attached.Attach(uid);
      look();
      return await answer.promise;
    } catch (error) {
      this.log("info", `the local position could not be read at start: ${describe(error)}`);
      return null;
    } finally {
      this.env.clearTimeout(timer);
      answer.resolve(null);
      if (probe) {
        try {
          probe.Destroy();
        } catch {
          /* gone already */
        }
      }
    }
  }

  onInput(handler: (event: InputEvent) => void): Unsubscribe {
    return subscribe(this.inputHandlers, handler);
  }

  haptic(side: HandSide, strength: number, seconds: number): void {
    this.attempt("SendHapticImpulse", () => this.scene.SendHapticImpulse(strength, seconds, side));
  }

  teleport(position: Vector3, yDegrees: number, stopMovement: boolean): void {
    this.attempt("TeleportTo", () => this.scene.TeleportTo(toBs3(this.env.BS, position), yDegrees, stopMovement));
  }

  setAbility(ability: Ability, allowed: boolean): void {
    this.attempt("SetCan" + ability, () => this.scene["SetCan" + ability](allowed));
  }

  setBlock(control: BlockableControl, blocked: boolean): void {
    this.attempt("SetBlock" + control, () => this.scene["SetBlock" + control](blocked));
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** Runs a bridge call whose result nobody waits for; a failure is logged, never thrown into game code. */
  attempt(what: string, call: () => unknown): void {
    try {
      const result = call();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).then(undefined, (error) => this.log("warn", `${what} failed: ${describe(error)}`));
      }
    } catch (error) {
      this.log("warn", `${what} failed: ${describe(error)}`);
    }
  }

  private async attemptAsync(what: string, call: () => Promise<void>): Promise<boolean> {
    try {
      await call();
      return true;
    } catch (error) {
      this.log("debug", `${what} failed: ${describe(error)}`);
      return false;
    }
  }

  /** @internal for BsHostObject */
  get api(): any {
    return this.env.BS;
  }

  /** @internal for BsHostObject */
  userSession(user: any): string | undefined {
    return user && typeof user.id === "string" ? user.id : undefined;
  }
}

class BsHostObject implements HostObject {
  readonly key: string;
  readonly path: string;
  private readonly platform: BsPlatform;
  private readonly go: any;
  private readonly synced: any;
  private readonly seat: any;
  private readonly watchers: Array<(pose: Pose) => void> = [];
  private watching = false;
  private readonly attachNetworkId: string;
  private hasNetworkId: boolean;

  constructor(platform: BsPlatform, key: string, path: string, go: any, synced: any, seat: any, networkId = "", attachNetworkId = "") {
    this.platform = platform;
    this.key = key;
    this.path = path;
    this.go = go;
    this.synced = synced;
    this.seat = seat;
    this.hasNetworkId = networkId !== "";
    this.attachNetworkId = attachNetworkId;
  }

  on(kind: HostEventKind, handler: (detail: HostEventDetail) => void): Unsubscribe {
    const name = HOST_EVENTS[kind];
    if (!name) return () => {}; // UI kinds reach the page through a graph, not through the object
    const listener = (event: any) => {
      const d = event && event.detail ? event.detail : {};
      const detail: HostEventDetail = {};
      if (d.point) detail.point = from3(d.point);
      if (d.normal) detail.normal = from3(d.normal);
      if (typeof d.side === "number") detail.side = d.side;
      if (typeof d.name === "string") detail.otherName = d.name;
      const sid = this.platform.userSession(d.user);
      if (sid) detail.playerSid = sid;
      handler(detail);
    };
    this.go.On(name, listener);
    return () => this.go.Off(name, listener);
  }

  setTransform(patch: TransformPatch): void {
    const BS = this.platform.api;
    const out: Record<string, unknown> = {};
    if (patch.position) out.position = toBs3(BS, patch.position);
    if (patch.localPosition) out.localPosition = toBs3(BS, patch.localPosition);
    if (patch.localScale) out.localScale = toBs3(BS, patch.localScale);
    if (patch.rotation) out.rotation = new BS.Quaternion(patch.rotation.x, patch.rotation.y, patch.rotation.z, patch.rotation.w);
    if (patch.localRotation) out.localRotation = new BS.Quaternion(patch.localRotation.x, patch.localRotation.y, patch.localRotation.z, patch.localRotation.w);
    this.platform.attempt("SetTransform", () => this.go.SetTransform(out));
  }

  /**
   * Asking to watch a transform makes the host push its current value before it answers
   * (BSScene.WatchJsTransform calls SyncProperties(true)), so one round trip is a fresh read.
   * UNVERIFIED in the app: that the push reaches the page before the answer does.
   */
  async readTransform(): Promise<Pose | null> {
    const PN = this.platform.api.PN ?? this.platform.api.PropertyName;
    try {
      await this.go.WatchTransform([PN.position, PN.rotation], () => this.report());
      this.watching = true;
    } catch {
      return null;
    }
    return this.current();
  }

  watchTransform(handler: (pose: Pose) => void): Unsubscribe {
    this.watchers.push(handler);
    if (!this.watching) void this.readTransform();
    return () => {
      const at = this.watchers.indexOf(handler);
      if (at >= 0) this.watchers.splice(at, 1);
    };
  }

  private current(): Pose | null {
    const t = this.go.transform;
    if (!t || !t.position) return null;
    const r = t.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
    return { position: from3(t.position), rotation: new Quaternion(Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0, r.w === undefined ? 1 : Number(r.w)) };
  }

  private report(): void {
    const now = this.current();
    if (now) for (const watcher of this.watchers.slice()) watcher(now);
  }

  setActive(active: boolean): void {
    this.platform.attempt("SetActive", () => this.go.SetActive(active));
  }

  setLayer(layer: number): void {
    this.platform.attempt("SetLayer", () => this.go.SetLayer(layer));
  }

  takeOwnership(): void {
    if (this.synced) this.platform.attempt("TakeOwnership", () => this.synced.TakeOwnership());
  }

  async doIOwn(): Promise<boolean> {
    if (!this.synced) return false;
    try {
      return (await this.synced.DoIOwn()) === true;
    } catch {
      return false;
    }
  }

  /** UNVERIFIED: that a kit object's own BSAudioSource is known to the page once the object is. */
  playClip(index: number): void {
    const BS = this.platform.api;
    const source = this.go.GetComponent ? this.go.GetComponent((BS.CT ?? BS.ComponentType).AudioSource) : null;
    if (source) this.platform.attempt("PlayOneShot", () => source.PlayOneShot(index));
    else this.platform.log("warn", `no audio source known on ${this.path}`);
  }

  sit(): void {
    if (this.seat) this.platform.attempt("Sit", () => this.seat.Sit());
  }

  stand(): void {
    if (this.seat) this.platform.attempt("Stand", () => this.seat.Stand());
  }

  private attached: any = null;

  /** UNVERIFIED in Play mode: BS.AttachedObject added to a kit object, attachment point set, then Attach(local user id). */
  attachToHand(side: HandSide, position: Vector3, rotation: Quaternion): void {
    this.attach(side === 0 ? 1 : 2, position, rotation, false); // LeftHand, RightHand
  }

  /** UNVERIFIED in Play mode: as attachToHand, at the head (attachment point 0); with autoSync the app shows it to others. */
  attachToHead(position: Vector3, rotation: Quaternion, autoSync: boolean): void {
    this.attach(0, position, rotation, autoSync);
  }

  private attach(point: number, position: Vector3, rotation: Quaternion, autoSync: boolean): void {
    const BS = this.platform.api;
    const uid = this.platform.local().uid;
    void (async () => {
      try {
        if (autoSync && !this.hasNetworkId && this.attachNetworkId) {
          await this.go.SetNetworkId(this.attachNetworkId);
          this.hasNetworkId = true;
        }
        if (!this.attached) {
          this.attached = await this.go.AddComponent(
            new BS.AttachedObject({
              uid,
              attachmentPosition: new BS.Vector3(position.x, position.y, position.z),
              attachmentRotation: new BS.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
              attachmentType: 1, // NonPhysics
              attachmentPoint: point, // Head 0, LeftHand 1, RightHand 2
              autoSync,
              jointAvatar: false,
            }),
          );
        } else {
          this.attached.attachmentPoint = point;
          this.attached.attachmentPosition = new BS.Vector3(position.x, position.y, position.z);
          this.attached.attachmentRotation = new BS.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
          this.attached.autoSync = autoSync;
        }
        await this.attached.Attach(uid);
      } catch (error) {
        this.platform.log("warn", `AttachedObject on ${this.path}: ${String(error)}`);
      }
    })();
  }

  detach(): void {
    if (!this.attached) return;
    const uid = this.platform.local().uid;
    this.platform.attempt("Detach", () => this.attached.Detach(uid));
  }

  releaseGrab(): void {
    this.platform.attempt("ReleaseGrab", () => this.go.ReleaseGrab());
  }
}

function subscribe<T>(list: T[], item: T): Unsubscribe {
  list.push(item);
  return () => {
    const at = list.indexOf(item);
    if (at >= 0) list.splice(at, 1);
  };
}

function toBs3(BS: any, v: Vector3): unknown {
  return new BS.Vector3(v.x, v.y, v.z);
}

function from3(v: any): Vector3 {
  return new Vector3(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0);
}

function pose(source: any): Pose {
  const p = source?.position ?? {};
  const r = source?.rotation ?? {};
  return { position: from3(p), rotation: new Quaternion(Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0, r.w === undefined ? 1 : Number(r.w)) };
}

function clampInt(value: unknown, max: number): number {
  const n = Math.trunc(Number(value) || 0);
  return n < 0 ? 0 : n > max ? max : n;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  return "internal";
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}
