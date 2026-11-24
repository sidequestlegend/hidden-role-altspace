// Synced variables and ownership.
//
// Per slot there are two string leaves under the instance prefix:
//   o.<slot> = {e, g, s, u}       who owns it: epoch, ownership generation, owner's session id and user id
//   v.<slot> = {e, g, n, w, d}    its synced fields: epoch, the generation the writer held, sequence number,
//                                 writer's session id, data (see leaf.ts for values too large for one leaf)
//
// A slot is one behaviour (slot id = behaviour id, d = {field: value}) or a sync group: several behaviours that
// share one leaf and one owner (slot id = "@<group>", d = {<behaviour id>: [values in field order]}). A group is
// written as a whole, and each member is told only when its own part changed. Games with dozens of small
// identical behaviours (chess pieces) use groups so that they cost two leaves, not two per behaviour.
//
// The room keeps the last value written to a leaf and tells every client of each change in the same order, the
// writer included. The rules are built on that and on nothing else:
//   - The owner is the session the mirrored `o` names while it is a participant, otherwise the referee.
//   - SetOwner writes `o` and takes effect locally at once. When two players claim in the same moment, both
//     claims reach the room and the later one stands; the other player sees it arrive after its own, and
//     OnOwnershipTransferred tells it who the owner is.
//   - A value counts when it arrives while its writer is the mirrored owner. Every client sees the same order,
//     so every client makes the same call. The owner applies its own writes at once and skips their echo.
//   - A value from anyone else (a previous owner's write landing late) is ignored by all, and the owner then
//     writes its own fields again so that the leaf holds what everyone has.
//   - A client that arrives later takes the stored value as it is.

import type { Behaviour } from "./behaviour.ts";
import type { Core } from "./core.ts";
import { assignFields, readFields } from "./fields.ts";
import { decodeLeaf, encodeLeaf, leafOwnerOf } from "./leaf.ts";
import type { Player, Players } from "./players.ts";
import type { Presence } from "./presence.ts";
import type { Referee } from "./referee.ts";
import type { Handle } from "./scheduler.ts";
import { asciiJson, canonicalJson, isRecord, safeParse } from "./util.ts";
import { encodeValue } from "./values.ts";

export type SyncMode = "manual" | "continuous" | "none";

interface OwnerRecord {
  e: number;
  g: number;
  s: string;
  u: string;
}

export interface Marker {
  g: number;
  n: number;
  w: string;
}

interface PendingClaim {
  g: number;
  sid: string;
  timer: Handle;
}

export interface Member {
  readonly id: string;
  readonly behaviour: Behaviour;
  readonly fields: readonly string[];
  /** Synced field -> property whose setter takes received values ([FieldChangeCallback]). */
  readonly callbacks: Readonly<Record<string, string>> | undefined;
  /** Canonical text of the member's part as last written or applied, to tell which members a group write changed. */
  lastPart: string | null;
  /** Data was applied before the behaviour started: OnDeserialization is still owed. */
  owed: boolean;
}

export interface Slot {
  /** The behaviour's id, or "@<group>". */
  readonly id: string;
  readonly grouped: boolean;
  readonly members: Member[];
  mode: SyncMode;
  /** The value in the mirror at start was still missing chunks: when it completes it is still the join snapshot. */
  snapshotOwed: boolean;
  /** Mirrored owner record of the current epoch. */
  mo: OwnerRecord | null;
  /** Highest generation ever seen in `o`, in any epoch, so a new claim is always above it. */
  topG: number;
  pending: PendingClaim | null;
  applied: Marker | null;
  seenN: number;
  /** The last data that counted, to go back to after losing a race. */
  lastValid: { d: unknown; marker: Marker } | null;
  /** A write made while a claim was still pending; it becomes `lastValid` if the claim wins. */
  unconfirmed: { d: unknown; marker: Marker } | null;
  dirty: boolean;
  chunks: number;
  lastSent: string | null;
  lastContinuousAt: number;
  ownerView: string | null;
  warnedNotOwner: boolean;
  /** Called whenever newer data has been applied, so held network events can run. */
  onApplied: (() => void) | null;
}

export interface SyncStats {
  writes: number;
  applied: number;
  repairs: number;
  claims: number;
  lostRaces: number;
  rejected: number;
  reverted: number;
}

