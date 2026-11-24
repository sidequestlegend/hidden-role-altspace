// The seam between the runtime and the world it runs in. Everything above this file is plain logic that reads a
// local mirror synchronously and writes fire-and-forget; everything that knows about `window.BS` is below it,
// in platform/bs.ts.

import type { Quaternion, Vector3 } from "./values.ts";

export type Unsubscribe = () => void;

/** Time and timers. The app's are the page's; tests drive a virtual one. */
export interface Clock {
  /** Milliseconds on a monotonic local clock. */
  now(): number;
  /** Seconds of UTC wall time, used only until the synced clock has answered. */
  wallSeconds(): number;
  setTimeout(fn: () => void, ms: number): number; // lint-ok
  clearTimeout(handle: number): void; // lint-ok
}

export interface Limits {
  /** Bytes one encoded space-state leaf may take (RELAY.md: 16384). */
  maxLeafBytes: number;
  /** Space-state keys per room (2048). */
  maxRoomKeys: number;
  /** UTF-8 bytes of one-shot text (4096 minus the topic: 4089). */
  oneShotMaxBytes: number;
  /** User-state leaves a page may hold per player (the app keeps 64 of the server's 128 for itself). */
  maxUserKeys: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxLeafBytes: 16384,
  maxRoomKeys: 2048,
  oneShotMaxBytes: 4089,
  maxUserKeys: 64,
};

/** Someone in the room, as the platform reports them. `sid` is the session id of this visit, `uid` the stable id. */
export interface PlatformPlayer {
  sid: string;
  uid: string;
  name: string;
  isLocal: boolean;
  /**
   * The space's owner, a moderator of its community, or a platform admin: who may write protected state.
   * A modified client can claim it for itself; the room does not take its word.
   */
  isAdmin: boolean;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}

/** WebCrypto, as much of it as the secrets module uses. */
export interface CryptoLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subtle: any;
  getRandomValues<T extends Uint8Array>(array: T): T;
}

export interface RayHit {
  /** The platform's id of the object hit (not a binding key). */
  objectId: string;
  point: Vector3;
  normal: Vector3;
}

export interface Pose {
  position: Vector3;
  rotation: Quaternion;
}

export interface LocalPoses {
  head: Pose;
  leftHand: Pose;
  rightHand: Pose;
}

/** Hands, numbered as BS.HandSide. */
export const Hand = { Left: 0, Right: 1 } as const;
export type HandSide = 0 | 1;

/** Controller buttons, numbered as BS.ButtonType. */
export const Button = { Trigger: 0, Grip: 1, Primary: 2, Secondary: 3, ThumbstickClick: 4 } as const;
export type ButtonName = 0 | 1 | 2 | 3 | 4;

/** The local player's scene-level input. Controller events only exist in a headset; keys only on a keyboard. */
export type InputEvent =
  | { type: "button"; button: ButtonName; side: HandSide; pressed: boolean }
  | { type: "thumbstick"; side: HandSide; x: number; y: number }
  | { type: "trigger"; side: HandSide; value: number }
  /** `key` is the Unity KeyCode name: "W", "Space", "LeftShift", "Alpha1". */
  | { type: "key"; key: string; pressed: boolean };

/** What the local player may be stopped from doing (`scene.SetCan...`). The lock stays until it is lifted. */
export type Ability = "Move" | "Rotate" | "Crouch" | "Teleport" | "Grapple" | "Jump" | "Grab";

/** Controls the app can be stopped from using itself, so a game can (`scene.SetBlock...`). */
export type BlockableControl =
  | "LeftThumbstick"
  | "RightThumbstick"
  | "LeftPrimary"
  | "RightPrimary"
  | "LeftSecondary"
  | "RightSecondary"
  | "LeftThumbstickClick"
  | "RightThumbstickClick"
  | "LeftTrigger"
  | "RightTrigger";

// ---- kit ------------------------------------------------------------------------------------------------------

export type HostEventKind =
  | "click"
  | "grab"
  | "drop"
  | "triggerEnter"
  | "triggerExit"
  | "collisionEnter"
  | "collisionExit"
  | "uiButton"
  | "uiSlider"
  | "uiToggle"
  /** The trigger and buttons of the hand that holds the object (BS.HeldEvents, relayed by a graph). */
  | "heldTrigger"
  | "heldPrimary"
  | "heldSecondary"
  /** The text of a TMP_InputField after an edit (relayed by the graph): `arg` is the text. */
  | "field";

