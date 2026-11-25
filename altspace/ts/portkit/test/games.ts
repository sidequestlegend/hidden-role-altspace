// Small games used only by the tests: behaviours that record what the runtime tells them.

import {
  Behaviour,
  NetworkEventTarget,
  ObjectPool,
  validateBindings,
  type BindingBehaviour,
  type BindingEvent,
  type Bindings,
  type DeserializationResult,
  type DrawState,
  type GameObject,
  type Player,
  type SerializationResult,
  type StartKind,
  type WriteRefusal,
} from "../src/index.ts";
import type { GameDefinition, GameInstance } from "../src/instance.ts";
import type { FakeClient, FakeRoom } from "../src/platform/fake.ts";
import type { BsOptions } from "../src/platform/bs.ts";

/** A behaviour with a few synced fields that counts every callback it gets. */
export class Probe extends Behaviour {
  static override synced = ["value", "text", "list"];
  /** What other clients may run here. `Set` and `_Private` are public and private methods that are not listed. */
  static override networkCallable = ["Ping", "Add", "Deal", "Mark", "RequestSerialization", "constructor", "_Private"];
  value = 0;
  text = "";
  list: number[] = [];

  log: string[] = [];
  deserialized = 0;
  snapshots = 0;
  rollbacks = 0;
  owners: number[] = [];
  joined: number[] = [];
  left: number[] = [];
  masters: Array<number | null> = [];
  posts: SerializationResult[] = [];
  refusals: WriteRefusal[] = [];
  pings: Array<{ args: unknown[]; from: number | null; uid: string; value?: number; text?: string }> = [];
  commands: Array<{ name: string; args: unknown[]; from: number | null }> = [];
  acks: number[] = [];
  startKinds: StartKind[] = [];
  updates = 0;
  elapsed = 0;
  delayed: string[] = [];
  graph: string[][] = [];
  draws: Array<{ player: number; label: string; state: DrawState }> = [];
  restored: number[] = [];
  dataUpdates: Array<{ player: number; keys: string[] }> = [];
  keys: string[] = [];
  buttons: string[] = [];
  protectedChanges: string[] = [];
  slider = -1;
  toggle: boolean | null = null;
  interacts = 0;
  drops: Array<{ x: number; y: number; z: number }> = [];
  wasMasterAtStart = false;

  override Start(): void {
    this.wasMasterAtStart = this.Networking.IsMaster;
    this.log.push("Start");
  }
  override OnInstanceStart(kind: StartKind): void {
    this.startKinds.push(kind);
    this.log.push("OnInstanceStart:" + kind);
  }
  override OnDeserialization(result: DeserializationResult): void {
    this.deserialized++;
    if (result.isSnapshot) this.snapshots++;
    if (result.isRollback) this.rollbacks++;
    this.log.push(`OnDeserialization:${this.value}${result.isSnapshot ? ":snapshot" : ""}`);
  }
  override OnPostSerialization(result: SerializationResult): void {
    this.posts.push(result);
  }
  override OnOwnershipTransferred(player: Player): void {
    this.owners.push(player.playerId);
  }
  override OnPlayerJoined(player: Player): void {
    this.joined.push(player.playerId);
    this.log.push("OnPlayerJoined:" + player.playerId);
  }
  override OnPlayerLeft(player: Player): void {
    this.left.push(player.playerId);
    this.log.push(`OnPlayerLeft:${player.playerId}:master=${this.Networking.IsMaster}`);
  }
  override OnMasterTransferred(master: Player | null): void {
    this.masters.push(master ? master.playerId : null);
  }
  override OnWriteRefused(refusal: WriteRefusal): void {
    this.refusals.push(refusal);
  }
  override OnCommandAcknowledged(number: number): void {
    this.acks.push(number);
  }
  override OnDrawChanged(player: Player, label: string, state: DrawState): void {
    this.draws.push({ player: player.playerId, label, state });
  }
  override OnPlayerRestored(player: Player): void {
    this.restored.push(player.playerId);
    this.log.push("OnPlayerRestored:" + player.playerId);
  }
  override OnPlayerDataUpdated(player: Player, keys: string[]): void {
    this.dataUpdates.push({ player: player.playerId, keys });
    this.log.push(`OnPlayerDataUpdated:${player.playerId}:${keys.join(",")}`);
  }
  override OnKeyPressed(key: string): void {
    this.keys.push("+" + key);
  }
  override OnKeyReleased(key: string): void {
    this.keys.push("-" + key);
  }
  override OnButtonPressed(button: number, side: number): void {
    this.buttons.push(`+${side}/${button}`);
  }
  override OnButtonReleased(button: number, side: number): void {
    this.buttons.push(`-${side}/${button}`);
  }
  override OnProtectedChanged(key: string): void {
    this.protectedChanges.push(key);
  }
  override Update(): void {
    this.updates++;
    this.elapsed += this.Time.deltaTime;
  }
  override Interact(): void {
    this.interacts++;
  }
  override OnDrop(): void {
    const p = this.transform.position;
    this.drops.push({ x: p.x, y: p.y, z: p.z });
  }