export class Sync {
  private readonly core: Core;
  private readonly presence: Presence;
  private readonly referee: Referee;
  private readonly players: Players;
  readonly slots = new Map<string, Slot>();
  private readonly byBehaviour = new Map<Behaviour, Slot>();
  readonly stats: SyncStats = { writes: 0, applied: 0, repairs: 0, claims: 0, lostRaces: 0, rejected: 0, reverted: 0 };
  /** False until behaviours have started: data applied before then is reported once, afterwards. */
  started = false;
  private epochSeen = 0;
  private warnedIdle = false;
  /** Told when the local player becomes or stops being the owner of a slot (to move its synced objects). */
  onLocalOwnership: (slot: Slot, mine: boolean) => void = () => {};

  constructor(core: Core, presence: Presence, referee: Referee, players: Players) {
    this.core = core;
    this.presence = presence;
    this.referee = referee;
    this.players = players;
  }

  private get me(): string {
    return this.core.me.sid;
  }

  /** Registers a behaviour. With `group`, it shares the leaf and the owner of every other behaviour of that group. */
  add(behaviour: Behaviour, id: string, fields: readonly string[], mode: SyncMode, callbacks?: Readonly<Record<string, string>>, group?: string): Slot {
    const slotId = group ? `@${group}` : id;
    let slot = this.slots.get(slotId);
    if (!slot) {
      slot = {
        id: slotId,
        grouped: !!group,
        members: [],
        mode,
        snapshotOwed: false,
        mo: null,
        topG: 0,
        pending: null,
        applied: null,
        seenN: 0,
        lastValid: null,
        unconfirmed: null,
        dirty: false,
        chunks: 0,
        lastSent: null,
        lastContinuousAt: -Infinity,
        ownerView: null,
        warnedNotOwner: false,
        onApplied: null,
      };
      this.slots.set(slotId, slot);
    } else if (mode === "continuous" || (slot.mode === "none" && mode !== "none")) slot.mode = mode;
    slot.members.push({ id, behaviour, fields, callbacks: callbacks && Object.keys(callbacks).length ? callbacks : undefined, lastPart: null, owed: false });
    this.byBehaviour.set(behaviour, slot);
    return slot;
  }

  slotOf(behaviour: Behaviour): Slot | null {
    return this.byBehaviour.get(behaviour) ?? null;
  }

  /** Subscribes to the mirror and reads the owner records. Data is applied by `applySnapshot`, after Start. */
  attach(): void {
    this.core.onState((key) => this.onLeaf(key));
    this.presence.on(() => this.onPeopleChanged());
    this.presence.onExtra(() => this.onPeopleChanged());
    this.referee.on(() => this.onPeopleChanged());
    this.epochSeen = this.referee.epoch;
    for (const slot of this.slots.values()) {
      this.readOwner(slot);
      slot.ownerView = this.ownerSid(slot);
    }
  }

  /** Applies whatever counts in the mirror to every behaviour. Runs after Start, so stored data wins over it. */
  applySnapshot(): void {
    for (const slot of this.slots.values()) {
      this.markParts(slot);
      slot.snapshotOwed = decodeLeaf(slot.id, (key) => this.core.get(key)).kind === "pending";
      this.evaluate(slot, true);
    }
  }

  /** True when the mirror held a value for any behaviour when this client started. */
  hasData(): boolean {
    for (const slot of this.slots.values()) if (slot.applied !== null) return true;
    return false;
  }

  /** Marks the behaviours as started and calls OnDeserialization once on each that already has data. */
  begin(): void {
    this.started = true;
    for (const slot of this.slots.values()) {
      for (const member of slot.members) {
        if (!member.owed) continue;
        member.owed = false;
        this.core.guard(`${member.id}.OnDeserialization`, () => member.behaviour.OnDeserialization({ isSnapshot: true, isRollback: false }));
      }
    }
  }

  /** The slot a leaf key belongs to (`o.<slot>`, `v.<slot>`, `c.<slot>.<i>`), for reporting a refused write. */
  slotForKey(key: string): Slot | null {
    const id = key.startsWith("o.") ? key.slice(2) : leafOwnerOf(key);
    return id === null ? null : (this.slots.get(id) ?? null);
  }

  // ---- ownership ----------------------------------------------------------------------------------------------

  ownerSid(slot: Slot): string | null {
    if (slot.pending) return slot.pending.sid;
    if (slot.mo && this.presence.has(slot.mo.s)) return slot.mo.s;
    return this.referee.current()?.sid ?? null;
  }

  owner(slot: Slot): Player | null {
    const sid = this.ownerSid(slot);
    return sid === null ? null : this.players.bySid(sid);
  }

  isOwner(slot: Slot, sid: string = this.me): boolean {
    return this.ownerSid(slot) === sid;
  }

