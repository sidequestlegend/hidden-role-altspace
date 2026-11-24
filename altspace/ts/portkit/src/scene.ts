// Kit objects as translated code sees them: a GameObject with a Transform, and proxies for the components
// bindings.json can name. Reads come from a local mirror; writes are fire-and-forget.

import type { HostActions } from "./host.ts";
import type { HostEventDetail, HostEventKind, HostObject } from "./types.ts";
import { Color, Quaternion, Vector3 } from "./values.ts";

export class Transform {
  readonly gameObject: GameObject;
  private pos = Vector3.zero;
  private rot = Quaternion.identity;
  private lpos = Vector3.zero;
  private lrot = Quaternion.identity;
  private lscale = Vector3.one;
  /** False until the world pose has been read from the host or set by the script. */
  known = false;

  constructor(gameObject: GameObject) {
    this.gameObject = gameObject;
  }

  /** World position as last set or reported. Returns a copy, as a C# struct would be. */
  get position(): Vector3 { return this.pos.clone(); }
  set position(v: Vector3) {
    this.pos = v.clone();
    this.known = true;
    this.gameObject.host?.setTransform({ position: v.clone() });
  }
  get rotation(): Quaternion { return this.rot.clone(); }
  set rotation(q: Quaternion) {
    this.rot = q.clone();
    this.known = true;
    this.gameObject.host?.setTransform({ rotation: q.clone() });
  }
  get eulerAngles(): Vector3 { return this.rot.eulerAngles; }
  set eulerAngles(v: Vector3) { this.rotation = Quaternion.Euler(v.x, v.y, v.z); }
  /** Local values are only what the script itself set: the host is not asked for them. */
  get localPosition(): Vector3 { return this.lpos.clone(); }
  set localPosition(v: Vector3) {
    this.lpos = v.clone();
    this.gameObject.host?.setTransform({ localPosition: v.clone() });
  }
  get localRotation(): Quaternion { return this.lrot.clone(); }
  set localRotation(q: Quaternion) {
    this.lrot = q.clone();
    this.gameObject.host?.setTransform({ localRotation: q.clone() });
  }
  get localScale(): Vector3 { return this.lscale.clone(); }
  set localScale(v: Vector3) {
    this.lscale = v.clone();
    this.gameObject.host?.setTransform({ localScale: v.clone() });
  }
  get forward(): Vector3 { return this.rot.rotate(Vector3.forward); }
  get up(): Vector3 { return this.rot.rotate(Vector3.up); }
  get right(): Vector3 { return this.rot.rotate(Vector3.right); }

  SetPositionAndRotation(position: Vector3, rotation: Quaternion): void {
    this.pos = position.clone();
    this.rot = rotation.clone();
    this.known = true;
    this.gameObject.host?.setTransform({ position: position.clone(), rotation: rotation.clone() });
  }

  /** Asks the host where the object is now (after a drop, or physics). Await it before reading `position`. */
  async Refresh(): Promise<void> {
    const pose = await this.gameObject.host?.readTransform();
    if (pose) this._report(pose.position, pose.rotation);
  }

  /** @internal The host reported the object's pose. */
  _report(position: Vector3, rotation: Quaternion): void {
    this.pos = position.clone();
    this.rot = rotation.clone();
    this.known = true;
  }
}

export class GameObject {
  /** The key in bindings.objects, or "" for an object that only exists in the script. */
  readonly key: string;
  readonly name: string;
  readonly transform: Transform;
  /** @internal */
  host: HostObject | null;
  private readonly actions: HostActions | null;
  private readonly subscribe: ((kind: HostEventKind, handler: (detail: HostEventDetail) => void) => void) | null;
  private active = true;
  private layerValue = -1;

  constructor(
    key: string,
    name: string,
    host: HostObject | null,
    actions: HostActions | null,
    subscribe: ((kind: HostEventKind, handler: (detail: HostEventDetail) => void) => void) | null = null,
  ) {
    this.key = key;
    this.name = name;
    this.host = host;
    this.actions = actions;
    this.subscribe = subscribe;
    this.transform = new Transform(this);
  }

