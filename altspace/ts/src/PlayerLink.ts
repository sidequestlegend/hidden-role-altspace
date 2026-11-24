// One per player, owned by that player, in their own user state (VRChat would call it a PlayerObject). It carries the
// two things only that player may say: that they are in the lobby (`j`, the synced time they joined, 0 when not),
// and their sealed input beat (`b`, see Beat.ts). The upstream counterpart is the input each Fusion client sent its
// host every tick; joining replaces the session join (PORT.md 8.4).
//
// The beat is written on a fixed schedule by RuntimeHud.ts; nothing here depends on what the player did.

import { Behaviour } from "../portkit/src/index.ts";

export class PlayerLink extends Behaviour {
  static override perPlayer = true;
  static override synced = ["j", "b"];
  /** Synced seconds when the player joined the lobby; 0 when they are not in it. */
  j = 0;
  /** The latest sealed beat, for the referee only. */
  b = "";
  /** Local: how many times the fields were received (tests). */
  received = 0;

  get IsMine(): boolean {
    return this.Player !== null && this.Player.isLocal;
  }

  /** The local player joins or leaves the lobby. Joining also offers them as referee ("declared" candidates). */
  SetJoined(on: boolean): void {
    if (!this.IsMine) return;
    const now = this.Networking.GetServerTimeInSeconds();
    this.j = on ? Math.max(1, Math.round(now * 1000) / 1000) : 0;
    this.RequestSerialization();
  }

  /** Writes the next beat. */
  SendBeat(text: string): void {
    if (!this.IsMine) return;
    this.b = text;
    this.RequestSerialization();
  }

  /** Clears the beat when the player stops sending (end of match). */
  ClearBeat(): void {
    if (!this.IsMine || this.b === "") return;
    this.b = "";
    this.RequestSerialization();
  }

  override OnDeserialization(): void {
    this.received++;
  }
}
