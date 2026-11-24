// One running copy of a game: one `<bs-snippet>` element, one kit, one prefix in the room's state.

import {
  Behaviour,
  linkBehaviour,
  type BehaviourClass,
  type BehaviourLink,
  type DebugView,
  type InputView,
  type NetworkEventTargetName,
  type RandomView,
  type TimeView,
  type WriteRefusal,
} from "./behaviour.ts";
import type { BindingBehaviour, BindingEvent, Bindings } from "./bindings.ts";
import { Commands } from "./commands.ts";
import { Core, DEFAULT_OPTIONS, type RuntimeOptions } from "./core.ts";
import { NetEvents } from "./events.ts";
import { ClockSync, RelayHost, type HostActions } from "./host.ts";
import { holderName, networkId, relayKey, storagePrefix } from "./names.ts";
import { Networking, type NetHost, type StartKind } from "./networking.ts";
import { Persistence } from "./persistence.ts";
import { PerUser } from "./peruser.ts";
import { Players, type Player } from "./players.ts";
import { Presence } from "./presence.ts";
import { ProtectedValues } from "./protect.ts";
import { Referee, type CandidateRule } from "./referee.ts";
import { AudioClipRef, GameObject, makeComponent, type ComponentKind } from "./scene.ts";
import { Scheduler } from "./scheduler.ts";
import { Secrets } from "./secrets.ts";
import { Sync } from "./sync.ts";
import type {
  Ability,
  BlockableControl,
  ButtonName,
  HandSide,
  HostEventDetail,
  HostEventKind,
  InputEvent,
  Kit,
  KitSpec,
  LocalPoses,
  Platform,
  SnippetElement,
} from "./types.ts";
import { deferred, fnv1a, isRecord } from "./util.ts";
import { decodeValue, Vector2, Vector3 } from "./values.ts";

export interface GameDefinition {
  /** The snippet slug: lower-case letters, digits and hyphens. */
  slug: string;
  /** The classes named by `type` in bindings.json. */
  behaviours: Record<string, BehaviourClass>;
  options?: Partial<RuntimeOptions>;
  /** Who may be elected referee: every participant ("anyone", the default) or only those who offered ("declared"). */
  referee?: CandidateRule;
  /** Default reach in metres for clicks that call Interact(); 0 or absent: any distance. */
  interactReach?: number;
  /** A refused write that belongs to no single behaviour (a protected value, the referee's own records). */
  onWriteRefused?: (refusal: WriteRefusal) => void;
  /**
   * Extra readers for Play-mode tests, added to the instance's entry in `window.__pk1.debug` beside digest, state,
   * referee and players (a board as text, whose turn it is). Called once, when the instance has started.
   */
  debug?: (instance: GameInstance) => Record<string, unknown>;
}

interface Address {
  id: string;
  type: string;
  playerSid: string | null;
}

interface Template {
  binding: BindingBehaviour;
  cls: BehaviourClass;
}

const OBJECT_EVENTS: readonly string[] = [
  "click",
  "grab",
  "drop",
  "triggerEnter",
  "triggerExit",
  "collisionEnter",
  "collisionExit",
  "uiButton",
  "uiSlider",
  "uiToggle",
  "heldTrigger",
  "heldPrimary",
  "heldSecondary",
  "field",
];
/** Graph events kept while an instance is still starting (a graph's Start runs as soon as the kit exists). */
const MAX_EARLY_EVENTS = 256;

export class GameInstance implements NetHost {
  readonly platform: Platform;
  readonly game: GameDefinition;
  readonly bindings: Bindings;
  readonly element: SnippetElement;
  readonly inst: string;
  readonly core: Core;
  readonly scheduler: Scheduler;
  readonly presence: Presence;
  readonly referee: Referee;
  readonly players: Players;
  readonly sync: Sync;
  readonly events: NetEvents;
  readonly commands: Commands;
  readonly perUser: PerUser;
  readonly secrets: Secrets;
  readonly protectedValues: ProtectedValues;
  readonly host: RelayHost;
  readonly clockSync: ClockSync;
  readonly storage: Persistence;
  readonly networking: Networking;
  readonly settings = new Map<string, string>();
  readonly objects = new Map<string, GameObject>();
  /** Set when the instance has started its behaviours. */
  started = false;
  /** Resolves when behaviours have started (or the instance was disposed first). */
  readonly ready = deferred<boolean>();

  private readonly rule: CandidateRule;
  private kit: Kit | null = null;
  private readonly ordinary: Behaviour[] = [];
  private readonly byId = new Map<string, Behaviour>();
  private readonly addresses = new Map<Behaviour, Address>();
  private readonly templates: Template[] = [];
  private readonly playerBehaviourMap = new Map<string, Map<string, Behaviour>>();
  private readonly objectHandlers = new Map<string, Map<string, Array<(detail: HostEventDetail) => void>>>();
  private readonly hostWired = new Set<string>();
  private readonly graphHandlers = new Map<string, Array<{ behaviour: Behaviour | (() => Behaviour | null); method: string }>>();
  private readonly pendingLeaves: Player[] = [];
  private readonly earlyGraphEvents: Array<{ name: string; args: string[] }> = [];
  private readonly buttons = new Set<string>();
  private readonly keys = new Set<string>();
  private readonly sticks = [new Vector2(), new Vector2()];
  private readonly triggers = [0, 0];
  private readonly abilitiesOff = new Set<Ability>();
  private readonly blocksOn = new Set<BlockableControl>();
  private poses: LocalPoses | null = null;
  private readonly triggerAt: [number, number] = [-Infinity, -Infinity];
  private lastClickSide: HandSide | null = null;
  private vr: boolean | null = null;
  private readonly reachOverride = new Map<Behaviour, number>();
  private position: Vector3 | null = null;
  private startKindValue: StartKind = "idle";
  private lastClockAsk = -Infinity;
  private readonly timeView: TimeView;
  private readonly randomView: RandomView;
  private readonly debugView: DebugView;
  private readonly inputView: InputView;

  /** The page-wide object every instance of this game shares (GameRuntime.shared). */
  readonly shared: Record<string, unknown>;

