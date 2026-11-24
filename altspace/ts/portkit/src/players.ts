// Players as translated code sees them (the shape of VRCPlayerApi), with small integer ids.
//
// Each participant claims its own id in its announcement leaf (user state, which only that player can write):
//   id   the claimed id: one above the highest id any participant has ever seen
//   hw   the highest id this participant has ever seen, so the id of someone who left is not handed out again
// Two arrivals can pick the same number. The one that ranks lower (user id, then session id) keeps it and the
// other picks again; a player counts as joined only once their id has stood unchallenged for a moment.
//
// Ids are claimed rather than handed out by the referee because a game may have no referee for a while (see
// referee.ts, "declared" candidates) and players still need ids then.

import type { Core } from "./core.ts";
import type { Participant, Presence } from "./presence.ts";
import type { Referee } from "./referee.ts";
import { deferred, isRecord, safeParse } from "./util.ts";

/** How long a claimed id must stand before its player counts as joined. */
export const ID_SETTLE_MS = 600;

export class Player {
  readonly sid: string;
  readonly uid: string;
  readonly isLocal: boolean;
  displayName: string;
  playerId: number;
  /** The space's owner or a moderator, as the platform reports it. Not proof: check what the room accepted. */
  isSpaceAdmin = false;
  /** @internal */
  _valid = true;
  /** @internal */
  _isMaster: () => boolean = () => false;

  constructor(sid: string, uid: string, name: string, isLocal: boolean, playerId: number) {
    this.sid = sid;
    this.uid = uid;
    this.displayName = name;
    this.isLocal = isLocal;
    this.playerId = playerId;
  }

  /** False once the player has left: keep no references across OnPlayerLeft. */
  IsValid(): boolean {
    return this._valid;
  }

  get isMaster(): boolean {
    return this._valid && this._isMaster();
  }

  toString(): string {
    return `${this.displayName}#${this.playerId}`;
  }
}

interface Claim {
  id: number;
  /** When this client first saw that id for that session. */
  since: number;
}

type Handler = (kind: "join" | "leave", player: Player) => void;

export class Players {
  private readonly core: Core;
  private readonly presence: Presence;
  private readonly referee: Referee;
  private readonly bySidMap = new Map<string, Player>();
  private readonly claims = new Map<string, Claim>();
  private readonly handlers: Handler[] = [];
  private readonly localAssigned = deferred<void>();
  private highWater = 0;
  private myId = 0;
  private recheck = 0;

  constructor(core: Core, presence: Presence, referee: Referee) {
    this.core = core;
    this.presence = presence;
    this.referee = referee;
  }

  /** Starts following ids and claims one for the local player (who must have announced already). */
  start(): void {
    this.presence.on(() => this.refresh());
    this.presence.onExtra(() => this.refresh());
    this.refresh();
    this.claim();
  }

  /** Resolves once the local player's id has stood for the settle time. */
  whenLocalAssigned(): Promise<void> {
    return this.localAssigned.promise;
  }

  get local(): Player | null {
    return this.bySidMap.get(this.core.me.sid) ?? null;
  }

  bySid(sid: string): Player | null {
    return this.bySidMap.get(sid) ?? null;
  }

  byId(id: number): Player | null {
    for (const player of this.bySidMap.values()) if (player.playerId === id) return player;
    return null;
  }

  /** Everyone taking part, in player-id order. */
  list(): Player[] {
    return [...this.bySidMap.values()].sort((a, b) => a.playerId - b.playerId);
  }

  on(handler: Handler): void {
    this.handlers.push(handler);
  }

  /** Upkeep no event triggers. Called about once a second. */
  tend(): void {
    this.refresh();
  }

  private idOf(sid: string): number | null {
    const id = this.presence.extra(sid, "id");
    return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
  }

  private claim(): void {
    let top = this.highWater;
    for (const who of this.presence.list()) {
      const id = this.idOf(who.sid);
      const hw = this.presence.extra(who.sid, "hw");
      if (id !== null && id > top) top = id;
      if (typeof hw === "number" && hw > top) top = hw;
    }
    this.myId = top + 1;
    this.highWater = this.myId;
    this.presence.setExtra("id", this.myId);
    this.presence.setExtra("hw", this.highWater);
    this.presence.flush();
  }