export interface HostEventDetail {
  point?: Vector3;
  normal?: Vector3;
  /**
   * Which hand: 0 left, 1 right. For grab and drop, as the platform says; for a click, inferred by the runtime (the
   * platform's click names no hand: the hand whose trigger went down in the last second, else the nearest hand).
   */
  side?: number;
  /** The session id of the player whose body caused a trigger or collision, when it was a player. */
  playerSid?: string;
  /** The other object's name, for trigger and collision events. */
  otherName?: string;
  /** The value a graph sent with the event: a slider's position, a toggle's "1" or "0". */
  arg?: string;
  /** Every argument a graph sent after the target, decoded (`arg` is the first). */
  args?: string[];
}

export interface TransformPatch {
  position?: Vector3;
  rotation?: Quaternion;
  localPosition?: Vector3;
  localRotation?: Quaternion;
  localScale?: Vector3;
}

/** One object of the kit, found by its path. Calls are fire-and-forget unless they return a promise. */
export interface HostObject {
  readonly key: string;
  readonly path: string;
  on(kind: HostEventKind, handler: (detail: HostEventDetail) => void): Unsubscribe;
  setTransform(patch: TransformPatch): void;
  /** Reads the object's current world position and rotation from the host. */
  readTransform(): Promise<Pose | null>;
  /** Reports the object's world pose whenever the host says it moved (a held or simulated object). */
  watchTransform(handler: (pose: Pose) => void): Unsubscribe;
  setActive(active: boolean): void;
  /**
   * Moves the object to another layer (`obj.SetLayer`): 20 (Grabbable) makes a grabbable object grabbable, 5 (UI)
   * makes it clickable and lets hands pass through it. The way to switch a pickup off and on (VRChat: `pickupable`).
   */
  setLayer(layer: number): void;
  /** Asks to own the object's synced transform. There is no event when ownership moves. */
  takeOwnership(): void;
  doIOwn(): Promise<boolean>;
  /** Plays clip `index` of the object's audio source. */
  playClip(index: number): void;
  sit(): void;
  stand(): void;
  releaseGrab(): void;
  /**
   * Attaches the object to the local player's hand (0 left, 1 right) with an offset, through `BS.AttachedObject`
   * (NonPhysics, attachment point LeftHand / RightHand, `Attach(<local user id>)`); `detach` lets it go. Local player only.
   */
  attachToHand(side: HandSide, position: Vector3, rotation: Quaternion): void;
  detach(): void;
}

export interface KitObjectSpec {
  key: string;
  path: string;
  /** Set before any synced component is added; empty when the object needs none. */
  networkId: string;
  sync: "none" | "transform";
  grab: boolean;
  click: boolean;
  seat: boolean;
}

export interface KitSpec {
  /** `pk1:<slug>:<inst>` */
  holderName: string;
  /** The instantiated prefab's name under the holder: `<prefab>(Clone)`. */
  rootName: string;
  windows: string;
  android: string;
  position: Vector3 | null;
  /** Euler degrees. */
  rotation: Vector3 | null;
  scale: Vector3 | null;
  objects: KitObjectSpec[];
}

export interface Kit {
  /** Objects that resolved, by binding key. A key that did not resolve is absent and listed in `missing`. */
  readonly objects: ReadonlyMap<string, HostObject>;
  readonly missing: readonly string[];
  /** An object the bindings do not list, by its path under the kit root (one made at run time). */
  find(path: string): Promise<HostObject | null>;
  destroy(): void;
}

// ---- snippets -------------------------------------------------------------------------------------------------

/** A `<bs-snippet>` element of this game, as much as the runtime reads from it. */
export interface SnippetElement {
  getAttribute(name: string): string | null;
  attributeNames(): string[];
  /** False once the element has left the page. */
  readonly connected: boolean;
  /** False for the second copy of a `single` snippet, which the page skips. */
  readonly active: boolean;
  /** Position among the page's elements with the same `name`, in document order. */
  readonly index: number;
}

// ---- what a graph sends back ----------------------------------------------------------------------------------

export interface RelayHandlers {
  /** Reply to the `clock` op: the request id and `BS.SyncedClock.NowSeconds`. */
  clock(requestId: string, seconds: number): void;
  /** `window.__pk1.event("<slug>:<inst>", "<name>", "<arg>|<arg>...")` from any graph, arguments already decoded. */
  event(name: string, args: string[]): void;
}

// ---- the platform ---------------------------------------------------------------------------------------------

export interface Platform {
  readonly clock: Clock;
  readonly limits: Limits;
  readonly storage: KeyValueStore;
  readonly crypto: CryptoLike;
  random(): number;
  log(level: LogLevel, message: string): void;

