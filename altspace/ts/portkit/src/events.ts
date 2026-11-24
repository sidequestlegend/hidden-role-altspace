// Network events: one-shots in the README's envelope.
//
//   {"pk":1,"g":"<slug>","i":"<inst>","t":"ev","b":"<behaviour id>","e":"<method>","a":[...],
//    "o":"<session id>"   only for an owner-targeted event: the session that should run it
//    "ps":"<session id>"  only for a per-player behaviour: whose copy it is
//    "s":[g,n]            the sender's last state write for that behaviour, when it is the owner}
//
// A one-shot never comes back to its sender and is not stored, so `All` runs the method here first and then
// sends it, and a player who arrives later never sees it. One-shots overtake state writes (which the app sends
// in batches every 0.2 s), so an event from the owner carries the mark of the owner's latest write and each
// receiver holds the event until it has that write.
//
// The room stamps every one-shot with its sender's session, and the method can read who that was
// (Networking.CallingPlayer): upstream code checks no sender, and a port must before it honours a request that
// not everybody may make.
//
// A remote client chooses the method name, so a method runs from the network only when its class lists it in
// `static networkCallable` (inherited lists add up). Nothing is callable by default, and a name starting with `_`
// never is (Udon's rule). The same list governs commands (SendCommand), which the referee runs for a sender.

import type { Behaviour, NetworkEventTargetName } from "./behaviour.ts";
import { Behaviour as BehaviourBase } from "./behaviour.ts";
import type { Core } from "./core.ts";
import { makeEnvelope, type Envelope } from "./names.ts";
import type { Slot, Sync } from "./sync.ts";
import { asciiJson, utf8Length } from "./util.ts";
import { decodeValue, encodeValue } from "./values.ts";

export interface EventRoutes {
  /** The ordinary behaviour with this id. */
  behaviour(id: string): Behaviour | null;
  /** The copy of per-player behaviour `id` that belongs to session `sid`. */
  playerBehaviour(sid: string, id: string): Behaviour | null;
  /** For a behaviour instance: its id and, for a per-player one, its owner's session id. */
  address(behaviour: Behaviour): { id: string; playerSid: string | null } | null;
  refused(behaviour: Behaviour, code: string, name: string): void;
}

interface Held {
  g: number;
  n: number;
  run: () => void;
  timer: number;
}

export class NetEvents {
  private readonly core: Core;
  private readonly sync: Sync;
  private readonly routes: EventRoutes;
  private readonly held = new Map<string, Held[]>();
  /** The session whose event or command is being run right now, for Networking.CallingPlayer. */
  callingSid: string | null = null;
  sent = 0;
  received = 0;
  /** Requests naming a method that may not be called from the network, for tests and diagnostics. */
  refusedCount = 0;
  private readonly refusedNames = new Set<string>();

  constructor(core: Core, sync: Sync, routes: EventRoutes) {
    this.core = core;
    this.sync = sync;
    this.routes = routes;
  }

  listen(): void {
    this.core.own(this.core.platform.onOneShot((fromSid, data) => this.receive(fromSid, data)));
  }

  send(behaviour: Behaviour, target: NetworkEventTargetName, name: string, args: unknown[]): void {
    if (this.core.disposed) return;
    const address = this.routes.address(behaviour);
    if (!address) return;
    if (!callable(behaviour, name)) {
      this.core.log("warn", `SendCustomNetworkEvent: ${address.id} has no network-callable method '${name}' (list it in its class's static networkCallable; names starting with '_' can never be sent)`);
      return;
    }
    const fields: Record<string, unknown> = { b: address.id, e: name };
    if (args.length) fields.a = args.map(encodeValue);
    const me = this.core.me.sid;
    let ownerSid: string | null;
    if (address.playerSid !== null) {
      fields.ps = address.playerSid;
      ownerSid = address.playerSid;
    } else {
      const slot = this.sync.slotOf(behaviour);
      ownerSid = slot ? this.sync.ownerSid(slot) : null;
      if (slot && ownerSid === me) {
        // Whoever receives this must first have the state it was sent after.
        const mark = this.sync.flushOne(slot);
        if (mark && mark.w === me) fields.s = [mark.g, mark.n];
      }
    }
    if (target === "Owner") {
      if (ownerSid === me) {
        this.invoke(behaviour, name, args, me);
        return;
      }
      if (ownerSid === null) {
        this.core.log("warn", `${address.id}.${name}: no owner to send to`);
        return;
      }
      fields.o = ownerSid;
    } else this.invoke(behaviour, name, args, me);
    this.post(behaviour, name, fields);
  }

  private post(behaviour: Behaviour, name: string, fields: Record<string, unknown>): void {
    const text = asciiJson(makeEnvelope(this.core.slug, this.core.inst, "ev", fields));
    if (utf8Length(text) > this.core.platform.limits.oneShotMaxBytes || !this.core.platform.oneShot(text)) {
      this.core.log("error", `network event '${name}' is too large to send (${utf8Length(text)} bytes)`);
      this.routes.refused(behaviour, "oneshot_too_large", name);
      return;
    }
    this.sent++;
  }