  setOwner(slot: Slot, sid: string, uid: string): void {
    if (this.core.disposed) return;
    if (this.referee.epoch === 0) {
      // No referee has ever been seen: there is no game to own anything in yet.
      if (!this.warnedIdle) {
        this.warnedIdle = true;
        this.core.log("warn", `${slot.id}: SetOwner ignored, the instance has no referee yet`);
      }
      return;
    }
    const recorded = slot.pending ? slot.pending.sid : slot.mo ? slot.mo.s : null;
    if (recorded === sid) return;
    const g = Math.max(slot.topG, slot.pending ? slot.pending.g : 0) + 1;
    const record: OwnerRecord = { e: this.referee.epoch, g, s: sid, u: uid };
    if (slot.pending) this.core.scheduler.cancel(slot.pending.timer);
    const timer = this.core.scheduler.after(this.core.options.ownerClaimTimeoutMs, () => {
      if (slot.pending && slot.pending.g === g) {
        this.core.log("warn", `ownership claim for ${slot.id} never came back; giving it up`);
        slot.pending = null;
        this.settleLostClaim(slot);
      }
    });
    slot.pending = { g, sid, timer };
    this.stats.claims++;
    this.core.set(`o.${slot.id}`, asciiJson(record));
    this.noteOwner(slot);
  }

  private readOwner(slot: Slot): void {
    const raw = safeParse(this.core.get(`o.${slot.id}`));
    let record: OwnerRecord | null = null;
    if (isRecord(raw) && typeof raw.e === "number" && typeof raw.g === "number" && typeof raw.s === "string") {
      record = { e: raw.e, g: raw.g, s: raw.s, u: typeof raw.u === "string" ? raw.u : "" };
      if (record.g > slot.topG) slot.topG = record.g;
    }
    slot.mo = record && record.e === this.referee.epoch ? record : null;
  }

  private onOwnerLeaf(slot: Slot): void {
    this.readOwner(slot);
    const mo = slot.mo;
    // Our own claim has come back. (Someone else's claim seen before that does not mean ours lost: ours was
    // written later and replaces it. If theirs is the later one, it simply arrives after this.)
    if (slot.pending && mo && mo.s === slot.pending.sid && mo.g === slot.pending.g) {
      this.core.scheduler.cancel(slot.pending.timer);
      slot.pending = null;
      if (slot.unconfirmed) slot.lastValid = slot.unconfirmed;
      slot.unconfirmed = null;
    }
    this.noteOwner(slot);
    this.evaluate(slot, false);
  }

  /** The claim never reached the room: whatever was changed for it is put back. */
  private settleLostClaim(slot: Slot): void {
    this.stats.lostRaces++;
    const touched = slot.unconfirmed !== null || slot.dirty;
    slot.unconfirmed = null;
    slot.dirty = false;
    if (touched) {
      if (slot.lastValid) {
        slot.applied = slot.lastValid.marker;
        this.markParts(slot);
        this.deserialized(slot, this.assign(slot, slot.lastValid.d), true);
      } else slot.applied = null;
    }
    this.noteOwner(slot);
    this.evaluate(slot, false);
  }

  /** Records what each member of a group holds now, so that the next value only reports real changes. */
  private markParts(slot: Slot): void {
    if (!slot.grouped) return;
    for (const member of slot.members) {
      const bag = member.behaviour as unknown as Record<string, unknown>;
      member.lastPart = canonicalJson(member.fields.map((field) => encodeValue(bag[field])));
    }
  }

  private noteOwner(slot: Slot): void {
    const now = this.ownerSid(slot);
    if (now === slot.ownerView) return;
    const before = slot.ownerView;
    slot.ownerView = now;
    if (now === this.me || before === this.me) this.core.guard("ownership hook", () => this.onLocalOwnership(slot, now === this.me));
    if (!this.started || now === null) return;
    const player = this.players.bySid(now);
    if (!player) return;
    for (const member of slot.members) this.core.guard(`${member.id}.OnOwnershipTransferred`, () => member.behaviour.OnOwnershipTransferred(player));
  }

  private onPeopleChanged(): void {
    if (this.core.disposed) return;
    if (this.referee.epoch !== this.epochSeen) this.adoptEpoch();
    for (const slot of this.slots.values()) this.noteOwner(slot);
    this.takeOver();
  }

