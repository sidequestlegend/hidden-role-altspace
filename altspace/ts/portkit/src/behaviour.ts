// The base class translated gameplay files extend: the parts of UdonSharpBehaviour that game rules use.
//
//   class DefaultRules extends Behaviour {
//     static synced = ["anarchy"];           // [UdonSynced] fields: plain fields, sent by RequestSerialization()
//     anarchy = false;
//     SetAnarchy(enabled: boolean) {
//       this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
//       this.anarchy = enabled;
//       this.RequestSerialization();
//     }
//   }
//
// Fields named in bindings.json are assigned after construction and before Start(). A subclass that redeclares
// one of the members below must use `declare`, or the field definition would hide it.

import type { HostActions } from "./host.ts";
import type { Networking } from "./networking.ts";
import type { Persistence } from "./persistence.ts";
import type { PlayerDataView } from "./peruser.ts";
import type { Player } from "./players.ts";
import type { GameObject, Transform } from "./scene.ts";
import type { DrawState, Secrets } from "./secrets.ts";
import type { Ability, BlockableControl, ButtonName, HandSide, LocalPoses, RayHit } from "./types.ts";
import type { StartKind } from "./networking.ts";
import type { Vector2, Vector3 } from "./values.ts";

/** Who a network event goes to. `All` runs it here first, then everywhere else. */
export const NetworkEventTarget = { All: "All", Owner: "Owner" } as const;
export type NetworkEventTargetName = (typeof NetworkEventTarget)[keyof typeof NetworkEventTarget];

export interface SerializationResult {
  success: boolean;
  byteCount: number;
}

export interface DeserializationResult {
  /**
   * True when these are the values the behaviour already had when this client first saw it (joining late), not a
   * change that just happened. Code that treats a synced field as a command must not act on a snapshot.
   */
  isSnapshot: boolean;
  /** True when the fields were put back because this client lost a race for ownership. */
  isRollback: boolean;
}

/** A write the room did not take. `final` is false when the runtime keeps trying (a full rate bucket). */
export interface WriteRefusal {
  /** What was being written: synced fields, a network event, player data, a per-player behaviour, a protected value. */
  kind: "state" | "event" | "playerData" | "playerObject" | "protected";
  /** value_too_large, too_many_keys, rate_limited, oneshot_too_large, not_authorized, or another server code. */
  code: string;
  /** The state path or event name involved. */
  key: string;
  final: boolean;
}

export interface TimeView {
  /** Seconds since this instance started. */
  readonly time: number;
  /** Seconds the current tick covers: 0.05 unless the page stalled. */
  readonly deltaTime: number;
  /** Ticks since this instance started. */
  readonly frameCount: number;
}

export interface RandomView {
  /** In [0, 1). */
  readonly value: number;
  /** A float in [min, max). */
  Range(min: number, max: number): number;
  /** An integer in [min, max), as C#'s Random.Range(int, int). */
  RangeInt(min: number, max: number): number;
  /**
   * `n` bytes from the strong generator (WebCrypto's getRandomValues; seeded in the fake room). For a seed nobody
   * can predict; for a value other players must be able to trust, use a fair draw (Secrets).
   */
  Bytes(n: number): Uint8Array;
}