  constructor(platform: Platform, game: GameDefinition, bindings: Bindings, element: SnippetElement, inst: string, shared: Record<string, unknown> = {}) {
    this.shared = shared;
    this.platform = platform;
    this.game = game;
    this.bindings = bindings;
    this.element = element;
    this.inst = inst;
    this.rule = game.referee ?? "anyone";
    const options: RuntimeOptions = { ...DEFAULT_OPTIONS, ...(game.options ?? {}) };
    this.scheduler = new Scheduler(platform.clock, (where, error) => this.core.error(where, error));
    this.core = new Core(platform, game.slug, inst, options, this.scheduler);
    for (const name of element.attributeNames()) this.settings.set(name, element.getAttribute(name) ?? "");

    this.presence = new Presence(this.core);
    this.referee = new Referee(this.core, this.presence, this.rule);
    this.players = new Players(this.core, this.presence, this.referee);
    this.sync = new Sync(this.core, this.presence, this.referee, this.players);
    this.clockSync = new ClockSync(platform.clock);
    this.host = new RelayHost(platform, game.slug, inst, bindings.refs);
    this.host.pathOf = (key) => bindings.objects[key]?.path;
    this.storage = new Persistence(platform.storage, game.slug, inst, platform.local().uid);
    this.secrets = new Secrets(this.core, this.presence, this.referee, () => this.clockSync.seconds());
    this.protectedValues = new ProtectedValues(this.core);
    this.events = new NetEvents(this.core, this.sync, {
      behaviour: (id) => this.byId.get(id) ?? null,
      playerBehaviour: (sid, id) => this.playerBehaviourMap.get(sid)?.get(id) ?? null,
      address: (behaviour) => this.addresses.get(behaviour) ?? null,
      refused: (behaviour, code, name) => this.refuse(behaviour, { kind: "event", code, key: name, final: true }),
    });
    this.commands = new Commands(this.core, this.presence, this.referee, {
      resolve: (id, playerSid) => (playerSid ? (this.playerBehaviourMap.get(playerSid)?.get(id) ?? null) : (this.byId.get(id) ?? null)),
      address: (behaviour) => this.addresses.get(behaviour) ?? null,
      invoke: (behaviour, name, args, fromSid) => this.events.invoke(behaviour, name, args, fromSid),
      acknowledged: (behaviour, number) => behaviour.OnCommandAcknowledged(number),
      refused: (behaviour, code, name) => this.refuse(behaviour, { kind: "event", code, key: name, final: true }),
    });
    this.perUser = new PerUser(this.core, this.storage, {
      restored: (player) => this.each("OnPlayerRestored", (b) => b.OnPlayerRestored(player)),
      dataUpdated: (player, keys) => this.each("OnPlayerDataUpdated", (b) => b.OnPlayerDataUpdated(player, keys)),
      deserialized: (behaviour) => this.core.guard("OnDeserialization", () => behaviour.OnDeserialization({ isSnapshot: false, isRollback: false })),
      refused: (kind, code, key, behaviour) => this.refuse(behaviour, { kind, code, key, final: true }),
    });
    this.networking = new Networking(this);

    const scheduler = this.scheduler;
    this.timeView = {
      get time() { return scheduler.time; },
      get deltaTime() { return scheduler.deltaTime; },
      get frameCount() { return scheduler.ticks; },
    };
    this.randomView = {
      get value() { return platform.random(); },
      Range: (min, max) => min + (max - min) * platform.random(),
      RangeInt: (min, max) => Math.floor(min) + Math.floor((Math.floor(max) - Math.floor(min)) * platform.random()),
      Bytes: (n) => platform.crypto.getRandomValues(new Uint8Array(Math.max(0, Math.floor(n)))),
    };
    const say = (level: "info" | "warn" | "error") => (message: unknown) => this.core.log(level, typeof message === "string" ? message : String(message));
    this.debugView = { Log: say("info"), LogWarning: say("warn"), LogError: say("error") };
    const owner = this;
    this.inputView = {
      GetButton: (button, side) => this.buttons.has(`${side}/${button}`),
      GetThumbstick: (side) => this.sticks[side]!.clone(),
      GetTrigger: (side) => this.triggers[side]!,
      GetKey: (key) => this.keys.has(key),
      get Poses() { return owner.poses; },
      get Position() { return owner.position ? owner.position.clone() : null; },
      Haptic: (side, strength, seconds) => platform.haptic(side, strength, seconds),
      get LastClickSide() { return owner.lastClickSide; },
      get IsVR() { return owner.vr; },
      InReach: (point, metres) => !(metres > 0) || this.nearestDistance(point) <= metres,
      TeleportTo: (position, yDegrees, stopMovement = true) => {
        this.moved(position);
        platform.teleport(position, yDegrees, stopMovement);
      },
      SetAbility: (ability, allowed) => {
        if (allowed) this.abilitiesOff.delete(ability);
        else this.abilitiesOff.add(ability);
        platform.setAbility(ability, allowed);
      },
      SetBlock: (control, blocked) => {
        if (blocked) this.blocksOn.add(control);
        else this.blocksOn.delete(control);
        platform.setBlock(control, blocked);
      },
    };
  }

  // ---- starting -----------------------------------------------------------------------------------------------

  /** Runs the start gate: platform, kit, snapshot, clock, keys, an id, a referee; then starts the behaviours. */
  async start(): Promise<void> {
    const { platform, core } = this;
    try {
      await platform.whenReady();
      if (core.disposed) return;
      core.me = platform.local();
      core.listen();
      core.own(
        platform.onRelay(relayKey(core.slug, core.inst), {
          clock: (requestId, seconds) => this.host.onClockReply(requestId, seconds),
          event: (name, args) => this.onGraphEvent(name, args),
        }),
      );
      core.own(platform.onPose((poses) => this.onPose(poses)));
      core.own(platform.onTeleported((position) => this.moved(position)));
      // Poses only arrive while the player moves: ask once where they are, so reach counts from the start.
      void platform.localPosition().then((position) => {
        if (position && !this.poses && !this.position && !core.disposed) this.position = position;
      }, () => undefined);
      void platform.isVR().then((vr) => (this.vr = vr), () => (this.vr = false));
      core.own(platform.onInput((event) => this.onInput(event)));
      core.own(platform.onStateError(core.prefix + ".", (path, code, final) => this.onRefusedPath(path.slice(core.prefix.length + 1), code, final)));

      await this.loadKit();
      if (core.disposed) return;
      const snapshot = await platform.whenSnapshot(core.options.snapshotTimeoutMs);
      if (core.disposed) return;
      if (!snapshot) core.log("warn", "no full state snapshot arrived in time; starting from what is mirrored");
      await this.askClock(true);
      if (core.disposed) return;
      const saved = storagePrefix(core.slug, core.inst, core.me.uid);
      const publicKey = await this.secrets.init(platform.storage, saved + "ecdh", saved + "draw");
      if (core.disposed) return;

      this.players.on((kind, player) => this.onPlayer(kind, player));
      this.referee.on((now, before) => this.onReferee(now?.sid ?? null, before?.sid ?? null));
      this.presence.start();
      this.presence.announce(publicKey);
      this.referee.start();
      this.players.start();
      this.secrets.listen();
      this.commands.listen();
      this.perUser.listen();
      this.protectedValues.listen();
      this.events.listen();
      this.secrets.onDrawChanged = (sid, label, status) => {
        const player = this.players.bySid(sid);
        if (player && this.started) this.each("OnDrawChanged", (b) => b.OnDrawChanged(player, label, status.state));
      };
      this.protectedValues.onChanged = (key) => {
        if (this.started) this.each("OnProtectedChanged", (b) => b.OnProtectedChanged(key));
      };

      const warn = this.scheduler.after(core.options.admitWarnMs, () => {
        core.log("warn", `still waiting to start: ${this.players.local ? "no referee has been elected" : "the local player's id has not settled"}`);
      });
      await this.players.whenLocalAssigned();
      if (this.rule === "anyone") await this.whenReferee();
      this.scheduler.cancel(warn);
      if (core.disposed) return;
      this.begin();
    } catch (error) {
      core.error("start", error);
    } finally {
      this.ready.resolve(this.started);
    }
  }