  /** The upstream idiom: take ownership, change, serialise. */
  Set(value: number, text = ""): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.value = value;
    if (text) this.text = text;
    this.RequestSerialization();
  }
  /** Change and serialise without taking ownership: only the owner's request does anything. */
  SetAsIs(value: number): void {
    this.value = value;
    this.RequestSerialization();
  }
  Ping(...args: unknown[]): void {
    const from = this.Networking.CallingPlayer;
    this.pings.push({ args, from: from ? from.playerId : null, uid: this.Networking.CallingSession?.uid ?? "", value: this.value, text: this.text });
  }
  Broadcast(...args: unknown[]): void {
    this.SendCustomNetworkEvent(NetworkEventTarget.All, "Ping", ...args);
  }
  ToOwner(...args: unknown[]): void {
    this.SendCustomNetworkEvent(NetworkEventTarget.Owner, "Ping", ...args);
  }
  /** A request to the referee: adds to `value`, as the master would on a "task". */
  Add(amount: number): void {
    const from = this.Networking.CallingPlayer;
    this.commands.push({ name: "Add", args: [amount], from: from ? from.playerId : null });
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.value += amount;
    this.RequestSerialization();
  }
  /** A command whose handler publishes a user-state record: the referee begins a dealt draw. */
  Deal(label: string): void {
    this.commands.push({ name: "Deal", args: [label], from: this.Networking.CallingPlayer?.playerId ?? null });
    this.Secrets.beginDeal(label, []);
  }
  /** A command whose handler writes the referee's own user state directly (any runtime record would do). */
  Mark(n: number): void {
    this.commands.push({ name: "Mark", args: [n], from: this.Networking.CallingPlayer?.playerId ?? null });
    this.Secrets.publish("mark", String(n));
  }
  Later(): void {
    this.delayed.push(`Later@${this.Time.time.toFixed(2)}`);
  }
  Frames(): void {
    this.delayed.push(`Frames@${this.Time.frameCount}`);
  }
  OnGraph(...args: string[]): void {
    this.graph.push(args);
  }
  OnSlider(value: number): void {
    this.slider = value;
  }
  OnToggle(value: boolean): void {
    this.toggle = value;
  }
  _Private(): void {
    this.pings.push({ args: ["private"], from: null, uid: "" });
  }
}

/** UdonSharp's [FieldChangeCallback]: `_open` is synced, and `Open` is the property whose setter reacts. */
export class Door extends Behaviour {
  static override synced = ["_open", "label"];
  static override fieldChangeCallbacks = { _open: "Open" };
  _open = false;
  label = "";
  setterCalls: boolean[] = [];
  deserialized = 0;

  get Open(): boolean {
    return this._open;
  }
  set Open(value: boolean) {
    this._open = value;
    this.setterCalls.push(value);
  }
  override OnDeserialization(): void {
    this.deserialized++;
  }
  Toggle(label = ""): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.Open = !this._open;
    this.label = label;
    this.RequestSerialization();
  }
  Relabel(label: string): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.label = label;
    this.RequestSerialization();
  }
}

/** One of many small behaviours that share a sync group (a board's pieces). */
export class Piece extends Behaviour {
  static override synced = ["x", "y"];
  static override fieldChangeCallbacks = { x: "X" };
  x = 0;
  y = 0;
  deserialized = 0;
  xChanges: number[] = [];
  get X(): number {
    return this.x;
  }
  set X(value: number) {
    this.x = value;
    this.xChanges.push(value);
  }
  override OnDeserialization(): void {
    this.deserialized++;
  }
  MoveTo(x: number, y: number): void {
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.x = x;
    this.y = y;
    this.RequestSerialization();
  }
}

/** A behaviour sent continuously, as a VRChat "Continuous" sync mode behaviour is. */
export class Meter extends Behaviour {
  static override synced = ["level"];
  static override syncMode = "continuous" as const;
  level = 0;
  deserialized = 0;
  override OnDeserialization(): void {
    this.deserialized++;
  }
}