/** The local player's input, as last reported. Controller input only exists in a headset. */
export interface InputView {
  GetButton(button: ButtonName, side: HandSide): boolean;
  /** The thumbstick, each axis -1 to 1. */
  GetThumbstick(side: HandSide): Vector2;
  /** How far the trigger is pressed, 0 to 1. */
  GetTrigger(side: HandSide): number;
  /** `key` is a Unity KeyCode name: "W", "Space", "LeftShift". */
  GetKey(key: string): boolean;
  /** Head and hand poses, or null before the first report (they are only sent while the player moves). */
  readonly Poses: LocalPoses | null;
  /** Buzzes one controller (0 left, 1 right): strength 0 to 1. Does nothing on desktop. */
  Haptic(side: HandSide, strength: number, seconds: number): void;
  /**
   * The hand of the click being handled, or of the last click: 0 left, 1 right, null when it cannot be told
   * (desktop, or no trigger press or hand pose to go by). The platform's click event names no hand, so it is
   * inferred: the hand whose trigger went down within the last second, else the hand nearest the click point.
   */
  readonly LastClickSide: HandSide | null;
  /** True in a headset, false on desktop; null until the app has answered (scene.IsVR, asked once at start). */
  readonly IsVR: boolean | null;
  /**
   * True when `point` is within `metres` of the nearest of the local head and hands (as last reported), the
   * measure clicks use. True when no pose is known yet, or `metres` is 0 or less.
   */
  InReach(point: Vector3, metres: number): boolean;
  /** Moves the local player: position, the way they face (degrees about Y), and whether to stop their movement. */
  TeleportTo(position: Vector3, yDegrees: number, stopMovement?: boolean): void;
  /**
   * Where the local player is: their head as last reported, or where they were last teleported to. Null before
   * either. (The page is told the head's pose only while the player moves.)
   */
  readonly Position: Vector3 | null;
  /**
   * Allows or stops moving, turning, crouching, teleporting, grappling, jumping or grabbing for the local
   * player (scene.SetCanMove and its relatives). What an instance stops, it allows again when it goes away.
   */
  SetAbility(ability: Ability, allowed: boolean): void;
  /** Stops the app using a control itself, so the game can (scene.SetBlock...). Given back when the instance goes away. */
  SetBlock(control: BlockableControl, blocked: boolean): void;
}

/** Values only the world's owner and moderators can write and everyone can read (protected space state). */
export interface ProtectedView {
  /** True when the local player may write protected values. A modified client can claim it; the room still checks. */
  readonly CanWrite: boolean;
  /** Writes a value. From a player who may not, the room refuses it and OnWriteRefused reports that. */
  Set(key: string, value: unknown): void;
  Get<T>(key: string, fallback: T): T;
  Has(key: string): boolean;
}

export interface DebugView {
  Log(message: unknown): void;
  LogWarning(message: unknown): void;
  LogError(message: unknown): void;
}

/** What the running instance gives a behaviour. Implemented by GameInstance. */
export interface BehaviourLink {
  readonly id: string;
  readonly gameObject: GameObject;
  readonly networking: Networking;
  readonly time: TimeView;
  readonly random: RandomView;
  readonly debug: DebugView;
  readonly secrets: Secrets;
  readonly storage: Persistence;
  readonly host: HostActions;
  readonly settings: ReadonlyMap<string, string>;
  readonly playerData: PlayerDataView;
  readonly input: InputView;
  readonly protectedValues: ProtectedView;
  /** The player a per-player behaviour belongs to; null for an ordinary behaviour. */
  readonly player: Player | null;
  readonly instanceKey: string;
  readonly shared: Record<string, unknown>;
  /** Click reach set at run time, per behaviour. */
  readonly reach: Map<Behaviour, number>;
  requestSerialization(): void;
  sendNetworkEvent(target: NetworkEventTargetName, name: string, args: unknown[]): void;
  sendCommand(name: string, args: unknown[]): number;
  delaySeconds(name: string, seconds: number): void;
  delayFrames(name: string, frames: number): void;
  find(id: string): Behaviour | null;
  findByType(type: string): Behaviour[];
  playerBehaviour(player: Player, type: string): Behaviour | null;
  playerBehaviours(type: string): Behaviour[];
  raycast(origin: Vector3, direction: Vector3, maxDistance: number, layerMask: number): Promise<RayHit | null>;
  onGraphEvent(name: string, method: string): void;
}

const LINK = Symbol("pk1.link");

/** @internal Used by the instance when it creates a behaviour. */
export function linkBehaviour(behaviour: Behaviour, link: BehaviourLink): void {
  Object.defineProperty(behaviour, LINK, { value: link, enumerable: false, configurable: true, writable: false });
}