  private whenReferee(): Promise<void> {
    if (this.referee.current()) return Promise.resolve();
    const gate = deferred<void>();
    this.referee.on((now) => {
      if (now) gate.resolve();
    });
    return gate.promise;
  }

  private async loadKit(): Promise<void> {
    const { core, bindings, element } = this;
    const address = (attr: string, fallback: string) => {
      const value = (element.getAttribute(attr) ?? "").trim();
      return /^https?:\/\//i.test(value) ? value : fallback;
    };
    // The element's own addresses (tests), else what the page was given at release, else what the bindings say.
    const released = this.platform.bundles(core.slug);
    const windows = address("windows", released?.windows || bindings.bundles.windows);
    const android = address("android", released?.android || bindings.bundles.android);
    const keys = Object.keys(bindings.objects);
    if (windows || android) {
      const spec: KitSpec = {
        holderName: holderName(core.slug, core.inst),
        rootName: (bindings.root ?? bindings.slug) + "(Clone)",
        windows,
        android,
        position: triple(element.getAttribute("position"), false),
        rotation: triple(element.getAttribute("rotation"), false),
        scale: triple(element.getAttribute("scale"), true),
        objects: keys.map((key) => {
          const o = bindings.objects[key]!;
          const synced = o.sync === "transform" || o.seat;
          return { key, path: o.path, networkId: synced ? networkId(core.slug, core.inst, key) : "", attachNetworkId: networkId(core.slug, core.inst, key), sync: o.sync, grab: o.grab, click: o.click, seat: o.seat };
        }),
      };
      try {
        this.kit = await this.platform.loadKit(spec);
        if (this.kit.missing.length) core.log("error", `kit objects not found: ${this.kit.missing.join(", ")}`);
      } catch (error) {
        core.error("the kit did not load", error);
      }
    } else if (keys.length) core.log("warn", "no bundle address for this kit (bindings.bundles is empty and the element names none): running without objects");
    if (core.disposed) {
      this.kit?.destroy();
      this.kit = null;
      return;
    }
    for (const key of keys) {
      const path = bindings.objects[key]!.path;
      const subscribe = (kind: HostEventKind, handler: (detail: HostEventDetail) => void) => this.addObjectHandler(key, kind, handler);
      this.objects.set(key, new GameObject(key, path.slice(path.lastIndexOf("/") + 1), this.kit?.objects.get(key) ?? null, this.host, subscribe));
    }
    // Objects the upstream prefab had switched off: the kit holds them on so that the page could find them; off they go now.
    let hidden = 0;
    for (const key of keys) {
      if (bindings.objects[key]!.active !== false) continue;
      this.objects.get(key)!.SetActive(false);
      hidden++;
    }
    if (hidden) this.host.flush();
    this.host.fallbackClip = (key, index) => {
      const object = this.kit?.objects.get(key);
      if (!object) return false;
      object.playClip(index);
      return true;
    };
    if (!this.kit) return;
    // Where everything stands, so that Start() can already read positions. A bridge that does not answer must
    // not hold the game up.
    const reads = keys.map((key) => this.objects.get(key)!.transform.Refresh().catch(() => undefined));
    const waited = deferred<void>();
    const limit = this.scheduler.after(3000, () => waited.resolve());
    await Promise.race([Promise.all(reads), waited.promise]);
    this.scheduler.cancel(limit);
    for (const key of keys) {
      const o = bindings.objects[key]!;
      const hostObject = this.kit.objects.get(key);
      if (!hostObject || !(o.grab || o.sync === "transform")) continue;
      const transform = this.objects.get(key)!.transform;
      core.own(hostObject.watchTransform((pose) => transform._report(pose.position, pose.rotation)));
    }
  }

  private async askClock(first: boolean): Promise<void> {
    const sentAt = this.platform.clock.now();
    this.lastClockAsk = sentAt;
    const answer = this.host.requestClock().then((seconds) => {
      if (!this.core.disposed) this.clockSync.accept(seconds, sentAt);
      return true;
    });
    if (!first) return;
    const gate = deferred<boolean>();
    const timer = this.scheduler.after(this.core.options.clockTimeoutMs, () => gate.resolve(false));
    const ok = await Promise.race([answer, gate.promise]);
    this.scheduler.cancel(timer);
    if (!ok) this.core.log("warn", "the synced clock did not answer; using this device's clock until it does");
  }

