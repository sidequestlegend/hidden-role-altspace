// A record only the referee may write, published in the referee's own user state.
//
// Public space state can be written by any client, so nothing a player could be wronged by lives there: a forged
// pin in the fair-draw table would make an honest reveal fail, a forged acknowledgement would drop another player's
// commands unrun. The room ties user state to its sender, so a record read from the current referee's user state was
// written by the referee and by nobody else.
//
//   - Every client reads the table from the user state of `Referee.current()`, and keeps the last table it read.
//   - While there is no referee, or the new one has not published yet, readers use that last table.
//   - A new referee starts from the last table it read from its predecessor (its own copy of the mirror), so a
//     change of referee loses nothing that had reached the room, and publishes that copy as soon as its term starts
//     (`ensurePublished`), even unchanged or empty: "published" then tells a page that starts later that the table it
//     reads is the whole of it.
//   - A table carries the epoch it belongs to; one of any other epoch counts as empty.

import type { Presence } from "./presence.ts";
import type { Referee } from "./referee.ts";
import { asciiJson, isRecord } from "./util.ts";

export class RefereeTable<T> {
  private readonly presence: Presence;
  private readonly referee: Referee;
  private readonly name: string;
  private readonly parseEntry: (value: unknown) => T | null;
  private last: { e: number; m: Record<string, T> } | null = null;
  private lastText = "";

  constructor(presence: Presence, referee: Referee, name: string, parseEntry: (value: unknown) => T | null) {
    this.presence = presence;
    this.referee = referee;
    this.name = name;
    this.parseEntry = parseEntry;
  }

  /** The table as the referee published it: read from the referee's own user state, else the last one read. */
  read(): Record<string, T> {
    const ref = this.referee.current();
    const epoch = this.referee.epoch;
    if (ref) {
      const raw = this.presence.extra(ref.sid, this.name);
      const parsed = this.parse(raw, epoch);
      if (parsed) {
        this.last = { e: epoch, m: parsed };
        return parsed;
      }
    }
    return this.last && this.last.e === epoch ? this.last.m : {};
  }

  /** A copy the referee may change and `write`: its own published table, else its predecessor's last one. */
  working(): Record<string, T> {
    const epoch = this.referee.epoch;
    const own = this.parse(this.presence.extra(this.presence.localSid, this.name), epoch);
    const base = own ?? (this.last && this.last.e === epoch ? this.last.m : {});
    return JSON.parse(JSON.stringify(base)) as Record<string, T>;
  }

  /** True when the current referee's user state holds a table of this epoch (an empty one counts). */
  published(): boolean {
    const ref = this.referee.current();
    return !!ref && this.parse(this.presence.extra(ref.sid, this.name), this.referee.epoch) !== null;
  }

  /**
   * The referee publishes the table it carries (its predecessor's last one, or an empty one in a new epoch) as soon as
   * its term starts, before any entry changes: a page that starts in between would otherwise read no table at all, its
   * saved draw could not come back, and it would take everything numbered before it came as new. True when it wrote.
   */
  ensurePublished(): boolean {
    if (!this.referee.isMe()) return false;
    if (this.parse(this.presence.extra(this.presence.localSid, this.name), this.referee.epoch) !== null) return false;
    this.lastText = "";
    this.write(this.working());
    return true;
  }

  /** Publishes the table in the local player's user state (only the referee calls this). */
  write(table: Record<string, T>): void {
    const value = { e: this.referee.epoch, m: table };
    const text = asciiJson(value);
    if (text === this.lastText && this.presence.extra(this.presence.localSid, this.name) !== undefined) return;
    this.lastText = text;
    this.presence.setExtra(this.name, value);
    this.last = { e: value.e, m: JSON.parse(JSON.stringify(table)) as Record<string, T> };
  }

  private parse(raw: unknown, epoch: number): Record<string, T> | null {
    if (!isRecord(raw) || raw.e !== epoch || !isRecord(raw.m)) return null;
    const out: Record<string, T> = {};
    for (const key of Object.keys(raw.m)) {
      const entry = this.parseEntry(raw.m[key]);
      if (entry !== null) out[key] = entry;
    }
    return out;
  }
}
