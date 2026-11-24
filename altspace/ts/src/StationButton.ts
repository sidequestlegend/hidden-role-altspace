// A clickable thing in the station (no upstream counterpart: upstream's only input was the keyboard). The kit builder
// puts one on every console, fault panel, the muster post, the boarding pad, each body marker and each bot marker, and
// a click on it is handed to the local player's RuntimeHud, which turns it into the same logical buttons the keys
// press (a console: Use, held for a hold job, tapped for a tap job, pressed and let go for a timing job). The rules
// still decide whether the press did anything: range, role, cooldowns (PORT.md "Job stations in the kit").

import { Behaviour } from "../portkit/src/index.ts";
import type { RuntimeHud } from "./RuntimeHud.ts";

export type StationKind = "job" | "panel" | "post" | "body" | "bot" | "board" | "leave" | "credits";

export class StationButton extends Behaviour {
  /** A click counts within this many metres of the local head or hands (the rules still check the range). */
  static override interactReach = 3;
  /** What the kit builder says this is (bindings.json fields). */
  kind: StationKind = "job";
  index = 0;
  hud: RuntimeHud | null = null;

  override Interact(): void {
    this.hud?.ClickStation(this.kind, this.index);
  }
}