  private begin(): void {
    const { core } = this;
    this.createBehaviours();
    this.wireEvents();
    this.sync.onLocalOwnership = (slot, mine) => {
      if (!mine) return;
      for (const member of slot.members) {
        const key = this.addresses.get(member.behaviour) ? member.behaviour.gameObject.key : "";
        if (key && this.bindings.objects[key]?.sync === "transform") member.behaviour.gameObject.TakeOwnership();
      }
    };
    this.sync.attach();
    for (const behaviour of this.ordinary) core.guard(`${this.idOf(behaviour)}.Start`, () => behaviour.Start());
    this.sync.applySnapshot();
    this.startKindValue = this.computeStartKind();
    this.sync.begin();
    this.commands.started = true;
    this.perUser.started = true;
    this.started = true;
    this.perUser.dataEnabled = this.perUser.dataEnabled || this.anyOverrides("OnPlayerRestored") || this.anyOverrides("OnPlayerDataUpdated");
    this.perUser.restoreLocal();
    for (const behaviour of this.ordinary) core.guard(`${this.idOf(behaviour)}.OnInstanceStart`, () => behaviour.OnInstanceStart(this.startKindValue));
    for (const player of this.players.list()) this.deliverJoin(player);
    this.sync.takeOver();
    this.secrets.review();
    this.commands.review();
    for (const early of this.earlyGraphEvents.splice(0)) this.onGraphEvent(early.name, early.args);
    this.scheduler.start(() => this.tick());
    // Unity runs the first Update in the frame of Start: so does this, so that state a game sets in Update (which
    // controls are live, say) is there as soon as the instance has started, not one tick later.
    this.tick();
    let extra: Record<string, unknown> = {};
    if (this.game.debug) core.guard("debug hooks", () => (extra = this.game.debug!(this)));
    this.platform.expose(relayKey(core.slug, core.inst), {
      ...extra,
      digest: () => this.digest(),
      version: () => this.version(),
      stamp: () => ({ version: this.version(), digest: this.digest() }),
      state: () => JSON.parse(this.sync.snapshotText()),
      referee: () => this.referee.current(),
      players: () => this.players.list().map((p) => ({ id: p.playerId, name: p.displayName, sid: p.sid })),
    });
    core.log("info", `started (${this.startKindValue}) as ${this.players.local}, ${this.ordinary.length} behaviours`);
  }

  private computeStartKind(): StartKind {
    const ref = this.referee.current();
    if (!ref) return "idle";
    const claim = this.referee.lastClaim;
    if (ref.sid !== this.core.me.sid || !claim || claim.term !== ref.term) return "joined";
    if (claim.fresh) return "fresh";
    return claim.alive ? "joined" : "resumed";
  }

  // ---- behaviours ---------------------------------------------------------------------------------------------

  private createBehaviours(): void {
    const { core, bindings } = this;
    const made: Array<{ behaviour: Behaviour; binding: BindingBehaviour; cls: BehaviourClass }> = [];
    for (const binding of bindings.behaviours) {
      const cls = this.game.behaviours[binding.type];
      if (!cls) {
        core.log("error", `bindings name behaviour type '${binding.type}' (${binding.id}), which the game does not define`);
        continue;
      }
      if (binding.perPlayer === true || cls.perPlayer === true) {
        this.templates.push({ binding, cls });
        continue;
      }
      const behaviour = new cls();
      linkBehaviour(behaviour, this.makeLink(behaviour, binding, null));
      this.addresses.set(behaviour, { id: binding.id, type: binding.type, playerSid: null });
      this.byId.set(binding.id, behaviour);
      this.ordinary.push(behaviour);
      made.push({ behaviour, binding, cls });
    }
    this.perUser.declareTypes(this.templates.map((t) => t.binding.id));
    for (const { behaviour, binding, cls } of made) {
      this.assignBindingFields(behaviour, binding, null);
      const fields = cls.synced ?? [];
      for (const field of fields) if (!(field in behaviour)) core.log("warn", `${binding.id}: synced field '${field}' is not a field of ${binding.type}`);
      this.sync.add(behaviour, binding.id, fields, fields.length ? (cls.syncMode ?? "manual") : "none", cls.fieldChangeCallbacks, binding.group);
    }
  }

  private makePlayerBehaviours(player: Player): void {
    if (!this.templates.length || this.playerBehaviourMap.has(player.sid)) return;
    const mine = new Map<string, Behaviour>();
    this.playerBehaviourMap.set(player.sid, mine);
    const made: Array<{ behaviour: Behaviour; template: Template }> = [];
    for (const template of this.templates) {
      const behaviour = new template.cls();
      linkBehaviour(behaviour, this.makeLink(behaviour, template.binding, player));
      this.addresses.set(behaviour, { id: template.binding.id, type: template.binding.type, playerSid: player.sid });
      mine.set(template.binding.id, behaviour);
      made.push({ behaviour, template });
    }
    for (const { behaviour, template } of made) this.assignBindingFields(behaviour, template.binding, mine);
    for (const { behaviour, template } of made) {
      const id = template.binding.id;
      this.core.guard(`${id}.Start`, () => behaviour.Start());
      const hasData = this.perUser.adopt(player, id, behaviour, template.cls.synced ?? [], template.cls.persistent === true, template.cls.fieldChangeCallbacks);
      if (hasData) this.core.guard(`${id}.OnDeserialization`, () => behaviour.OnDeserialization({ isSnapshot: true, isRollback: false }));
    }
  }

  private makeLink(behaviour: Behaviour, binding: BindingBehaviour, player: Player | null): BehaviourLink {
    const gameObject = (binding.object ? this.objects.get(binding.object) : undefined) ?? new GameObject("", binding.id, null, null);
    const instance = this;
    return {
      id: binding.id,
      gameObject,
      networking: this.networking,
      time: this.timeView,
      random: this.randomView,
      debug: this.debugView,
      secrets: this.secrets,
      storage: this.storage,
      host: this.host as HostActions,
      settings: this.settings,
      playerData: this.perUser,
      input: this.inputView,
      protectedValues: this.protectedValues,
      player,
      instanceKey: this.inst,
      shared: this.shared,
      reach: this.reachOverride,
      requestSerialization() {
        if (player) {
          if (player.isLocal) instance.perUser.requestSerialization(behaviour);
          return;
        }
        const slot = instance.sync.slotOf(behaviour);
        if (slot) instance.sync.requestSerialization(slot);
      },
      sendNetworkEvent(target: NetworkEventTargetName, name: string, args: unknown[]) {
        instance.events.send(behaviour, target, name, args);
      },
      sendCommand(name: string, args: unknown[]) {
        return instance.commands.send(behaviour, name, args);
      },
      delaySeconds(name: string, seconds: number) {
        instance.scheduler.after(seconds * 1000, () => instance.callByName(behaviour, name));
      },
      delayFrames(name: string, frames: number) {
        instance.scheduler.afterTicks(frames, () => instance.callByName(behaviour, name));
      },
      find: (id) => {
        const sibling = player ? this.playerBehaviourMap.get(player.sid)?.get(id) : undefined;
        return sibling ?? this.byId.get(id) ?? null;
      },
      findByType: (type) => this.ordinary.filter((b) => this.addresses.get(b)?.type === type),
      playerBehaviour: (who, type) => this.playerBehaviourOf(who, type),
      playerBehaviours: (type) =>
        this.players
          .list()
          .map((p) => this.playerBehaviourOf(p, type))
          .filter((b): b is Behaviour => b !== null),
      raycast: (origin, direction, maxDistance, layerMask) => this.platform.raycast(origin, direction, maxDistance, layerMask),
      onGraphEvent: (name, method) => this.addGraphHandler(name, behaviour, method),
    };
  }