  /**
   * A referee of another epoch appeared: a client that started while there was none joins the game in progress,
   * or the game was started afresh. Everything known about owners and values is read again from the mirror, and
   * values found there are reported as a snapshot.
   */
  private adoptEpoch(): void {
    this.epochSeen = this.referee.epoch;
    for (const slot of this.slots.values()) {
      if (slot.pending) this.core.scheduler.cancel(slot.pending.timer);
      slot.pending = null;
      slot.unconfirmed = null;
      slot.lastValid = null;
      slot.applied = null;
      slot.dirty = false;
      this.readOwner(slot);
      slot.snapshotOwed = true;
      this.evaluate(slot, true);
      slot.snapshotOwed = decodeLeaf(slot.id, (key) => this.core.get(key)).kind === "pending";
    }
  }

  /** The referee records itself as owner of whatever an absent player owned. */
  takeOver(): void {
    if (!this.started || !this.referee.isMe()) return;
    for (const slot of this.slots.values()) {
      if (slot.pending || !slot.mo || this.presence.has(slot.mo.s)) continue;
      this.setOwner(slot, this.me, this.core.me.uid);
    }
  }

  // ---- data ---------------------------------------------------------------------------------------------------

  requestSerialization(slot: Slot): void {
    if (slot.mode === "none") return;
    if (!this.isOwner(slot)) {
      if (!slot.warnedNotOwner) {
        slot.warnedNotOwner = true;
        this.core.log("warn", `${slot.id}: RequestSerialization by a player who is not the owner is ignored`);
      }
      return;
    }
    slot.dirty = true;
  }

  /** Writes every dirty slot the local player owns. Called once per tick. */
  flush(): void {
    if (this.core.disposed || !this.started) return;
    const now = this.core.platform.clock.now();
    for (const slot of this.slots.values()) {
      if (slot.mode === "none") continue;
      if (slot.mode === "continuous" && now - slot.lastContinuousAt >= this.core.options.continuousIntervalMs && this.isOwner(slot)) {
        slot.lastContinuousAt = now;
        if (canonicalJson(this.read(slot)) !== slot.lastSent) slot.dirty = true;
      }
      if (!slot.dirty) continue;
      slot.dirty = false;
      if (this.isOwner(slot)) this.write(slot);
      else this.revert(slot);
    }
  }

  /**
   * The fields were changed by the owner, and ownership went to someone else before the change could be sent.
   * Nobody else will ever see it, so it is taken back.
   */
  private revert(slot: Slot): void {
    if (!slot.lastValid) return;
    slot.applied = slot.lastValid.marker;
    this.markParts(slot);
    const changed = this.assign(slot, slot.lastValid.d);
    this.stats.reverted++;
    this.deserialized(slot, changed, true);
  }

  /** Writes every slot the local player owns and has changed (RequestSerialization), now: the end of one action. */
  flushDirty(): void {
    if (this.core.disposed || !this.started) return;
    for (const slot of this.slots.values()) {
      if (slot.mode === "none" || !slot.dirty) continue;
      slot.dirty = false;
      if (this.isOwner(slot)) this.write(slot);
      else this.revert(slot);
    }
  }

  /** Serialises one slot now (used when an event must follow its state). Returns the marker of what it holds. */
  flushOne(slot: Slot): Marker | null {
    if (slot.dirty && this.started && this.isOwner(slot)) {
      slot.dirty = false;
      this.write(slot);
    }
    return slot.applied;
  }

  private write(slot: Slot): void {
    // A record must name the writer, or nobody would accept the value.
    const named = slot.pending ? slot.pending.sid === this.me : slot.mo !== null && slot.mo.s === this.me;
    if (!named) this.setOwner(slot, this.me, this.core.me.uid);
    if (!slot.pending && !slot.mo) return;
    const g = slot.pending ? slot.pending.g : slot.mo!.g;
    for (const member of slot.members) this.core.guard(`${member.id}.OnPreSerialization`, () => member.behaviour.OnPreSerialization());
    const d = this.read(slot);
    const n = ++slot.seenN;
    const encoded = encodeLeaf(slot.id, { e: this.referee.epoch, g, n, w: this.me, d }, this.core.platform.limits.maxLeafBytes, slot.chunks);
    for (const [key, value] of encoded.writes) this.core.set(key, value);
    slot.chunks = encoded.chunks;
    slot.applied = { g, n, w: this.me };
    slot.lastSent = canonicalJson(d);
    if (slot.grouped) for (const member of slot.members) member.lastPart = canonicalJson(d[member.id] ?? null);
    const kept = { d, marker: slot.applied };
    if (slot.pending) slot.unconfirmed = kept;
    else slot.lastValid = kept;
    this.stats.writes++;
    const result = { success: true, byteCount: encoded.bytes };
    for (const member of slot.members) this.core.guard(`${member.id}.OnPostSerialization`, () => member.behaviour.OnPostSerialization(result));
  }