function linkOf(behaviour: Behaviour): BehaviourLink {
  const link = (behaviour as unknown as Record<symbol, BehaviourLink | undefined>)[LINK];
  if (!link) throw new Error("this behaviour is not part of a running instance yet (do not use the runtime in a constructor or a field initialiser)");
  return link;
}

export abstract class Behaviour {
  /** Names of the fields that are synced. Values must be JSON data, arrays of it, or the value types of values.ts. */
  static synced: readonly string[] = [];
  /** "manual": sent by RequestSerialization(). "continuous": sent when changed, a few times a second. */
  static syncMode: "manual" | "continuous" | "none" = "manual";
  /**
   * UdonSharp's [FieldChangeCallback]: synced field name -> the property to assign instead. When a received
   * value differs from the field's current one, the property's setter is called with it (and must store it);
   * local code gets the same effect by assigning through the property.
   *
   *   static synced = ["_open"];
   *   static fieldChangeCallbacks = { _open: "Open" };
   *   _open = false;
   *   get Open() { return this._open; }
   *   set Open(value: boolean) { this._open = value; this.door.SetActive(!value); }
   */
  static fieldChangeCallbacks: Readonly<Record<string, string>> = {};
  /**
   * True for a behaviour that exists once per player (VRChat: a PlayerObject). It is made when the player joins
   * and dropped when they leave, that player owns it for good, and its synced fields travel in their user state.
   */
  static perPlayer = false;
  /** For a per-player behaviour: its synced fields are saved on the device and put back on the next visit. */
  static persistent = false;
  /**
   * Metres from the nearest of the local head and hands within which a click counts as Interact() (or as a bound
   * click). 0 means any distance. A behaviour can change its own at run time with `InteractReach`.
   */
  static interactReach = 0;
  /**
   * The methods another client may run on this behaviour: by SendCustomNetworkEvent, or by SendCommand on the
   * referee. Nothing else can be called from the network (a modified client names any method it likes), and a
   * name starting with `_` never can. A subclass's list adds to its parent's.
   *
   *   static networkCallable = ["StartGame", "PlaceBid"];
   */
  static networkCallable: readonly string[] = [];

  // ---- what the runtime provides ------------------------------------------------------------------------------

  /** The id this behaviour has in bindings.json. */
  get behaviourId(): string { return linkOf(this).id; }
  get gameObject(): GameObject { return linkOf(this).gameObject; }
  get transform(): Transform { return linkOf(this).gameObject.transform; }
  get Networking(): Networking { return linkOf(this).networking; }
  get Time(): TimeView { return linkOf(this).time; }
  get Random(): RandomView { return linkOf(this).random; }
  get Debug(): DebugView { return linkOf(this).debug; }
  /** Commit / reveal, fair draws and sealed delivery. */
  get Secrets(): Secrets { return linkOf(this).secrets; }
  /** Per-device saved data for the local player (localStorage). */
  get Storage(): Persistence { return linkOf(this).storage; }
  /** Text, animator parameters, particles and colours on kit objects. */
  get Host(): HostActions { return linkOf(this).host; }
  /** The snippet element's attributes. */
  get Settings(): ReadonlyMap<string, string> { return linkOf(this).settings; }
  /** Per-player saved values everyone present can read (VRChat: PlayerData). */
  get PlayerData(): PlayerDataView { return linkOf(this).playerData; }
  /** Buttons, thumbsticks, triggers, keys, head and hand poses, haptics, teleport. */
  get Input(): InputView { return linkOf(this).input; }
  /** Values only the world's owner and moderators can write. */
  get Protected(): ProtectedView { return linkOf(this).protectedValues; }
  /**
   * For a per-player behaviour: the player it belongs to. Null on an ordinary behaviour. An upstream field named
   * `Player` would hide it: such a port renames the field (the convention: `upstreamPlayer`) or reads `OwnerPlayer`.
   */
  get Player(): Player | null { return linkOf(this).player; }
  /** The same as `Player`, under a name no upstream field is likely to use. */
  get OwnerPlayer(): Player | null { return linkOf(this).player; }
  /**
   * One object shared by every instance of this game on the page (two tables of one game keep one chip balance
   * here). Page memory only: not synced, not saved, gone when the page reloads (use Storage for that).
   */
  get Shared(): Record<string, unknown> { return linkOf(this).shared; }
  /** This instance's key (the `room` / `instance` attribute, or the element's index): `pk1.<slug>.<key>`. */
  get InstanceKey(): string { return linkOf(this).instanceKey; }
  /**
   * This behaviour's own click reach in metres, overriding the bindings' `reach`, the class's `interactReach` and
   * the game's default (a snippet setting, for example). Undefined: those apply. 0: any distance.
   */
  get InteractReach(): number | undefined { return linkOf(this).reach.get(this); }
  set InteractReach(metres: number | undefined) {
    if (metres === undefined) linkOf(this).reach.delete(this);
    else linkOf(this).reach.set(this, metres);
  }

