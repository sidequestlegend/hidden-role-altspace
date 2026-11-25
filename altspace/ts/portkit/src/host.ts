// What the page cannot do to kit objects itself goes to the kit's relay graph (README, "Relay graph"). Game code
// sees only the HostActions interface, so the transport behind it can change without touching a port.
//
// A target is a key of bindings.objects that is listed in bindings.refs (sent as its index), or "@<path>" for
// an object addressed by its path under the kit root (objects made at run time have no index).

import { relayKey } from "./names.ts";
import type { Clock, Platform } from "./types.ts";
import type { Color, Vector3 } from "./values.ts";

export interface HostActions {
  /** Sets the text of a TMP or legacy UI text on the object. */
  setText(target: string, text: string): void;
  animBool(target: string, name: string, value: boolean): void;
  animFloat(target: string, name: string, value: number): void;
  animInt(target: string, name: string, value: number): void;
  animTrigger(target: string, name: string): void;
  animResetTrigger(target: string, name: string): void;
  /** Animator.Play, or CrossFade when `crossFadeSeconds` is above zero. */
  animPlay(target: string, state: string, crossFadeSeconds?: number): void;
  particles(target: string, play: boolean): void;
  /** Sets a material colour property on the object's renderer (for example "_BaseColor"), on material `slot`. */
  setColor(target: string, property: string, color: Color, slot?: number): void;
  /** Sets a material float property on the object's renderer (for example a flipbook frame), on material `slot`. */
  matFloat(target: string, property: string, value: number, slot?: number): void;
  /** Sets the colour of a uGUI graphic (Image, Text) on the object. */
  uiColor(target: string, color: Color): void;
  setActive(target: string, active: boolean): void;
  /**
   * Plays one clip through the target's audio source. The clip is number `clipIndex` of the clip list on
   * `clipsOn` (another object, when a manager keeps the clips), or of the target's own list.
   */
  playClip(target: string, clipIndex: number, clipsOn?: string, volumeScale?: number): void;
  /** AudioSource.pitch of the target's audio source. */
  audioPitch(target: string, pitch: number): void;
  /** AudioSource.volume of the target's audio source (0 to 1). */
  audioVolume(target: string, volume: number): void;
  /** Animator.enabled: a disabled animator holds its pose. */
  animEnabled(target: string, enabled: boolean): void;
  /** Toggle.isOn of a uGUI toggle, without firing its event (so no uiToggle comes back). */
  uiSetToggle(target: string, on: boolean): void;
  /** Slider.value of a uGUI slider, without firing its event (so no uiSlider comes back). */
  uiSetSlider(target: string, value: number): void;
  /** Transform.localScale, for an object the page cannot reach (one addressed by `@<path>`). */
  scale(target: string, localScale: Vector3): void;
  /** Rigidbody.linearVelocity of the target (meaningful on the client that simulates the body: its owner). */
  rbVelocity(target: string, velocity: Vector3): void;
  /**
   * A launch: the target's Rigidbody stops being kinematic now and gets `velocity` on the second physics step after,
   * so that the SDK's handoff for a synced body (which sets its tracked velocity, zero at rest, in its first step)
   * cannot undo it. One pending launch per kit: a second one before the first has landed replaces it.
   */
  rbLaunch(target: string, velocity: Vector3): void;
  /** Rigidbody.isKinematic of the target. */
  rbKinematic(target: string, kinematic: boolean): void;
  /** A copy of the target (a template object in the kit) under the same parent, named `name`, active: `@<parent path>/<name>` addresses it. */
  spawn(target: string, name: string): void;
  /** Destroys the target (a copy made with `spawn`). */
  despawn(target: string): void;
  /**
   * A relay op of the game's own (added by its kit builder in `KitBuilder.RelayOps`). Arguments go as text,
   * encoded. With `property`, the op is a value: it is sent only when it changed, and a newer value in the same
   * tick replaces the older one (as `text` or `color` are); without, every call is sent. Batched like the rest.
   */
  op(name: string, target: string, args: Array<string | number | boolean>, property?: string): void;
  /** Asks the host for the synced clock, in seconds. */
  requestClock(): Promise<number>;
  /** Sends what was queued. The runtime calls it once per tick; call it yourself only to force an early send. */
  flush(): void;
}

/**
 * Percent-encodes what would otherwise break the framing ("|" between arguments, "^" between records) or force
 * a backslash escape in the JSON literal the graph receives.
 */
