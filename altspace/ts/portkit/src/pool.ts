// A pool of pre-placed objects, for the VRChat pattern of VRCObjectPool with VRCObjectSync.TeleportTo: the
// owner switches an object on and puts it somewhere, and everyone sees the same objects on, in the same places,
// including players who arrive later.
//
// In bindings.json:
//   { "id": "pool", "type": "ObjectPool", "fields": { "Pool": [{"$obj":"cup0"}, {"$obj":"cup1"}] } }
// and in the game definition: behaviours: { ObjectPool, ... }.
//
// Which objects are on and where each was last put are synced fields, so they are reliable and late-join safe.
// An object that also streams its transform (sync: "transform") is taken over by the owner when it is spawned;
// the teleport pose is applied once per teleport and the stream carries on from there.

import { Behaviour } from "./behaviour.ts";
import type { GameObject } from "./scene.ts";
import { Quaternion, Vector3 } from "./values.ts";

export class ObjectPool extends Behaviour {
  static override synced: readonly string[] = ["active", "poses"];

  /** The pooled objects, from bindings. */
  Pool: GameObject[] = [];
  /** 1 for an object that is on, per pool index. */
  active: number[] = [];
  /** Per pool index: [x, y, z, qx, qy, qz, qw, stamp] of the last teleport, or null. The stamp rises each time. */
  poses: Array<number[] | null> = [];

  private shown: number[] = [];
  private stamps: number[] = [];

  override Start(): void {
    const count = this.Pool.length;
    this.active = new Array<number>(count).fill(0);
    this.poses = new Array<number[] | null>(count).fill(null);
    this.shown = new Array<number>(count).fill(-1);
    this.stamps = new Array<number>(count).fill(0);
    this.apply();
  }

  override OnDeserialization(): void {
    this.apply();
  }

  /** Switches on the first object that is off and returns it; null when all are in use or the caller is not the owner. */
  TryToSpawn(): GameObject | null {
    if (!this.Networking.IsOwner(this)) return null;
    const index = this.active.indexOf(0);
    if (index < 0 || index >= this.Pool.length) return null;
    this.active[index] = 1;
    this.Pool[index]!.TakeOwnership();
    this.changed();
    return this.Pool[index]!;
  }

  /** Spawns an object and puts it at a pose in one step. */
  Spawn(position: Vector3, rotation: Quaternion = Quaternion.identity): GameObject | null {
    const obj = this.TryToSpawn();
    if (obj) this.TeleportTo(obj, position, rotation);
    return obj;
  }

  /** Switches an object off again. Owner only. */
  Return(obj: GameObject): void {
    const index = this.Pool.indexOf(obj);
    if (index < 0 || !this.Networking.IsOwner(this) || this.active[index] === 0) return;
    this.active[index] = 0;
    this.changed();
  }

  /** Puts a pooled object at a pose on every client, without it gliding there. Owner only. */
  TeleportTo(obj: GameObject, position: Vector3, rotation: Quaternion = Quaternion.identity): void {
    const index = this.Pool.indexOf(obj);
    if (index < 0 || !this.Networking.IsOwner(this)) return;
    const stamp = ((this.poses[index]?.[7] ?? 0) as number) + 1;
    this.poses[index] = [position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w, stamp];
    this.changed();
  }

  IsActive(obj: GameObject): boolean {
    const index = this.Pool.indexOf(obj);
    return index >= 0 && this.active[index] === 1;
  }

  get ActiveCount(): number {
    let n = 0;
    for (const a of this.active) if (a === 1) n++;
    return n;
  }

  private changed(): void {
    this.apply();
    this.RequestSerialization();
  }

  /** Makes the local objects match the synced fields. */
  private apply(): void {
    for (let i = 0; i < this.Pool.length; i++) {
      const obj = this.Pool[i]!;
      const pose = this.poses[i];
      if (pose && pose.length >= 8 && pose[7] !== this.stamps[i]) {
        this.stamps[i] = pose[7]!;
        obj.transform.SetPositionAndRotation(new Vector3(pose[0], pose[1], pose[2]), new Quaternion(pose[3], pose[4], pose[5], pose[6]));
      }
      const on = this.active[i] === 1 ? 1 : 0;
      if (this.shown[i] !== on) {
        this.shown[i] = on;
        obj.SetActive(on === 1);
      }
    }
  }
}