  // ---- calls --------------------------------------------------------------------------------------------------

  /** Sends the synced fields. Only the owner's request does anything; it goes out at the end of the tick. */
  RequestSerialization(): void {
    linkOf(this).requestSerialization();
  }

  SendCustomEvent(name: string): void {
    const fn = (this as unknown as Record<string, unknown>)[name];
    if (typeof fn === "function") fn.call(this);
    else this.Debug.LogWarning(`SendCustomEvent: ${this.behaviourId} has no method '${name}'`);
  }

  /**
   * Runs `name` on every client (All: here at once, then everywhere else) or only on the owner's. Arguments
   * must be JSON data or the value types of values.ts. While the method runs, `Networking.CallingPlayer` is
   * the sender: check it before honouring a request not everybody may make. `name` must be listed in the
   * class's `static networkCallable`.
   */
  SendCustomNetworkEvent(target: NetworkEventTargetName, name: string, ...args: unknown[]): void {
    linkOf(this).sendNetworkEvent(target, name, args);
  }

  /**
   * Asks the referee to run `name` on its copy of this behaviour, with `Networking.CallingPlayer` set to the
   * sender. Unlike a network event the request is numbered and kept until the referee acknowledges it: it is
   * run in order, survives a change of referee, and is never replayed to a late joiner. Returns its number.
   */
  SendCommand(name: string, ...args: unknown[]): number {
    return linkOf(this).sendCommand(name, args);
  }

  SendCustomEventDelayedSeconds(name: string, seconds: number): void {
    linkOf(this).delaySeconds(name, seconds);
  }

  /** A frame is one 50 ms tick here. */
  SendCustomEventDelayedFrames(name: string, frames: number): void {
    linkOf(this).delayFrames(name, frames);
  }

  /** Another behaviour of this instance, by its bindings id. */
  FindBehaviour<T extends Behaviour = Behaviour>(id: string): T | null {
    return linkOf(this).find(id) as T | null;
  }

  /** Every ordinary behaviour of this instance with the given bindings type, in bindings order. */
  FindBehavioursOfType<T extends Behaviour = Behaviour>(type: string): T[] {
    return linkOf(this).findByType(type) as T[];
  }

  /** The per-player behaviour of the given type that belongs to `player`. */
  PlayerBehaviour<T extends Behaviour = Behaviour>(player: Player, type: string): T | null {
    return linkOf(this).playerBehaviour(player, type) as T | null;
  }

  /** One per-player behaviour of the given type for every player present, in player-id order. */
  PlayerBehaviours<T extends Behaviour = Behaviour>(type: string): T[] {
    return linkOf(this).playerBehaviours(type) as T[];
  }