  /** Resolves once the page API is up and the local player is in the room. */
  whenReady(): Promise<void>;
  local(): PlatformPlayer;
  players(): PlatformPlayer[];
  onPlayers(handler: (kind: "join" | "leave", player: PlatformPlayer) => void): Unsubscribe;
  /** The local session id changed after `whenReady` (a reconnect that could not resume): instances restart. */
  onSessionChanged(handler: () => void): Unsubscribe;

  /** Resolves true once the first full space-state snapshot is in the mirror, false if `timeoutMs` passed first. */
  whenSnapshot(timeoutMs: number): Promise<boolean>;
  /** Mirror reads. Only string leaves under the `pk1.` root are mirrored, public and protected alike. */
  stateGet(path: string): string | undefined;
  stateEntries(prefix: string): Array<[string, string]>;
  /** Queues a string leaf. Latest value wins per path; the echo arrives through `onState`, the writer's included. */
  stateSet(path: string, value: string): void;
  /**
   * Queues a protected leaf: only the space's owner and moderators can write it, everyone can read it, and the
   * path stays protected for the room's life. From anyone else the room refuses it (`onStateError`).
   */
  stateSetProtected(path: string, value: string): void;
  /** Removes a path and everything under it. Resolves when the server has done it (or it was not there). */
  stateDelete(path: string): Promise<void>;
  /** Changes under `prefix`, in the order the server made them. `value` is undefined for a delete. */
  onState(prefix: string, handler: (path: string, value: string | undefined) => void): Unsubscribe;
  /**
   * A write under `prefix` (space or user state) the room did not take. `final` is false when it is only late:
   * the rate bucket was full and the write is still queued.
   */
  onStateError(prefix: string, handler: (path: string, code: string, final: boolean) => void): Unsubscribe;

  /** The local player's own user state. `null` removes the leaf. */
  userSet(path: string, value: string | null): void;
  userGet(sid: string, path: string): string | undefined;
  onUser(prefix: string, handler: (sid: string, path: string, value: string | undefined) => void): Unsubscribe;

  /** Sends text to everyone else in the room. False when it was too large to send. */
  oneShot(data: string): boolean;
  onOneShot(handler: (fromSid: string, data: string) => void): Unsubscribe;

  /** `scene.SendToVisualScripting("pk1", payload)`. */
  relaySend(payload: string): void;
  /** Registers what a kit's graphs call back, under `<slug>:<inst>` in the page registry. */
  onRelay(key: string, handlers: RelayHandlers): Unsubscribe;

  loadKit(spec: KitSpec): Promise<Kit>;
  /**
   * Bundle addresses for a game that the page was given at release (`window.__pk1_bundles["<slug>"]`), or null.
   * They rank after an element's own `windows` / `android` attributes and before bindings.bundles.
   */
  bundles(slug: string): { windows: string; android: string } | null;

  /** This game's elements currently on the page, in document order. */
  snippets(slug: string): SnippetElement[];
  onSnippetsChanged(handler: () => void): Unsubscribe;

  raycast(origin: Vector3, direction: Vector3, maxDistance: number, layerMask: number): Promise<RayHit | null>;
  /** The local player's head and hands. Sent while they move; nothing arrives while they keep still. */
  onPose(handler: (poses: LocalPoses) => void): Unsubscribe;
  /** Buttons, thumbsticks, triggers and keys of the local player. */
  onInput(handler: (event: InputEvent) => void): Unsubscribe;
  /** Buzzes a controller: strength 0 to 1, for `seconds`. Does nothing on desktop. */
  haptic(side: HandSide, strength: number, seconds: number): void;
  /** True in a headset (`scene.IsVR()`), false on desktop or when the app does not say. */
  isVR(): Promise<boolean>;
  /** Moves the local player: where to, which way they face (degrees about Y), and whether their movement stops. */
  teleport(position: Vector3, yDegrees: number, stopMovement: boolean): void;
  /** Allows or stops one of the local player's abilities. A snippet must put back what it changed. */
  setAbility(ability: Ability, allowed: boolean): void;
  /** Stops the app using a control itself (true) or gives it back (false). */
  setBlock(control: BlockableControl, blocked: boolean): void;

  /**
   * The page registry (`window.__pk1`): claims the slug for this script. False when another copy of the script
   * already serves it, in which case this copy must do nothing.
   */
  claimGame(slug: string, info: Record<string, unknown>): boolean;
  /** Publishes debugging hooks for one instance in the page registry (state digest for Play-mode tests). */
  expose(key: string, hooks: Record<string, unknown> | null): void;
}