  /** As last set by the script (objects start active unless the script says otherwise). */
  get activeSelf(): boolean {
    return this.active;
  }

  SetActive(active: boolean): void {
    this.active = !!active;
    if (this.actions && this.key) this.actions.setActive(this.key, this.active);
    else this.host?.setActive(this.active);
  }

  /**
   * The object's layer as last set by the script (-1 before that: the kit's own). Setting it moves the object's
   * collider: 20 (Grabbable) for a pickup that may be picked up, 5 (UI) for one that may not, which is then
   * clickable and lets hands pass through. Only what changes is sent.
   */
  get layer(): number {
    return this.layerValue;
  }
  set layer(value: number) {
    const layer = Math.trunc(value);
    if (layer === this.layerValue) return;
    this.layerValue = layer;
    this.host?.setLayer(layer);
  }

  /**
   * Listens to this object's events: the page's own (click, grab, drop, ...) and those a graph reports for it
   * (uiButton, uiSlider, heldTrigger, ...). Prefer `events` in bindings.json; this is for wiring made in code.
   * The listener lives as long as the instance.
   */
  On(kind: HostEventKind, handler: (detail: HostEventDetail) => void): void {
    if (this.subscribe) this.subscribe(kind, handler);
    else this.host?.on(kind, handler);
  }

  /**
   * Attaches this object to the local player's hand (0 left, 1 right), at an offset from it (BS.AttachedObject;
   * UNVERIFIED in Play mode). Only the local player can be attached to; other players see it only through a synced
   * transform.
   */
  AttachToHand(side: 0 | 1, position: Vector3 = new Vector3(), rotation: Quaternion = new Quaternion()): void {
    this.host?.attachToHand(side, position, rotation);
  }

  /** Lets go of what AttachToHand attached. */
  Detach(): void {
    this.host?.detach();
  }

  /** Makes the local player let go of this object if they hold it (VRChat: VRCPickup.Drop()); `drop` follows. */
  ReleaseGrab(): void {
    this.host?.releaseGrab();
  }

  /** Asks to own the object's synced transform (VRChat: Networking.SetOwner on a VRCObjectSync). */
  TakeOwnership(): void {
    this.host?.takeOwnership();
  }

  toString(): string {
    return this.name || this.key;
  }
}

// ---- component proxies ----------------------------------------------------------------------------------------

/** The kinds with a proxy of their own. Bindings may name any other component type; it gets a plain ComponentRef. */
export type ComponentKind = "Text" | "TMP" | "AudioSource" | "Animator" | "Renderer" | "ParticleSystem" | "Transform" | "Collider" | "Rigidbody" | (string & {});

export class ComponentRef {
  readonly kind: ComponentKind;
  readonly gameObject: GameObject;
  protected readonly actions: HostActions;

  constructor(kind: ComponentKind, gameObject: GameObject, actions: HostActions) {
    this.kind = kind;
    this.gameObject = gameObject;
    this.actions = actions;
  }

  get transform(): Transform {
    return this.gameObject.transform;
  }
}

/** A TMP or legacy UI text. Reading `text` gives what the script last wrote. */
export class TextRef extends ComponentRef {
  private value = "";
  get text(): string { return this.value; }
  set text(value: string) {
    const next = value === null || value === undefined ? "" : String(value);
    if (next === this.value) return;
    this.value = next;
    this.actions.setText(this.gameObject.key, next);
  }
  /** The colour of the text (a uGUI graphic). */
  set color(value: Color) {
    this.actions.uiColor(this.gameObject.key, value);
  }
}

