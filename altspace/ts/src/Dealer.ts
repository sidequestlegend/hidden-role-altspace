// The referee's sealed deliveries: one entry per roster slot, each readable only by that slot's player, all rewritten
// together with fresh nonces at a fixed rate for the whole match (PORT.md 3.9). A reader learns nothing from when the
// leaf changes or how large it is: it changes every BEAT_SECONDS whatever happened, and every entry has a fixed size.
//
// Upstream sent Role, the job masks and the cooldowns to every client in plain networked properties
// (Player:67, 76-79, 94) and only the interface held them back (C5).

import { Behaviour, type Player } from "../portkit/src/index.ts";
import { decodeSecret, encodeSecret, type Secret } from "./Beat.ts";

export class Dealer extends Behaviour {
  static override synced = ["box"];
  /** {r: match number, s: [one sealed entry per slot, "" for a bot or a player whose key is not known yet]} */
  box = "";
  /** The local player's own entry, once opened. */
  mine: Secret | null = null;
  /** The match number of the last entry opened. */
  openedRound = -1;
  /** How many entries this client has opened (tests). */
  opens = 0;
  /** Told when the local player's entry changes. */
  onMine: (secret: Secret) => void = () => {};
  private opening = 0;
  private sealing = false;

  override OnDeserialization(): void {
    void this.OpenMine();
  }

  /** The referee writes a new box: `entries` are the plain secrets per slot, `players` who each slot is now. */
  async Deal(round: number, entries: Array<Secret | null>, players: Array<Player | null>): Promise<void> {
    if (!this.Networking.IsReferee || this.sealing) return;
    this.sealing = true;
    try {
      const sealed = await Promise.all(
        entries.map(async (secret, slot) => {
          const p = players[slot];
          if (!secret || !p || !this.Secrets.canSealFor(p.sid)) return "";
          try {
            return await this.Secrets.seal(p.sid, encodeSecret(secret));
          } catch {
            return "";
          }
        }),
      );
      if (!this.Networking.IsReferee) return;
      this.box = JSON.stringify({ r: round, s: sealed });
      this.RequestSerialization();
      void this.OpenMine();
    } finally {
      this.sealing = false;
    }
  }

  Clear(): void {
    if (!this.Networking.IsReferee || this.box === "") return;
    this.box = "";
    this.RequestSerialization();
  }

  /** Opens the local player's entry, if there is one for them. */
  async OpenMine(): Promise<void> {
    const ticket = ++this.opening;
    let parsed: { r?: unknown; s?: unknown };
    try {
      parsed = JSON.parse(this.box || "{}");
    } catch {
      return;
    }
    if (!Array.isArray(parsed.s)) return;
    for (const entry of parsed.s) {
      if (typeof entry !== "string" || entry === "" || !this.Secrets.isForMe(entry)) continue;
      try {
        const { value: text, from } = await this.Secrets.openWithSender<string>(entry);
        if (ticket !== this.opening) return; // a newer box arrived meanwhile
        // A deal is authority only from the referee that dealt this match (the public record names it).
        const match = this.FindBehaviour<{ m: { d: string } } & Behaviour>("match");
        if (!match || from !== match.m.d) return;
        const secret = decodeSecret(text);
        if (!secret) return;
        this.opens++;
        this.mine = secret;
        this.openedRound = secret.n;
        this.onMine(secret);
      } catch {
        /* not ours after all, or changed on the way */
      }
      return;
    }
  }
}