  private read(slot: Slot): Record<string, unknown> {
    if (!slot.grouped) return readFields(slot.members[0]!.behaviour, slot.members[0]!.fields);
    const out: Record<string, unknown> = {};
    for (const member of slot.members) {
      const bag = member.behaviour as unknown as Record<string, unknown>;
      out[member.id] = member.fields.map((field) => encodeValue(bag[field]));
    }
    return out;
  }

  /** Puts data into the behaviours. Returns the members whose part was new to them. */
  private assign(slot: Slot, d: unknown): Member[] {
    if (!slot.grouped) {
      const member = slot.members[0]!;
      // A change callback is game code: it must not be able to stop the fields after it from arriving.
      this.core.guard(`${member.id} field change callback`, () => assignFields(member.behaviour, member.fields, d, member.callbacks));
      return [member];
    }
    const changed: Member[] = [];
    if (!isRecord(d)) return changed;
    for (const member of slot.members) {
      const part = d[member.id];
      if (!Array.isArray(part)) continue;
      const text = canonicalJson(part);
      if (text === member.lastPart) continue;
      member.lastPart = text;
      const asFields: Record<string, unknown> = {};
      member.fields.forEach((field, i) => {
        if (i < part.length) asFields[field] = part[i];
      });
      this.core.guard(`${member.id} field change callback`, () => assignFields(member.behaviour, member.fields, asFields, member.callbacks));
      changed.push(member);
    }
    return changed;
  }

  private onLeaf(key: string): void {
    if (this.core.disposed) return;
    if (key.startsWith("o.")) {
      const slot = this.slots.get(key.slice(2));
      if (slot) this.onOwnerLeaf(slot);
      return;
    }
    const id = leafOwnerOf(key);
    if (id === null) return;
    const slot = this.slots.get(id);
    if (slot) this.evaluate(slot, slot.snapshotOwed);
  }

  /**
   * Looks at the mirrored value of one slot and applies it, ignores it, or repairs it. `asSnapshot`: the value
   * was already stored when this client came to the game, so it is taken whoever wrote it.
   */
  private evaluate(slot: Slot, asSnapshot: boolean): void {
    this.consider(slot, asSnapshot);
    // Network events that were sent after a write wait for it: whatever was decided about it, it is here now.
    if (slot.onApplied && this.started) this.core.guard("held events", slot.onApplied);
  }

  private consider(slot: Slot, asSnapshot: boolean): void {
    const decoded = decodeLeaf(slot.id, (key) => this.core.get(key));
    if (decoded.kind === "pending") {
      if (decoded.n > slot.seenN) slot.seenN = decoded.n;
      return;
    }
    if (decoded.kind !== "value") return;
    const x = decoded.record;
    if (x.n > slot.seenN) slot.seenN = x.n;
    slot.chunks = decoded.chunks;
    if (x.e !== this.referee.epoch) return; // another epoch: as good as absent
    const a = slot.applied;
    if (a && x.n === a.n && x.w === a.w && x.g === a.g) return; // exactly what this client already has
    if (x.w === this.me && a && a.w === this.me && x.n <= a.n) return; // an older echo of ours
    const mo = slot.mo;
    if (asSnapshot || (mo !== null && x.w === mo.s)) {
      slot.applied = { g: x.g, n: x.n, w: x.w };
      slot.lastValid = { d: x.d, marker: slot.applied };
      slot.lastSent = null;
      this.stats.applied++;
      this.deserialized(slot, this.assign(slot, x.d), false);
      return;
    }
    this.stats.rejected++;
    // Written by someone who was not the owner when it arrived. If this client is the owner, the leaf is put
    // right again with what everyone holds.
    if (mo !== null && mo.s === this.me && !slot.pending) {
      this.stats.repairs++;
      slot.dirty = true;
    }
  }

  private deserialized(slot: Slot, changed: Member[], isRollback: boolean): void {
    if (!this.started) {
      for (const member of changed) member.owed = true;
      return;
    }
    const isSnapshot = slot.snapshotOwed && !isRollback;
    slot.snapshotOwed = false;
    for (const member of changed) {
      this.core.guard(`${member.id}.OnDeserialization`, () => member.behaviour.OnDeserialization({ isSnapshot, isRollback }));
    }
  }

  /** Canonical text of every synced field of every behaviour: equal on two clients that agree. */
  snapshotText(): string {
    const all: Record<string, unknown> = {};
    for (const slot of this.slots.values()) {
      if (slot.mode === "none") continue;
      for (const member of slot.members) if (member.fields.length) all[member.id] = readFields(member.behaviour, member.fields);
    }
    return canonicalJson(all);
  }
}