  private playerBehaviourOf(player: Player, type: string): Behaviour | null {
    const mine = this.playerBehaviourMap.get(player.sid);
    if (!mine) return null;
    for (const behaviour of mine.values()) if (this.addresses.get(behaviour)?.type === type) return behaviour;
    return mine.get(type) ?? null;
  }

  private callByName(behaviour: Behaviour, name: string): void {
    if (this.core.disposed) return;
    const fn = (behaviour as unknown as Record<string, unknown>)[name];
    if (typeof fn === "function") this.core.guard(name, () => fn.call(behaviour));
    else this.core.log("warn", `${this.idOf(behaviour)} has no method '${name}' for a delayed event`);
  }

  private assignBindingFields(behaviour: Behaviour, binding: BindingBehaviour, siblings: Map<string, Behaviour> | null): void {
    if (!binding.fields) return;
    const bag = behaviour as unknown as Record<string, unknown>;
    for (const name of Object.keys(binding.fields)) bag[name] = this.resolveField(binding.fields[name], siblings, `${binding.id}.${name}`, binding.object ?? null);
  }

  /** Turns a bindings field value into what the behaviour holds: objects, behaviours, component proxies, values. */
  private resolveField(value: unknown, siblings: Map<string, Behaviour> | null, where: string, ownObject: string | null): unknown {
    if (Array.isArray(value)) return value.map((v, i) => this.resolveField(v, siblings, `${where}[${i}]`, ownObject));
    if (!isRecord(value)) return value;
    if (typeof value.$obj === "string") return this.objects.get(value.$obj) ?? null;
    if (typeof value.$beh === "string") {
      const found = siblings?.get(value.$beh) ?? this.byId.get(value.$beh) ?? null;
      if (!found) this.core.log("warn", `${where}: behaviour '${value.$beh}' is per-player or missing, so the field is null`);
      return found;
    }
    if (typeof value.$comp === "string") {
      const object = this.objects.get(value.$comp);
      return object ? makeComponent(String(value.kind ?? "Transform") as ComponentKind, object, this.host) : null;
    }
    if (typeof value.$clip === "number") return new AudioClipRef(value.$clip, typeof value.on === "string" ? value.on : null);
    if (Object.keys(value).some((key) => key.startsWith("$"))) return decodeValue(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = this.resolveField(value[key], siblings, `${where}.${key}`, ownObject);
    return out;
  }

  private idOf(behaviour: Behaviour): string {
    return this.addresses.get(behaviour)?.id ?? "?";
  }

  private all(): Behaviour[] {
    const out = this.ordinary.slice();
    for (const mine of this.playerBehaviourMap.values()) for (const behaviour of mine.values()) out.push(behaviour);
    return out;
  }

  private overrides(behaviour: Behaviour, method: keyof Behaviour): boolean {
    return (behaviour as unknown as Record<string, unknown>)[method] !== (Behaviour.prototype as unknown as Record<string, unknown>)[method];
  }

  private anyOverrides(method: keyof Behaviour): boolean {
    if (this.ordinary.some((b) => this.overrides(b, method))) return true;
    return this.templates.some((t) => (t.cls.prototype as Record<string, unknown>)[method] !== (Behaviour.prototype as unknown as Record<string, unknown>)[method]);
  }

  /** Calls a callback on every behaviour that overrides it. */
  private each(method: keyof Behaviour, call: (behaviour: Behaviour) => void): void {
    if (!this.started || this.core.disposed) return;
    for (const behaviour of this.all()) {
      if (this.overrides(behaviour, method)) this.core.guard(`${this.idOf(behaviour)}.${String(method)}`, () => call(behaviour));
    }
  }

  // ---- players and referee ------------------------------------------------------------------------------------

  private onPlayer(kind: "join" | "leave", player: Player): void {
    if (!this.started || this.core.disposed) return;
    if (kind === "join") {
      this.deliverJoin(player);
      return;
    }
    // Upstream clean-up in OnPlayerLeft is usually guarded by "am I the master": while there is no referee, a
    // departure waits until the next one is known (as VRChat names the new master first). Under "anyone" one is
    // elected within seconds, so the wait is at most 5 s; under "declared" there may be none for a long time (the
    // instance idles), and the departure is delivered when one is elected, so a referee-only handler still sees it.
    if (!this.referee.current()) {
      this.pendingLeaves.push(player);
      if (this.rule === "anyone") this.scheduler.after(5000, () => this.flushLeaves());
      return;
    }
    this.deliverLeave(player);
  }

  private flushLeaves(): void {
    for (const player of this.pendingLeaves.splice(0)) this.deliverLeave(player);
  }

  private deliverJoin(player: Player): void {
    this.makePlayerBehaviours(player);
    this.each("OnPlayerJoined", (b) => b.OnPlayerJoined(player));
    this.perUser.playerDelivered(player);
  }

  private deliverLeave(player: Player): void {
    this.each("OnPlayerLeft", (b) => b.OnPlayerLeft(player));
    const gone = this.perUser.playerGone(player.sid);
    const mine = this.playerBehaviourMap.get(player.sid);
    this.playerBehaviourMap.delete(player.sid);
    for (const behaviour of mine ? mine.values() : gone) {
      this.core.guard("OnDestroy", () => behaviour.OnDestroy());
      this.addresses.delete(behaviour);
    }
  }

  private onReferee(now: string | null, before: string | null): void {
    if (!this.started || this.core.disposed) return;
    if (now !== before) {
      const wasIdle = this.startKindValue === "idle";
      if (wasIdle && now !== null) {
        // The first referee of a game with declared candidates: now there is a game to be in.
        this.startKindValue = this.computeStartKind();
        this.each("OnInstanceStart", (b) => b.OnInstanceStart(this.startKindValue));
      }
      // A gap between two referees is not reported: only the new one is, or that nobody is left to be one.
      const player = now === null ? null : this.players.bySid(now);
      if (player || (now === null && this.referee.candidates().length === 0)) this.each("OnMasterTransferred", (b) => b.OnMasterTransferred(player));
    }
    if (now !== null) this.flushLeaves();
  }

  // NetHost
  localPlayer(): Player {
    const local = this.players.local;
    if (!local) throw new Error("the local player is not known before the instance has started");
    return local;
  }
  isReferee(): boolean {
    return this.referee.isMe();
  }
  owner(target: Behaviour): Player | null {
    const address = this.addresses.get(target);
    if (address?.playerSid) return this.players.bySid(address.playerSid);
    const slot = this.sync.slotOf(target);
    return slot ? this.sync.owner(slot) : null;
  }
  isOwner(target: Behaviour, player: Player): boolean {
    const address = this.addresses.get(target);
    if (address?.playerSid) return address.playerSid === player.sid;
    const slot = this.sync.slotOf(target);
    return slot ? this.sync.isOwner(slot, player.sid) : false;
  }
  setOwner(target: Behaviour, player: Player): void {
    if (this.addresses.get(target)?.playerSid) {
      this.core.log("warn", `${this.idOf(target)} is a per-player behaviour: its owner cannot change`);
      return;
    }
    const slot = this.sync.slotOf(target);
    if (slot) this.sync.setOwner(slot, player.sid, player.uid);
  }
  behavioursOn(object: GameObject): Behaviour[] {
    return this.ordinary.filter((b) => b.gameObject === object);
  }
  serverSeconds(): number {
    return this.clockSync.seconds();
  }
  playerList(): Player[] {
    return this.players.list();
  }
  playerById(id: number): Player | null {
    return this.players.byId(id);
  }
  callingPlayer(): Player | null {
    return this.events.callingSid === null ? null : this.players.bySid(this.events.callingSid);
  }
  callingSession(): { sid: string; uid: string } | null {
    const sid = this.events.callingSid;
    if (sid === null) return null;
    const who = this.platform.players().find((p) => p.sid === sid);
    return { sid, uid: who ? who.uid : "" };
  }
  setCandidate(on: boolean): void {
    if (this.rule !== "declared") {
      this.core.log("warn", "SetRefereeCandidate only matters in a game whose definition says referee: \"declared\"");
      return;
    }
    this.referee.setCandidate(on);
  }
  isCandidate(player: Player): boolean {
    return this.referee.isCandidate(player.sid);
  }
  startKind(): StartKind {
    return this.startKindValue;
  }
  refereePlayer(): Player | null {
    const ref = this.referee.current();
    return ref ? this.players.bySid(ref.sid) : null;
  }

  // ---- events from objects, graphs and input ------------------------------------------------------------------

  private wireEvents(): void {
    const explicit = new Set<string>();
    // A per-player behaviour has one copy per player, and the local player is the one who clicks, grabs or sees a
    // graph event here: its events go to the local player's copy.
    const mine = (id: string) => () => this.playerBehaviourMap.get(this.core.me.sid)?.get(id) ?? null;
    for (const event of this.bindings.events) {
      if (!event.behaviour || !event.method) continue; // an event listed only so that the relay graph reports it
      const ordinary = this.byId.get(event.behaviour);
      const perPlayer = !ordinary && this.templates.some((t) => t.binding.id === event.behaviour);
      if (!ordinary && !perPlayer) continue;
      const target: Behaviour | (() => Behaviour | null) = ordinary ?? mine(event.behaviour);
      if (event.kind === "graph") {
        this.addGraphHandler(event.name ?? "", target, event.method);
        continue;
      }
      explicit.add(`${event.object}/${event.kind}/${event.behaviour}`);
      this.addObjectHandler(event.object!, event.kind, (detail) => {
        const behaviour = typeof target === "function" ? target() : target;
        if (behaviour) this.callBound(behaviour, event, detail);
      });
    }
    for (const template of this.templates) {
      const key = template.binding.object;
      const object = key ? this.bindings.objects[key] : undefined;
      if (!key || !object) continue;
      const id = template.binding.id;
      const proto = template.cls.prototype as Record<string, unknown>;
      const base = Behaviour.prototype as unknown as Record<string, unknown>;
      if (object.click && proto.Interact !== base.Interact && !explicit.has(`${key}/click/${id}`)) {
        this.addObjectHandler(key, "click", (detail) => {
          const behaviour = mine(id)();
          if (behaviour && this.withinReach(behaviour, undefined, template.cls.interactReach ?? 0, detail)) this.core.guard(`${id}.Interact`, () => behaviour.Interact());
        });
      }
      if (object.grab && proto.OnPickup !== base.OnPickup && !explicit.has(`${key}/grab/${id}`)) {
        this.addObjectHandler(key, "grab", () => mine(id)()?.OnPickup());
      }
      if (object.grab && proto.OnDrop !== base.OnDrop && !explicit.has(`${key}/drop/${id}`)) {
        this.addObjectHandler(key, "drop", () => mine(id)()?.OnDrop());
      }
    }
    for (const behaviour of this.ordinary) {
      const key = behaviour.gameObject.key;
      const object = key ? this.bindings.objects[key] : undefined;
      if (!object) continue;
      const id = this.idOf(behaviour);
      const cls = behaviour.constructor as BehaviourClass;
      if (object.click && this.overrides(behaviour, "Interact") && !explicit.has(`${key}/click/${id}`)) {
        this.addObjectHandler(key, "click", (detail) => {
          if (this.withinReach(behaviour, undefined, cls.interactReach ?? 0, detail)) this.core.guard(`${id}.Interact`, () => behaviour.Interact());
        });
      }
      if (object.grab && this.overrides(behaviour, "OnPickup") && !explicit.has(`${key}/grab/${id}`)) {
        this.addObjectHandler(key, "grab", () => this.core.guard(`${id}.OnPickup`, () => behaviour.OnPickup()));
      }
      if (object.grab && this.overrides(behaviour, "OnDrop") && !explicit.has(`${key}/drop/${id}`)) {
        this.addObjectHandler(key, "drop", () => this.core.guard(`${id}.OnDrop`, () => behaviour.OnDrop()));
      }
    }
  }

  private callBound(behaviour: Behaviour, event: BindingEvent, detail: HostEventDetail): void {
    const cls = behaviour.constructor as BehaviourClass;
    if (event.kind === "click" && !this.withinReach(behaviour, event.reach, cls.interactReach ?? 0, detail)) return;
    const fn = (behaviour as unknown as Record<string, unknown>)[event.method];
    if (typeof fn !== "function") {
      this.core.log("warn", `${event.behaviour} has no method '${event.method}' (bound to ${event.kind} of ${event.object})`);
      return;
    }
    // Value-carrying UI events hand the method the new value itself.
    let argument: unknown = detail;
    if (event.kind === "uiSlider") argument = Number(detail.arg ?? "0");
    else if (event.kind === "uiToggle") argument = detail.arg === "1" || detail.arg === "true" || detail.arg === "True";
    else if (event.kind === "field") argument = detail.arg ?? "";
    this.core.guard(`${event.behaviour}.${event.method}`, () => fn.call(behaviour, argument));
  }

  /**
   * True when a click is close enough to count: measured from the nearest of the local head and hands. The reach is
   * the behaviour's own (InteractReach), else the binding's, else the class's, else the game's. With no pose
   * reported yet, every click counts.
   */
  private withinReach(behaviour: Behaviour, eventReach: number | undefined, classReach: number, detail: HostEventDetail): boolean {
    const own = this.reachOverride.get(behaviour);
    const reach = own !== undefined ? own : eventReach !== undefined ? eventReach : classReach > 0 ? classReach : (this.game.interactReach ?? 0);
    if (!(reach > 0)) return true;
    const transform = behaviour.gameObject.transform;
    const point = detail.point ?? (transform.known ? transform.position : null);
    if (!point) return true;
    return this.nearestDistance(point) <= reach;
  }

  /** Metres from `point` to the nearest of the local head and hands; 0 when no pose or position is known. */
  private nearestDistance(point: Vector3): number {
    const poses = this.poses;
    const from = poses ? [poses.head.position, poses.leftHand.position, poses.rightHand.position] : this.position ? [this.position] : [];
    if (!from.length) return 0;
    let nearest = Infinity;
    for (const p of from) nearest = Math.min(nearest, Vector3.Distance(p, point));
    return nearest;
  }

  /** The hand that clicked: the one whose trigger went down in the last second, else the one nearest the point. */
  private clickSide(point: Vector3 | undefined): HandSide | null {
    const now = this.platform.clock.now();
    const [left, right] = this.triggerAt;
    const recent = Math.max(left, right);
    if (now - recent <= 1000) return right >= left ? 1 : 0;
    if (!this.poses || !point) return null;
    return Vector3.Distance(this.poses.rightHand.position, point) <= Vector3.Distance(this.poses.leftHand.position, point) ? 1 : 0;
  }

  private addObjectHandler(objKey: string, kind: string, handler: (detail: HostEventDetail) => void): void {
    let kinds = this.objectHandlers.get(objKey);
    if (!kinds) this.objectHandlers.set(objKey, (kinds = new Map()));
    let list = kinds.get(kind);
    if (!list) kinds.set(kind, (list = []));
    list.push(handler);
    const wire = `${objKey}/${kind}`;
    const hostObject = this.kit?.objects.get(objKey);
    if (hostObject && !this.hostWired.has(wire)) {
      this.hostWired.add(wire);
      this.core.own(hostObject.on(kind as HostEventKind, (detail) => this.dispatchObject(objKey, kind, detail)));
    }
  }

  /** Delivers an object's event to what is bound to it. Also the entry point for events a graph raised. */
  dispatchObject(objKey: string, kind: string, detail: HostEventDetail): void {
    if (!this.started || this.core.disposed) return;
    if (kind === "click") {
      if (detail.side === undefined) {
        const side = this.clickSide(detail.point);
        if (side !== null) detail.side = side;
      }
      this.lastClickSide = detail.side === 0 || detail.side === 1 ? detail.side : null;
    }
    const handlers = this.objectHandlers.get(objKey)?.get(kind);
    if (!handlers || !handlers.length) return;
    const run = () => {
      if (this.core.disposed) return;
      for (const handler of handlers.slice()) this.core.guard(`${objKey} ${kind}`, () => handler(detail));
    };
    // A drop handler reads where the object was let go, so the mirror is brought up to date first: one bridge
    // round trip here keeps the translated handler synchronous.
    const object = this.objects.get(objKey);
    if (kind === "drop" && object && object.host) {
      object.transform.Refresh().then(run, run);
      return;
    }
    run();
  }

  private addGraphHandler(name: string, behaviour: Behaviour | (() => Behaviour | null), method: string): void {
    if (!name) return;
    let list = this.graphHandlers.get(name);
    if (!list) this.graphHandlers.set(name, (list = []));
    list.push({ behaviour, method });
  }

  private onGraphEvent(name: string, args: string[]): void {
    if (this.core.disposed) return;
    if (!this.started) {
      if (this.earlyGraphEvents.length < MAX_EARLY_EVENTS) this.earlyGraphEvents.push({ name, args });
      return;
    }
    if (OBJECT_EVENTS.indexOf(name) >= 0) {
      // "<target>|<value>": an event of one kit object that only a graph can see (UI controls, held buttons).
      const key = this.keyOfTarget(args[0] ?? "");
      if (!key) return;
      const detail: HostEventDetail = { arg: args[1], args: args.slice(1) };
      // A graph that reports a trigger or a collision itself: "<target>|<other name>|<px>|<py>|<pz>|<nx>|<ny>|<nz>".
      if (name.startsWith("collision") || name.startsWith("trigger")) {
        const n = args.slice(2, 8).map(Number);
        if (args[1] !== undefined) detail.otherName = args[1];
        if (n.length >= 3 && n.slice(0, 3).every(Number.isFinite)) detail.point = new Vector3(n[0], n[1], n[2]);
        if (n.length >= 6 && n.slice(3, 6).every(Number.isFinite)) detail.normal = new Vector3(n[3], n[4], n[5]);
      }
      if (name.startsWith("held") && args[1] === "left") detail.side = 0;
      else if (name.startsWith("held") && args[1] === "right") detail.side = 1;
      this.dispatchObject(key, name, detail);
      return;
    }
    const handlers = this.graphHandlers.get(name);
    if (!handlers) return;
    for (const handler of handlers.slice()) {
      const behaviour = typeof handler.behaviour === "function" ? handler.behaviour() : handler.behaviour;
      const method = handler.method;
      if (!behaviour) continue;
      const fn = (behaviour as unknown as Record<string, unknown>)[method];
      if (typeof fn === "function") this.core.guard(`${this.idOf(behaviour)}.${method}`, () => fn.apply(behaviour, args));
    }
  }

  /** A relay target ("3", "@Board/Cup") or a binding key, as a binding key. */
  private keyOfTarget(target: string): string | null {
    if (target.startsWith("@")) {
      const path = target.slice(1);
      for (const key of Object.keys(this.bindings.objects)) if (this.bindings.objects[key]!.path === path) return key;
      return null;
    }
    if (/^\d+$/.test(target)) return this.bindings.refs[Number(target)] ?? null;
    return target in this.bindings.objects ? target : null;
  }

  /** The local player was moved (teleported): the last poses no longer say where they are, until the next one. */
  private moved(position: Vector3): void {
    this.position = position.clone();
    this.poses = null;
  }

  private onPose(poses: LocalPoses): void {
    this.poses = poses;
    this.position = poses.head.position;
  }

  private onInput(event: InputEvent): void {
    if (this.core.disposed) return;
    if (event.type === "button") {
      const id = `${event.side}/${event.button}`;
      if (event.pressed && event.button === 0) this.triggerAt[event.side] = this.platform.clock.now();
      if (event.pressed) this.buttons.add(id);
      else this.buttons.delete(id);
      const { button, side } = event;
      if (event.pressed) this.each("OnButtonPressed", (b) => b.OnButtonPressed(button as ButtonName, side as HandSide));
      else this.each("OnButtonReleased", (b) => b.OnButtonReleased(button as ButtonName, side as HandSide));
    } else if (event.type === "thumbstick") {
      this.sticks[event.side] = new Vector2(event.x, event.y);
    } else if (event.type === "trigger") {
      this.triggers[event.side] = event.value;
    } else {
      const key = event.key;
      if (event.pressed) this.keys.add(key);
      else this.keys.delete(key);
      if (event.pressed) this.each("OnKeyPressed", (b) => b.OnKeyPressed(key));
      else this.each("OnKeyReleased", (b) => b.OnKeyReleased(key));
    }
  }

  // ---- the tick -----------------------------------------------------------------------------------------------

  private tick(): void {
    const { core } = this;
    if (core.disposed) return;
    for (const behaviour of this.all()) {
      if (this.overrides(behaviour, "Update")) core.guard(`${this.idOf(behaviour)}.Update`, () => behaviour.Update());
    }
    this.sync.flush();
    this.perUser.flush();
    this.presence.flush();
    this.host.flush();
    if (this.scheduler.ticks % 20 === 0) {
      this.presence.tend();
      this.players.tend();
      this.secrets.review();
      this.commands.review();
      this.sync.takeOver();
      if (this.platform.clock.now() - this.lastClockAsk >= core.options.clockResyncMs) void this.askClock(false);
    }
  }

  // ---- refused writes -----------------------------------------------------------------------------------------

  private onRefusedPath(key: string, code: string, final: boolean): void {
    if (this.core.disposed) return;
    this.core.log(final ? "error" : "warn", `the room ${final ? "refused" : "is holding back"} a write to ${key}: ${code}`);
    if (key === "d" || /^p[0-3]$/.test(key)) {
      this.refuse(null, { kind: key === "d" ? "playerData" : "playerObject", code, key, final });
      return;
    }
    if (key.startsWith("x.")) {
      this.refuse(null, { kind: "protected", code, key: key.slice(2), final });
      return;
    }
    const slot = this.sync.slotForKey(key);
    if (!slot) {
      this.refuse(null, { kind: "state", code, key, final });
      return;
    }
    for (const member of slot.members) {
      if (final && !key.startsWith("o.")) this.core.guard("OnPostSerialization", () => member.behaviour.OnPostSerialization({ success: false, byteCount: 0 }));
      this.core.guard("OnWriteRefused", () => member.behaviour.OnWriteRefused({ kind: "state", code, key, final }));
    }
  }

  /** Reports a refusal to the behaviour it belongs to, or to every behaviour that listens and to the game. */
  private refuse(behaviour: Behaviour | null, refusal: WriteRefusal): void {
    if (behaviour) {
      this.core.guard("OnWriteRefused", () => behaviour.OnWriteRefused(refusal));
      return;
    }
    this.each("OnWriteRefused", (b) => b.OnWriteRefused(refusal));
    if (this.game.onWriteRefused) this.core.guard("onWriteRefused", () => this.game.onWriteRefused!(refusal));
  }

  // ---- inspection and teardown --------------------------------------------------------------------------------

  /** An ordinary behaviour by its bindings id (for tests and for the page registry). */
  behaviour<T extends Behaviour = Behaviour>(id: string): T {
    const found = this.byId.get(id);
    if (!found) throw new Error(`no behaviour '${id}' in ${this.core.slug}:${this.inst}`);
    return found as T;
  }

  /** A per-player behaviour: the copy of `id` that belongs to the player with session `sid`. */
  playerBehaviour<T extends Behaviour = Behaviour>(sid: string, id: string): T | null {
    return (this.playerBehaviourMap.get(sid)?.get(id) as T | undefined) ?? null;
  }

  /** A short hash of every synced field: equal on clients that agree. */
  digest(): string {
    return fnv1a(this.sync.snapshotText());
  }

  /**
   * Which writes this client's synced state is made of: "<writes>:<hash>", where writes is the sum of the sequence
   * numbers applied per leaf and the hash covers each leaf's (generation, sequence, writer). Two pages with the same
   * version hold the same writes, so their digests can be compared; a field that ticks on its own (a referee's timer)
   * moves the version, and a test waits until both pages report the same one. `stamp()` reads both at once.
   */
  version(): string {
    const parts: string[] = [];
    let writes = 0;
    for (const id of [...this.sync.slots.keys()].sort()) {
      const marker = this.sync.slots.get(id)!.applied;
      if (!marker) continue;
      writes += marker.n;
      parts.push(`${id}:${marker.g}.${marker.n}.${marker.w}`);
    }
    return `${writes}:${fnv1a(parts.join("|"))}`;
  }

  dispose(): void {
    const { core } = this;
    if (core.disposed) return;
    if (this.started) for (const behaviour of this.all()) core.guard("OnDestroy", () => behaviour.OnDestroy());
    for (const ability of this.abilitiesOff) this.platform.setAbility(ability, true);
    for (const control of this.blocksOn) this.platform.setBlock(control, false);
    this.presence.retire();
    this.perUser.retire();
    this.host.abandonClock();
    this.platform.expose(relayKey(core.slug, core.inst), null);
    core.dispose();
    this.kit?.destroy();
    this.kit = null;
    this.ready.resolve(false);
  }
}

/** "x y z" as a vector; with `uniform`, a single number stands for all three. Null when it does not parse. */
function triple(text: string | null, uniform: boolean): Vector3 | null {
  if (!text) return null;
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return new Vector3(parts[0], parts[1], parts[2]);
  if (uniform && parts.length === 1) return new Vector3(parts[0], parts[0], parts[0]);
  return null;
}