export function encodeRelayArg(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x25 || c === 0x7c || c === 0x5e || c === 0x22 || c === 0x5c || c < 0x20) {
      out += "%" + c.toString(16).toUpperCase().padStart(2, "0");
    } else if (c >= 0xd800 && c <= 0xdfff) {
      // A surrogate pair travels as is; half of one would be escaped by JSON.stringify, so it is replaced.
      const pairStart = c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00;
      if (pairStart) {
        out += text[i]! + text[i + 1]!;
        i++;
      } else out += "�";
    } else out += text[i];
  }
  return out;
}

export function decodeRelayArg(text: string): string {
  return text.replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** A number as an invariant-culture string a graph can parse: no exponent, at most six decimals. */
export function relayNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

/** One record: "<op>|<target>|<arg>|<arg>...". `target` is a Refs index or "@<path>"; everything is encoded. */
export function relayRecord(op: string, target: number | string, args: string[]): string {
  let record = op + "|" + (typeof target === "number" ? String(target) : encodeRelayArg(target));
  for (const arg of args) record += "|" + encodeRelayArg(arg);
  return record;
}

/** One payload: "<slug>:<inst>|" and its records joined by "^". */
export function relayPayload(slug: string, inst: string, records: string[]): string {
  return relayKey(slug, inst) + "|" + records.join("^");
}

export interface RelayRecord {
  op: string;
  /** A Refs index as text ("3"), or "@<path>". */
  target: string;
  args: string[];
}

/** The reverse of `relayPayload`, for the fake room's graph and for tests. Null when the text is not a payload. */
export function parseRelayPayload(payload: string): { key: string; records: RelayRecord[] } | null {
  const bar = payload.indexOf("|");
  if (bar <= 0) return null;
  const records = payload
    .slice(bar + 1)
    .split("^")
    .map((text) => {
      const parts = text.split("|");
      return { op: parts[0] ?? "", target: decodeRelayArg(parts[1] ?? ""), args: parts.slice(2).map(decodeRelayArg) };
    });
  return { key: payload.slice(0, bar), records };
}

/** The arguments of a graph-to-page event ("<arg>|<arg>..."), decoded. */
export function parseEventArgs(text: string): string[] {
  return text === "" ? [] : text.split("|").map(decodeRelayArg);
}

/** A material property with its slot: "#2:_Color". Slot 0 needs no prefix. */
export function materialProperty(property: string, slot = 0): string {
  return slot > 0 ? `#${Math.floor(slot)}:${property}` : property;
}

interface Queued {
  /** Target and property, for values; null for events that must each be sent (a trigger, a particle burst). */
  slot: string | null;
  record: string;
}

/** The largest payload sent in one bridge call; a longer batch is split. */
const MAX_PAYLOAD = 12000;

export class RelayHost implements HostActions {
  private readonly platform: Platform;
  private readonly slug: string;
  private readonly inst: string;
  private readonly refs: readonly string[];
  private readonly warned = new Set<string>();
  private readonly waiting = new Map<string, (seconds: number) => void>();
  /** What was last sent (or queued) per target and property: an unchanged value is not sent again. */
  private readonly last = new Map<string, string>();
  private queue: Queued[] = [];
  private nextRequest = 1;
  /** Payloads and records handed to the bridge, for tests and diagnostics. */
  payloadsSent = 0;
  recordsSent = 0;
  /**
   * The path under the kit root of a bound object (bindings.objects), or undefined. `setActive` on a bound object
   * outside refs goes by the relay as `@<path>`: one road for the object's whole life, in order with every other
   * relay op, and one that can switch an object the page cannot see (an inactive one) back on.
   */
  pathOf: (objKey: string) => string | undefined = () => undefined;
  /** Plays a clip of the object's own list through the page when the page can reach the object. */
  fallbackClip: (objKey: string, clipIndex: number) => boolean = () => false;

  constructor(platform: Platform, slug: string, inst: string, refs: readonly string[]) {
    this.platform = platform;
    this.slug = slug;
    this.inst = inst;
    this.refs = refs;
  }

  /** Called with the graph's reply to a clock op. */
  onClockReply(requestId: string, seconds: number): void {
    const resolve = this.waiting.get(requestId);
    if (!resolve) return;
    this.waiting.delete(requestId);
    resolve(seconds);
  }

  setText(target: string, text: string): void {
    this.value("text", target, "text", [text]);
  }
  animBool(target: string, name: string, value: boolean): void {
    this.value("animBool", target, "anim." + name, [name, value ? "1" : "0"]);
  }
  animFloat(target: string, name: string, value: number): void {
    this.value("animFloat", target, "anim." + name, [name, relayNumber(value)]);
  }
  animInt(target: string, name: string, value: number): void {
    this.value("animInt", target, "anim." + name, [name, String(Math.trunc(value))]);
  }
  animResetTrigger(target: string, name: string): void {
    this.event("animResetTrigger", target, [name]);
  }
  animPlay(target: string, state: string, crossFadeSeconds = 0): void {
    this.event("animPlay", target, [state, relayNumber(crossFadeSeconds)]);
  }
  animTrigger(target: string, name: string): void {
    this.event("animTrigger", target, [name, "1"]);
  }
  particles(target: string, play: boolean): void {
    this.event("particles", target, [play ? "play" : "stop"]);
  }
  setColor(target: string, property: string, color: Color, slot = 0): void {
    const name = materialProperty(property, slot);
    this.value("color", target, "color." + name, [name, relayNumber(color.r), relayNumber(color.g), relayNumber(color.b), relayNumber(color.a)]);
  }
  matFloat(target: string, property: string, value: number, slot = 0): void {
    const name = materialProperty(property, slot);
    this.value("matFloat", target, "mat." + name, [name, relayNumber(value)]);
  }
  uiColor(target: string, color: Color): void {
    this.value("uiColor", target, "uiColor", [relayNumber(color.r), relayNumber(color.g), relayNumber(color.b), relayNumber(color.a)]);
  }
  setActive(target: string, active: boolean): void {
    if (!target.startsWith("@") && this.refs.indexOf(target) < 0) {
      const path = this.pathOf(target);
      if (path !== undefined) target = "@" + path;
    }
    this.value("active", target, "active", [active ? "1" : "0"]);
  }

  playClip(target: string, clipIndex: number, clipsOn?: string, volumeScale?: number): void {
    const own = clipsOn === undefined || clipsOn === target;
    const scaled = volumeScale !== undefined && volumeScale !== 1;
    if (own && !scaled && !target.startsWith("@") && this.refs.indexOf(target) < 0 && this.fallbackClip(target, clipIndex)) return;
    // The graph finds the clip in the holder's PkClips list by the holder's refs index, which is always sent.
    const holder = this.resolve("audio", own ? target : clipsOn!);
    if (holder === null) return;
    if (typeof holder !== "number") {
      this.warnOnce(`audio:${holder}`, `the clips of ${holder} cannot be played: the audio op needs the holder in bindings.refs`);
      return;
    }
    if (scaled) this.event("audioScaled", target, [String(Math.trunc(clipIndex)), String(holder), relayNumber(volumeScale)]);
    else this.event("audio", target, [String(Math.trunc(clipIndex)), String(holder)]);
  }

  audioPitch(target: string, pitch: number): void {
    this.value("audioPitch", target, "audioPitch", [relayNumber(pitch)]);
  }
  audioVolume(target: string, volume: number): void {
    this.value("audioVolume", target, "audioVolume", [relayNumber(volume)]);
  }
  animEnabled(target: string, enabled: boolean): void {
    this.value("animEnabled", target, "animEnabled", [enabled ? "1" : "0"]);
  }
  uiSetToggle(target: string, on: boolean): void {
    this.value("uiSetToggle", target, "uiSetToggle", [on ? "1" : "0"]);
  }
  uiSetSlider(target: string, value: number): void {
    this.value("uiSetSlider", target, "uiSetSlider", [relayNumber(value)]);
  }
  scale(target: string, localScale: Vector3): void {
    this.value("scale", target, "scale", [relayNumber(localScale.x), relayNumber(localScale.y), relayNumber(localScale.z)]);
  }
  rbVelocity(target: string, velocity: Vector3): void {
    this.event("rbVelocity", target, [relayNumber(velocity.x), relayNumber(velocity.y), relayNumber(velocity.z)]);
  }
  rbLaunch(target: string, velocity: Vector3): void {
    this.event("rbLaunch", target, [relayNumber(velocity.x), relayNumber(velocity.y), relayNumber(velocity.z)]);
    // the body is no longer kinematic: a later rbKinematic(true) must be sent even if it was the last value sent
    const wire = this.resolve("rbLaunch", target);
    if (wire !== null) this.last.delete(`${wire}/rbKinematic`);
  }
  rbKinematic(target: string, kinematic: boolean): void {
    this.value("rbKinematic", target, "rbKinematic", [kinematic ? "1" : "0"]);
  }
  spawn(target: string, name: string): void {
    this.event("spawn", target, [name]);
  }
  despawn(target: string): void {
    this.event("despawn", target, []);
    // A copy made again under the same path starts from nothing: forget what was sent to the old one.
    if (target.startsWith("@")) for (const key of [...this.last.keys()]) if (key.startsWith(target + "/")) this.last.delete(key);
  }

  op(name: string, target: string, args: Array<string | number | boolean>, property?: string): void {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === "clock") throw new Error(`'${name}' is not a relay op name (letters, digits, _; not clock)`);
    const text = args.map((a) => (typeof a === "number" ? relayNumber(a) : typeof a === "boolean" ? (a ? "1" : "0") : String(a)));
    if (property !== undefined) this.value(name, target, `op.${name}.${property}`, text);
    else this.event(name, target, text);
  }

  /**
   * A request the graph answers with a graph event (pkHead), sent at once and with no target (as the clock): `args`
   * are sent as they are (ids and session ids, which need no encoding).
   */
  request(op: string, args: string[]): void {
    this.platform.relaySend(relayPayload(this.slug, this.inst, [relayRecord(op, 0, args.map(encodeRelayArg))]));
  }

  /** The clock is not batched: its answer is timed from the moment it is sent. */
  requestClock(): Promise<number> {
    const id = String(this.nextRequest++);
    return new Promise<number>((resolve) => {
      this.waiting.set(id, resolve);
      this.platform.relaySend(relayPayload(this.slug, this.inst, [relayRecord("clock", 0, [id])]));
    });
  }

  /** Forgets clock requests nobody answered. */
  abandonClock(): void {
    this.waiting.clear();
  }

  /** Forgets what was sent, so that every value goes out again (after the kit was loaded anew). */
  forget(): void {
    this.last.clear();
  }

  flush(): void {
    if (!this.queue.length) return;
    const queue = this.queue;
    this.queue = [];
    const prefix = relayKey(this.slug, this.inst).length + 1;
    let batch: string[] = [];
    let size = prefix;
    const send = () => {
      if (!batch.length) return;
      this.payloadsSent++;
      this.recordsSent += batch.length;
      this.platform.relaySend(relayPayload(this.slug, this.inst, batch));
      batch = [];
      size = prefix;
    };
    for (const item of queue) {
      if (batch.length && size + item.record.length + 1 > MAX_PAYLOAD) send();
      batch.push(item.record);
      size += item.record.length + 1;
    }
    send();
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.platform.log("warn", `[${this.slug}:${this.inst}] ${message}`);
  }

  /** The wire form of a target: a Refs index, "@<path>", or null when the relay cannot reach the object. */
  private resolve(op: string, target: string): number | string | null {
    if (target.startsWith("@")) return target;
    const index = this.refs.indexOf(target);
    if (index >= 0) return index;
    if (!this.warned.has(target)) {
      this.warned.add(target);
      this.platform.log("warn", `[${this.slug}:${this.inst}] '${target}' is not in bindings.refs, so the relay graph cannot reach it (${op} ignored)`);
    }
    return null;
  }

  /** Queues a value. Sending the same value again does nothing; a newer one in the same tick replaces it. */
  private value(op: string, target: string, property: string, args: string[]): void {
    const wire = this.resolve(op, target);
    if (wire === null) return;
    const record = relayRecord(op, wire, args);
    const slot = `${wire}/${property}`;
    if (this.last.get(slot) === record) return;
    this.last.set(slot, record);
    const pending = this.queue.find((q) => q.slot === slot);
    if (pending) pending.record = record;
    else this.queue.push({ slot, record });
  }

  private event(op: string, target: string, args: string[]): void {
    const wire = this.resolve(op, target);
    if (wire === null) return;
    this.queue.push({ slot: null, record: relayRecord(op, wire, args) });
  }
}

/**
 * Synced time for GetServerTimeInSeconds(). The page cannot read the synced clock itself, so the value arrives
 * through the relay graph and is kept as an offset from the local monotonic clock.
 */
export class ClockSync {
  private readonly clock: Clock;
  private offsetSeconds: number;
  synced = false;

  constructor(clock: Clock) {
    this.clock = clock;
    this.offsetSeconds = clock.wallSeconds() - clock.now() / 1000;
  }

  /** `sentAt` and the present bracket the host's reading; it is placed halfway between them. */
  accept(hostSeconds: number, sentAtMs: number): void {
    if (!Number.isFinite(hostSeconds)) return;
    const mid = (sentAtMs + this.clock.now()) / 2;
    this.offsetSeconds = hostSeconds - mid / 1000;
    this.synced = true;
  }

  seconds(): number {
    return this.clock.now() / 1000 + this.offsetSeconds;
  }
}