  private refresh(): void {
    if (this.core.disposed) return;
    const clock = this.core.platform.clock;
    const now = clock.now();
    const me = this.core.me.sid;
    const present = this.presence.list(); // in rank order

    // Who claims what, and since when.
    const holders = new Map<number, string>(); // id -> the lowest-ranked session claiming it
    let top = this.highWater;
    for (const who of present) {
      const id = this.idOf(who.sid);
      const hw = this.presence.extra(who.sid, "hw");
      if (typeof hw === "number" && hw > top) top = hw;
      if (id === null) {
        this.claims.delete(who.sid);
        continue;
      }
      if (id > top) top = id;
      const claim = this.claims.get(who.sid);
      if (!claim || claim.id !== id) this.claims.set(who.sid, { id, since: now });
      if (!holders.has(id)) holders.set(id, who.sid);
    }
    for (const sid of [...this.claims.keys()]) if (!this.presence.has(sid)) this.claims.delete(sid);

    // Someone who ranks lower holds our number: pick another.
    if (this.myId > 0 && holders.get(this.myId) !== undefined && holders.get(this.myId) !== me) {
      this.highWater = top;
      this.claim();
      return; // setExtra called back into refresh with the new claim
    }
    if (top > this.highWater) {
      this.highWater = top;
      if (this.myId > 0) this.presence.setExtra("hw", top);
    }

    const leaving: Player[] = [];
    const joining: Player[] = [];
    let nextCheck = Infinity;
    for (const player of this.bySidMap.values()) if (!this.presence.has(player.sid)) leaving.push(player);
    for (const who of present) {
      const claim = this.claims.get(who.sid);
      if (!claim || holders.get(claim.id) !== who.sid) continue;
      const existing = this.bySidMap.get(who.sid);
      if (existing) {
        existing.displayName = who.name;
        if (existing.playerId !== claim.id) {
          this.core.log("warn", `player ${existing.displayName} changed id ${existing.playerId} -> ${claim.id} after joining (two ids were claimed at once)`);
          existing.playerId = claim.id;
        }
        continue;
      }
      const ready = claim.since + ID_SETTLE_MS;
      // The local claim also has to have reached the room: until its echo is back nobody else can contest it.
      const echoed = who.sid !== me || this.localEchoed();
      if (now >= ready && echoed) joining.push(this.make(who, claim.id));
      else nextCheck = Math.min(nextCheck, Math.max(ready, now + 50));
    }

    for (const player of leaving) {
      this.bySidMap.delete(player.sid);
      player._valid = false;
    }
    for (const player of joining) this.bySidMap.set(player.sid, player);
    for (const player of leaving) this.emit("leave", player);
    for (const player of joining.sort((a, b) => a.playerId - b.playerId)) this.emit("join", player);
    if (this.bySidMap.has(me)) this.localAssigned.resolve();

    if (this.recheck) this.core.scheduler.cancel(this.recheck);
    this.recheck = 0;
    if (nextCheck !== Infinity) {
      this.recheck = this.core.scheduler.after(nextCheck - now, () => {
        this.recheck = 0;
        this.refresh();
      });
    }
  }

  private localEchoed(): boolean {
    const marker = safeParse(this.core.platform.userGet(this.core.me.sid, this.core.prefix + ".k"));
    return isRecord(marker) && isRecord(marker.x) && marker.x.id === this.myId;
  }

  private make(who: Participant, id: number): Player {
    const player = new Player(who.sid, who.uid, who.name, who.isLocal, id);
    player._isMaster = () => this.referee.current()?.sid === player.sid;
    player.isSpaceAdmin = this.core.platform.players().find((p) => p.sid === who.sid)?.isAdmin === true;
    return player;
  }

  private emit(kind: "join" | "leave", player: Player): void {
    for (const handler of this.handlers.slice()) this.core.guard("player handler", () => handler(kind, player));
  }
}