/** A per-player behaviour (VRChat: a PlayerObject): one copy for each player, owned by that player. */
export class Sheet extends Behaviour {
  static override perPlayer = true;
  static override synced = ["hp", "title"];
  static override networkCallable = ["Wave"];
  hp = 10;
  title = "";
  started = 0;
  destroyed = 0;
  deserialized = 0;
  pings: Array<{ args: unknown[]; from: number | null }> = [];
  override Start(): void {
    this.started++;
  }
  override OnDestroy(): void {
    this.destroyed++;
  }
  override OnDeserialization(): void {
    this.deserialized++;
  }
  Hurt(amount: number): void {
    this.hp -= amount;
    this.RequestSerialization();
  }
  Wave(...args: unknown[]): void {
    this.pings.push({ args, from: this.Networking.CallingPlayer?.playerId ?? null });
  }
}

/** A per-player behaviour whose fields are saved on the device and come back on the next visit. */
export class SavedSheet extends Sheet {
  static override persistent = true;
}

export interface GameSpec {
  slug: string;
  behaviours: Array<BindingBehaviour>;
  /** Object keys; each gets the path `Root/<key>`, and flags by name: click*, grab*, sync*. */
  objects?: string[];
  refs?: string[];
  events?: BindingEvent[];
  definition?: Partial<GameDefinition>;
}

export interface TestGame {
  game: GameDefinition;
  bindings: Bindings;
  kit: string;
}

const CLASSES = { Probe, Door, Piece, Meter, Sheet, SavedSheet, ObjectPool };

/** Builds a game definition and its bindings from a short description. */
export function makeGame(spec: GameSpec): TestGame {
  const objects: Record<string, unknown> = { root: { path: "Root", sync: "none", grab: false, click: false, seat: false } };
  for (const key of spec.objects ?? []) {
    objects[key] = { path: `Root/${key}`, sync: key.startsWith("sync") ? "transform" : "none", grab: key.startsWith("grab") || key.startsWith("sync"), click: key.startsWith("click"), seat: false, ...(key.startsWith("attach") ? { attach: true } : {}) };
  }
  const bindings = validateBindings({
    schema: 1,
    slug: spec.slug,
    bundles: { windows: "", android: "" },
    objects,
    refs: spec.refs ?? Object.keys(objects),
    behaviours: spec.behaviours,
    events: spec.events ?? [],
  });
  return { game: { slug: spec.slug, behaviours: CLASSES, ...(spec.definition ?? {}) }, bindings, kit: `https://kits.test/${spec.slug}.bundle` };
}

/** A game with one Probe called "p" on a clickable object, enough for most tests. */
export function probeGame(slug = "probe", definition: Partial<GameDefinition> = {}): TestGame {
  return makeGame({ slug, objects: ["clickA"], behaviours: [{ id: "p", type: "Probe", object: "clickA" }], definition });
}

/** A player arrives with `games` on their page, one element each (or as `elements` says). */
export function enter(room: FakeRoom, games: TestGame[], options: { uid?: string; name?: string; device?: string; elements?: Array<{ slug: string; attributes?: Record<string, string> }>; adapter?: Partial<BsOptions> } = {}): FakeClient {
  const client = room.join({ uid: options.uid, name: options.name, device: options.device, adapter: options.adapter });
  for (const g of games) {
    room.defineKit(g.kit, g.bindings);
    client.load(g.game, g.bindings);
  }
  const elements: Array<{ slug: string; attributes?: Record<string, string> }> = options.elements ?? games.map((g) => ({ slug: g.game.slug }));
  for (const element of elements) {
    const kit = games.find((g) => g.game.slug === element.slug)!.kit;
    client.addSnippet(element.slug, { windows: kit, ...(element.attributes ?? {}) });
  }
  return client;
}

export function running(client: FakeClient, slug: string, inst = "0"): boolean {
  return client.hasInstance(slug, inst) && client.instance(slug, inst).started;
}

/** Runs the room until every client has started `slug` and sees `players` players (all of them by default). */
export async function untilStarted(room: FakeRoom, clients: FakeClient[], slug: string, inst = "0", players = clients.length): Promise<void> {
  const ok = await room.runUntil(() => clients.every((c) => running(c, slug, inst) && c.instance(slug, inst).networking.GetPlayerCount() >= players), 30000);
  if (!ok) {
    const why = clients.map((c) => `${c.name}: started=${running(c, slug, inst)} ${c.logged("warn").concat(c.logged("error")).slice(-3).join(" | ")}`);
    throw new Error(`not everyone started ${slug}:${inst}\n  ${why.join("\n  ")}`);
  }
}

export function inst(client: FakeClient, slug: string, key = "0"): GameInstance {
  return client.instance(slug, key);
}

export function probe(client: FakeClient, slug = "probe", key = "0", id = "p"): Probe {
  return client.instance(slug, key).behaviour<Probe>(id);
}

export function objectOf(client: FakeClient, slug: string, key: string, objKey: string): GameObject {
  return client.instance(slug, key).objects.get(objKey)!;
}
