// A game's behaviours with no room, no kit and no time: built from bindings.json exactly as an instance builds them
// (the same field values, the same order), linked to one local player who owns everything and is the referee, and
// driven by calling their methods. For golden vectors and for rules tests that would be slow through the fake room.
//
//   const bench = new RulesBench(game, bindings);
//   bench.start();
//   const board = bench.ofType<Board>("Board")[0];
//
// Network events sent to All or the owner run here at once and are recorded; delayed events wait for runDelayed();
// nothing is serialised anywhere (RequestSerialization is counted). Kit objects have no host: what a behaviour does
// to them (text, colours, layers) goes nowhere. Not part of a built script.

import { Behaviour, linkBehaviour, type BehaviourClass, type BehaviourLink } from "./behaviour.ts";
import { validateBindings, type BindingBehaviour, type Bindings } from "./bindings.ts";
import type { HostActions } from "./host.ts";
import type { GameDefinition } from "./instance.ts";
import { Networking, type NetHost, type StartKind } from "./networking.ts";
import { Player } from "./players.ts";
import { AudioClipRef, GameObject, makeComponent, type ComponentKind } from "./scene.ts";
import { isRecord } from "./util.ts";
import { decodeValue, Vector2 } from "./values.ts";

const noop = () => {};

/** Host actions that go nowhere (kit objects of a bench have no host). */
const NO_HOST: HostActions = {
  setText: noop,
  animBool: noop,
  animFloat: noop,
  animInt: noop,
  animTrigger: noop,
  animResetTrigger: noop,
  animPlay: noop,
  particles: noop,
  setColor: noop,
  matFloat: noop,
  uiColor: noop,
  setActive: noop,
  playClip: noop,
  audioPitch: noop,
  audioVolume: noop,
  animEnabled: noop,
  uiSetToggle: noop,
  uiSetSlider: noop,
  scale: noop,
  rbVelocity: noop,
  rbLaunch: noop,
  rbKinematic: noop,
  spawn: noop,
  despawn: noop,
  op: noop,
  requestClock: () => Promise.resolve(0),
  flush: noop,
};

export interface BenchOptions {
  /** The snippet element's attributes. */
  settings?: Record<string, string>;
  name?: string;
  uid?: string;
}

export class RulesBench {
  readonly bindings: Bindings;
  readonly local: Player;
  readonly behaviours: Behaviour[] = [];
  readonly objects = new Map<string, GameObject>();
  /** Network events in the order they were sent: "<behaviour id>.<name>". */
  readonly events: string[] = [];
  readonly logs: string[] = [];
  serializations = 0;
  /** Seconds GetServerTimeInSeconds() gives. */
  time = 0;
  private readonly byId = new Map<string, Behaviour>();
  private readonly types = new Map<Behaviour, string>();
  private readonly delayed: Array<{ behaviour: Behaviour; name: string }> = [];
  private kind: StartKind = "fresh";
  private readonly settings: Map<string, string>;

  constructor(game: GameDefinition, rawBindings: unknown, options: BenchOptions = {}) {
    this.bindings = validateBindings(rawBindings);
    this.local = new Player("bench", options.uid ?? "bench-user", options.name ?? "Bench", true, 1);
    this.local._isMaster = () => true;
    this.settings = new Map(Object.entries(options.settings ?? {}));
    for (const key of Object.keys(this.bindings.objects)) {
      const path = this.bindings.objects[key]!.path;
      this.objects.set(key, new GameObject(key, path.slice(path.lastIndexOf("/") + 1), null, NO_HOST));
    }
    const host: NetHost = {
      localPlayer: () => this.local,
      refereePlayer: () => this.local,
      isReferee: () => true,
      owner: () => this.local,
      isOwner: (_t, p) => p === this.local,
      setOwner: noop,
      behavioursOn: (object) => this.behaviours.filter((b) => b.gameObject === object),
      serverSeconds: () => this.time,
      playerList: () => [this.local],
      playerById: (id) => (id === 1 ? this.local : null),
      callingPlayer: () => null,
      callingSession: () => null,
      setCandidate: noop,
      isCandidate: () => true,
      startKind: () => this.kind,
    };
    const networking = new Networking(host);
    const made: Array<{ behaviour: Behaviour; binding: BindingBehaviour }> = [];
    for (const binding of this.bindings.behaviours) {
      const cls: BehaviourClass | undefined = game.behaviours[binding.type];
      if (!cls) throw new Error(`bindings name behaviour type '${binding.type}', which the game does not define`);
      if (binding.perPlayer === true || cls.perPlayer === true) continue;
      const behaviour = new cls();
      linkBehaviour(behaviour, this.link(behaviour, binding, networking));
      this.byId.set(binding.id, behaviour);
      this.types.set(behaviour, binding.type);
      this.behaviours.push(behaviour);
      made.push({ behaviour, binding });
    }
    for (const { behaviour, binding } of made) {
      const bag = behaviour as unknown as Record<string, unknown>;
      for (const name of Object.keys(binding.fields ?? {})) bag[name] = this.resolve(binding.fields![name]);
    }
  }