export class AnimatorRef extends ComponentRef {
  private on = true;
  /** Animator.enabled: a disabled animator holds its pose. Reading gives what the script last set. */
  get enabled(): boolean { return this.on; }
  set enabled(value: boolean) {
    this.on = !!value;
    this.actions.animEnabled(this.gameObject.key, this.on);
  }
  SetBool(name: string, value: boolean): void { this.actions.animBool(this.gameObject.key, name, value); }
  SetFloat(name: string, value: number): void { this.actions.animFloat(this.gameObject.key, name, value); }
  SetInteger(name: string, value: number): void { this.actions.animInt(this.gameObject.key, name, value); }
  SetTrigger(name: string): void { this.actions.animTrigger(this.gameObject.key, name); }
  ResetTrigger(name: string): void { this.actions.animResetTrigger(this.gameObject.key, name); }
  Play(state: string): void { this.actions.animPlay(this.gameObject.key, state, 0); }
  CrossFade(state: string, seconds: number): void { this.actions.animPlay(this.gameObject.key, state, seconds); }
}

export class ParticleSystemRef extends ComponentRef {
  Play(): void { this.actions.particles(this.gameObject.key, true); }
  Stop(): void { this.actions.particles(this.gameObject.key, false); }
}

export class RendererRef extends ComponentRef {
  /** Sets a colour property of one of the renderer's materials, "_BaseColor" of slot 0 by default (URP). */
  SetColor(color: Color, property = "_BaseColor", slot = 0): void {
    this.actions.setColor(this.gameObject.key, property, color, slot);
  }
  /** Sets a float property of one of the renderer's materials. */
  SetFloat(property: string, value: number, slot = 0): void {
    this.actions.matFloat(this.gameObject.key, property, value, slot);
  }
}

export class AudioSourceRef extends ComponentRef {
  private pitchValue = 1;
  private volumeValue = 1;
  /** The clip `Play()` plays (UnityEngine.AudioSource.clip). */
  clip: AudioClipRef | null = null;

  /** Plays a clip (a `$clip` field value, or an index into this object's own clip list) through this audio source. */
  PlayOneShot(clip: AudioClipRef | number, volumeScale?: number): void {
    if (typeof clip === "number") this.actions.playClip(this.gameObject.key, clip, undefined, volumeScale);
    else this.actions.playClip(this.gameObject.key, clip.index, clip.on ?? undefined, volumeScale);
  }
  /** Plays `clip` as a one-shot (it overlaps a sound still playing instead of cutting it off). */
  Play(): void {
    if (this.clip) this.PlayOneShot(this.clip);
  }
  /** AudioSource.pitch (relay op `audioPitch`). Reading gives what the script last set. */
  get pitch(): number { return this.pitchValue; }
  set pitch(value: number) {
    this.pitchValue = value;
    this.actions.audioPitch(this.gameObject.key, value);
  }
  /** AudioSource.volume (relay op `audioVolume`). */
  get volume(): number { return this.volumeValue; }
  set volume(value: number) {
    this.volumeValue = value;
    this.actions.audioVolume(this.gameObject.key, value);
  }
}

/**
 * `{"$clip": n}`: clip n of the clip list on the object that plays it. `{"$clip": n, "on": "<objKey>"}`: clip n
 * of the list kept on another object (upstream often keeps every clip on one manager).
 */
export class AudioClipRef {
  readonly index: number;
  readonly on: string | null;
  constructor(index: number, on: string | null = null) {
    this.index = index;
    this.on = on;
  }
}

export function makeComponent(kind: ComponentKind, gameObject: GameObject, actions: HostActions): ComponentRef | Transform {
  switch (kind) {
    case "Text":
    case "TMP":
      return new TextRef(kind, gameObject, actions);
    case "Animator":
      return new AnimatorRef(kind, gameObject, actions);
    case "ParticleSystem":
      return new ParticleSystemRef(kind, gameObject, actions);
    case "Renderer":
      return new RendererRef(kind, gameObject, actions);
    case "AudioSource":
      return new AudioSourceRef(kind, gameObject, actions);
    case "Transform":
      return gameObject.transform;
    default:
      return new ComponentRef(kind, gameObject, actions);
  }
}
