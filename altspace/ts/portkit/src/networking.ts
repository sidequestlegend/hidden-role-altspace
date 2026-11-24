// `Networking` as translated code uses it. Upstream calls are static (`Networking.IsOwner(gameObject)`); here every
// instance has its own, reached as `this.Networking`, because several games and several copies of one game share
// a page.

import type { Behaviour } from "./behaviour.ts";
import type { Player } from "./players.ts";
import { GameObject } from "./scene.ts";

/** How this client came to the game it is in. */
export type StartKind =
  /** A new game: nothing was saved in the room, or what was saved belonged to players who have all gone. */
  | "fresh"
  /** Saved state was found with nobody playing it and kept (`whenEmpty: "keep"`): resume it or reset it. */
  | "resumed"
  /** Others are playing: this client joined their game. */
  | "joined"
  /** No referee yet (a game with declared candidates): there is no game to be in. */
  | "idle";

/** What the instance provides. @internal */
export interface NetHost {
  localPlayer(): Player;
  refereePlayer(): Player | null;
  isReferee(): boolean;
  owner(target: Behaviour): Player | null;
  isOwner(target: Behaviour, player: Player): boolean;
  setOwner(target: Behaviour, player: Player): void;
  behavioursOn(object: GameObject): Behaviour[];
  serverSeconds(): number;
  playerList(): Player[];
  playerById(id: number): Player | null;
  callingPlayer(): Player | null;
  callingSession(): { sid: string; uid: string } | null;
  setCandidate(on: boolean): void;
  isCandidate(player: Player): boolean;
  startKind(): StartKind;
}

type Target = Behaviour | GameObject;

export class Networking {
  private readonly host: NetHost;

  /** @internal */
  constructor(host: NetHost) {
    this.host = host;
  }

  get LocalPlayer(): Player {
    return this.host.localPlayer();
  }

  /** True on the one client that is this instance's referee (VRChat: the master). */
  get IsReferee(): boolean {
    return this.host.isReferee();
  }

  /** The same as IsReferee, under the name upstream code uses. */
  get IsMaster(): boolean {
    return this.host.isReferee();
  }

  /** The referee, or null while there is none. */
  get Master(): Player | null {
    return this.host.refereePlayer();
  }

  /**
   * IsOwner(target): does the local player own it?  IsOwner(player, target): does that player?
   * A GameObject stands for the behaviours on it, as in Udon, where ownership belongs to the object.
   */
  IsOwner(a: Target | Player, b?: Target): boolean {
    const player = b === undefined ? this.host.localPlayer() : (a as Player);
    const target = (b === undefined ? a : b) as Target;
    const behaviour = this.first(target);
    return behaviour ? this.host.isOwner(behaviour, player) : false;
  }

  GetOwner(target: Target): Player | null {
    const behaviour = this.first(target);
    return behaviour ? this.host.owner(behaviour) : null;
  }

  /**
   * Makes `player` the owner. It takes effect here at once; if someone else claimed at the same moment and the
   * room kept their claim, OnOwnershipTransferred reports the real owner a moment later.
   */
  SetOwner(player: Player, target: Target): void {
    for (const behaviour of this.all(target)) this.host.setOwner(behaviour, player);
  }

  /** Synced time in seconds: the same on every client, to within the accuracy of the first clock exchange. */
  GetServerTimeInSeconds(): number {
    return this.host.serverSeconds();
  }

  GetServerTimeInMilliseconds(): number {
    return Math.floor(this.host.serverSeconds() * 1000);
  }

  /** Everyone taking part in this instance, in player-id order (VRChat: VRCPlayerApi.GetPlayers). */
  GetPlayers(): Player[] {
    return this.host.playerList();
  }

  GetPlayerCount(): number {
    return this.host.playerList().length;
  }

  GetPlayerById(id: number): Player | null {
    return this.host.playerById(id);
  }

  /**
   * While a network event or a command runs: the player who sent it (the local player for one sent here).
   * Null outside one, and null for a sender who is not taking part in this instance.
   */
  get CallingPlayer(): Player | null {
    return this.host.callingPlayer();
  }

  /** The sender's session and user id, as the room stamped them, even when they are not a participant. */
  get CallingSession(): { sid: string; uid: string } | null {
    return this.host.callingSession();
  }

  /**
   * In a game whose referee candidates are "declared": offers the local player as referee, or withdraws them.
   * A referee who withdraws stops being referee and the remaining candidates elect another.
   */
  SetRefereeCandidate(on: boolean): void {
    this.host.setCandidate(on);
  }

  IsRefereeCandidate(player: Player): boolean {
    return this.host.isCandidate(player);
  }

  /** Whether this client started a new game, resumed a saved one, or joined one in progress. */
  get StartKind(): StartKind {
    return this.host.startKind();
  }

  /** Always false: the app queues and retries writes itself. Kept so that upstream checks translate. */
  get IsClogged(): boolean {
    return false;
  }

  private all(target: Target): Behaviour[] {
    return target instanceof GameObject ? this.host.behavioursOn(target) : [target];
  }

  private first(target: Target): Behaviour | null {
    return this.all(target)[0] ?? null;
  }
}

/** UdonSharp's Utilities.IsValid: not null, and for a player, still in the room. */
export const Utilities = {
  IsValid(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    const check = (value as { IsValid?: () => boolean }).IsValid;
    return typeof check === "function" ? check.call(value) : true;
  },
};