  /** Start() on every behaviour in bindings order, then OnInstanceStart(kind). */
  start(kind: StartKind = "fresh"): this {
    this.kind = kind;
    for (const b of this.behaviours) b.Start();
    for (const b of this.behaviours) b.OnInstanceStart(kind);
    return this;
  }

  behaviour<T extends Behaviour = Behaviour>(id: string): T {
    const b = this.byId.get(id);
    if (!b) throw new Error(`no behaviour '${id}'`);
    return b as T;
  }

  ofType<T extends Behaviour = Behaviour>(type: string): T[] {
    return this.behaviours.filter((b) => this.types.get(b) === type) as T[];
  }

  /** Runs the delayed events queued so far (SendCustomEventDelayedSeconds / Frames), in order. */
  runDelayed(): void {
    for (const { behaviour, name } of this.delayed.splice(0)) this.call(behaviour, name, []);
  }

  private readonly reach = new Map<Behaviour, number>();
  /** Behaviour.Shared on a bench. */
  readonly shared: Record<string, unknown> = {};

  private call(behaviour: Behaviour, name: string, args: unknown[]): void {
    const fn = (behaviour as unknown as Record<string, unknown>)[name];
    if (typeof fn === "function") fn.apply(behaviour, args);
    else this.logs.push(`no method ${name}`);
  }

  private link(behaviour: Behaviour, binding: BindingBehaviour, networking: Networking): BehaviourLink {
    const gameObject = (binding.object ? this.objects.get(binding.object) : undefined) ?? new GameObject("", binding.id, null, null);
    const bench = this;
    const say = (level: string) => (message: unknown) => bench.logs.push(`${level} ${String(message)}`);
    const unavailable = new Proxy({}, { get: () => { throw new Error("not available on a rules bench"); } });
    return {
      id: binding.id,
      gameObject,
      networking,
      time: { get time() { return bench.time; }, deltaTime: 0.05, frameCount: 0 },
      random: { value: 0.5, Range: (min, max) => (min + max) / 2, RangeInt: (min) => Math.floor(min), Bytes: (n) => new Uint8Array(Math.max(0, Math.floor(n))).map((_, i) => (i * 37 + 11) & 0xff) },
      debug: { Log: say("info"), LogWarning: say("warn"), LogError: say("error") },
      secrets: unavailable as never,
      storage: unavailable as never,
      host: NO_HOST,
      settings: this.settings,
      playerData: unavailable as never,
      input: {
        GetButton: () => false,
        GetThumbstick: () => new Vector2(0, 0),
        GetTrigger: () => 0,
        GetKey: () => false,
        Poses: null,
        Position: null,
        Haptic: noop,
        TeleportTo: noop,
        SetAbility: noop,
        SetBlock: noop,
        LastClickSide: null,
        IsVR: false,
        InReach: () => true,
      },
      protectedValues: { CanWrite: true, Set: noop, Get: (_k, fallback) => fallback, Has: () => false },
      player: null,
      instanceKey: "bench",
      shared: this.shared,
      reach: this.reach,
      requestSerialization: () => {
        bench.serializations++;
      },
      sendNetworkEvent: (_target, name, args) => {
        bench.events.push(`${binding.id}.${name}`);
        bench.call(behaviour, name, args);
      },
      sendCommand: (name, args) => {
        bench.call(behaviour, name, args);
        return 0;
      },
      delaySeconds: (name) => {
        bench.delayed.push({ behaviour, name });
      },
      delayFrames: (name) => {
        bench.delayed.push({ behaviour, name });
      },
      find: (id) => bench.byId.get(id) ?? null,
      findByType: (type) => bench.ofType(type),
      playerBehaviour: () => null,
      playerBehaviours: () => [],
      raycast: () => Promise.resolve(null),
      onGraphEvent: noop,
    };
  }

  private resolve(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.resolve(v));
    if (!isRecord(value)) return value;
    if (typeof value.$obj === "string") return this.objects.get(value.$obj) ?? null;
    if (typeof value.$beh === "string") return this.byId.get(value.$beh) ?? null;
    if (typeof value.$comp === "string") {
      const object = this.objects.get(value.$comp);
      return object ? makeComponent(String(value.kind ?? "Transform") as ComponentKind, object, NO_HOST) : null;
    }
    if (typeof value.$clip === "number") return new AudioClipRef(value.$clip, typeof value.on === "string" ? value.on : null);
    if (Object.keys(value).some((key) => key.startsWith("$"))) return decodeValue(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = this.resolve(value[key]);
    return out;
  }
}