  private receive(fromSid: string, data: string): void {
    if (this.core.disposed || !this.sync.started) return;
    const env = parseOurs(data, this.core.slug, this.core.inst);
    if (!env || env.t !== "ev" || typeof env.b !== "string" || typeof env.e !== "string") return;
    const me = this.core.me.sid;
    const name = env.e;
    const args = Array.isArray(env.a) ? env.a.map(decodeValue) : [];
    this.received++;

    if (typeof env.ps === "string") {
      if (typeof env.o === "string" && env.o !== me) return;
      const behaviour = this.routes.playerBehaviour(env.ps, env.b);
      if (behaviour) this.invoke(behaviour, name, args, fromSid);
      return;
    }
    const behaviour = this.routes.behaviour(env.b);
    const slot = behaviour ? this.sync.slotOf(behaviour) : null;
    if (!behaviour || !slot) return;
    if (typeof env.o === "string") {
      if (env.o !== me) return;
      if (!this.sync.isOwner(slot)) {
        // Ownership moved while the event was on its way: pass it on once.
        const owner = this.sync.ownerSid(slot);
        const hops = typeof env.h === "number" ? env.h : 0;
        if (owner !== null && owner !== fromSid && hops < 2) {
          const fields: Record<string, unknown> = { b: env.b, e: name, o: owner, h: hops + 1 };
          if (args.length) fields.a = env.a;
          this.post(behaviour, name, fields);
        }
        return;
      }
    }
    const run = () => this.invoke(behaviour, name, args, fromSid);
    const mark = Array.isArray(env.s) && typeof env.s[0] === "number" && typeof env.s[1] === "number" ? { g: env.s[0], n: env.s[1] } : null;
    if (mark && !this.has(slot, mark.g, mark.n)) this.hold(slot, mark.g, mark.n, run);
    else run();
  }

  /** Has the write the event was sent after reached this client's mirror? (Sequence numbers only rise.) */
  private has(slot: Slot, _g: number, n: number): boolean {
    return slot.seenN >= n;
  }

  private hold(slot: Slot, g: number, n: number, run: () => void): void {
    let list = this.held.get(slot.id);
    if (!list) this.held.set(slot.id, (list = []));
    const entry: Held = { g, n, run, timer: 0 };
    entry.timer = this.core.scheduler.after(this.core.options.eventHoldMs, () => {
      const current = this.held.get(slot.id) ?? [];
      const at = current.indexOf(entry);
      if (at < 0) return;
      current.splice(at, 1);
      run(); // the write never arrived; the event is still better late than lost
    });
    list.push(entry);
    slot.onApplied = () => this.release(slot);
  }

  private release(slot: Slot): void {
    const list = this.held.get(slot.id);
    if (!list || !list.length) return;
    const ready = list.filter((h) => this.has(slot, h.g, h.n));
    if (!ready.length) return;
    this.held.set(
      slot.id,
      list.filter((h) => !ready.includes(h)),
    );
    for (const h of ready) {
      this.core.scheduler.cancel(h.timer);
      h.run();
    }
  }

  /** Runs a method of game code on behalf of `fromSid` (a network event or a command). */
  invoke(behaviour: Behaviour, name: string, args: unknown[], fromSid: string): void {
    if (!callable(behaviour, name)) {
      const key = `${behaviour.constructor.name}.${name}`;
      if (!this.refusedNames.has(key) && this.refusedNames.size < 64) {
        this.refusedNames.add(key);
        this.core.log("warn", `refused a request from session ${fromSid} to run '${String(name).slice(0, 64)}' on ${behaviour.constructor.name}: not in its networkCallable list`);
      }
      this.refusedCount++;
      return;
    }
    const before = this.callingSid;
    this.callingSid = fromSid;
    try {
      this.core.guard(name, () => (behaviour as unknown as Record<string, (...a: unknown[]) => void>)[name]!(...args));
    } finally {
      this.callingSid = before;
    }
  }
}

const LISTS = new WeakMap<object, ReadonlySet<string>>();

/** The names a class lets the network call: its own `static networkCallable` and its ancestors'. */
export function networkCallableOf(cls: Function): ReadonlySet<string> {
  let set = LISTS.get(cls);
  if (set) return set;
  const names = new Set<string>();
  for (let c: unknown = cls; typeof c === "function" && c !== BehaviourBase && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    if (Object.prototype.hasOwnProperty.call(c, "networkCallable")) {
      const list = (c as { networkCallable?: unknown }).networkCallable;
      if (Array.isArray(list)) for (const name of list) if (typeof name === "string") names.add(name);
    }
  }
  set = names;
  LISTS.set(cls, set);
  return set;
}

/**
 * A method a network event or a command may call: listed in its class's `networkCallable`, not marked private by
 * a leading `_`, and a method of the game's own classes (never one of the runtime's).
 */
export function callable(behaviour: Behaviour, name: string): boolean {
  if (typeof name !== "string" || name.length === 0 || name.charCodeAt(0) === 0x5f || name === "constructor") return false;
  if (!networkCallableOf(behaviour.constructor).has(name)) return false;
  for (let proto = Object.getPrototypeOf(behaviour); proto && proto !== BehaviourBase.prototype && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    if (Object.prototype.hasOwnProperty.call(proto, name)) return typeof (behaviour as unknown as Record<string, unknown>)[name] === "function";
  }
  return false;
}

function parseOurs(data: string, slug: string, inst: string): Envelope | null {
  // A cheap test first: most one-shots in a room belong to something else.
  if (typeof data !== "string" || data.indexOf('"pk":1') < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const e = parsed as Envelope;
  if (e.pk !== 1 || e.g !== slug || e.i !== inst || typeof e.t !== "string") return null;
  return e;
}