  /** One of the few things that are truly asynchronous: await it. */
  Raycast(origin: Vector3, direction: Vector3, maxDistance = 1000, layerMask = -1): Promise<RayHit | null> {
    return linkOf(this).raycast(origin, direction, maxDistance, layerMask);
  }

  /**
   * Has `method` called when a graph of the kit reports `name` through
   * `window.__pk1.event("<slug>:<inst>", "<name>", "<arg>|<arg>...")`. The method receives the arguments as strings.
   */
  RegisterGraphEvent(name: string, method: string): void {
    linkOf(this).onGraphEvent(name, method);
  }

  // ---- overridable, as in UdonSharp ---------------------------------------------------------------------------

  Start(): void {}
  /**
   * Called after Start and after any saved values were applied, once this client knows what it came to: a new
   * game ("fresh"), saved state nobody was playing ("resumed": carry on or reset, as the game prefers), a game
   * others are playing ("joined"), or no game yet ("idle"). In a game with declared referee candidates it is
   * called again when the first referee is elected. The same value is `this.Networking.StartKind`.
   */
  OnInstanceStart(_kind: StartKind): void {}
  /** Called 20 times a second, only on classes that override it. `this.Time.deltaTime` is the time it covers. */
  Update(): void {}
  /** Synced fields were just replaced by another player's values. Not called for the owner's own writes. */
  OnDeserialization(_result: DeserializationResult): void {}
  OnPreSerialization(): void {}
  /** `success` is false when the room refused the write (see OnWriteRefused for why). */
  OnPostSerialization(_result: SerializationResult): void {}
  OnOwnershipTransferred(_player: Player): void {}
  OnPlayerJoined(_player: Player): void {}
  OnPlayerLeft(_player: Player): void {}
  /** A player's saved data and per-player behaviours are loaded and published (VRChat: OnPlayerRestored). */
  OnPlayerRestored(_player: Player): void {}
  /** Values in a player's PlayerData changed; `keys` names them. */
  OnPlayerDataUpdated(_player: Player, _keys: string[]): void {}
  /** The room refused something this behaviour wrote. Also reported through OnPostSerialization for fields. */
  OnWriteRefused(_refusal: WriteRefusal): void {}
  /** The referee has run the command this behaviour sent with that number. */
  OnCommandAcknowledged(_number: number): void {}
  /** A player's fair draw under `label` changed state (see Secrets.beginDraw). Called on every behaviour that overrides it. */
  OnDrawChanged(_player: Player, _label: string, _state: DrawState): void {}
  /** A protected value changed. Called on every behaviour that overrides it. */
  OnProtectedChanged(_key: string): void {}
  /**
   * The referee changed (VRChat: OnMasterTransferred). Null when there is none left (a game with declared
   * candidates and nobody offering). A game with hidden information may void its match here: the new referee
   * does not know what the old one dealt.
   */
  OnMasterTransferred(_newMaster: Player | null): void {}
  /** A controller button of the local player went down or came up. Called on every behaviour that overrides it. */
  OnButtonPressed(_button: ButtonName, _side: HandSide): void {}
  OnButtonReleased(_button: ButtonName, _side: HandSide): void {}
  /** A key went down or came up; `key` is the Unity KeyCode name. */
  OnKeyPressed(_key: string): void {}
  OnKeyReleased(_key: string): void {}
  /** The local player clicked this behaviour's object. */
  Interact(): void {}
  OnPickup(): void {}
  OnDrop(): void {}
  /** The instance is going away (its element left the page), or this per-player behaviour's player left. */
  OnDestroy(): void {}
}

export type BehaviourClass = (new () => Behaviour) & {
  synced?: readonly string[];
  syncMode?: "manual" | "continuous" | "none";
  fieldChangeCallbacks?: Readonly<Record<string, string>>;
  perPlayer?: boolean;
  persistent?: boolean;
  interactReach?: number;
  networkCallable?: readonly string[];
};
