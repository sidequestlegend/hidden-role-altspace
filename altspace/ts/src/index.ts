// The game's definition: its slug and the classes bindings.json names by `type`. The build reads the default export.
//
// Working slug `hidden-role` (PORT.md "Names": the title and the final slug are still to be chosen). Referee
// candidates are "declared": only players who joined the lobby can be elected, so a bystander is never handed the
// roles (PORT.md Q2).

import type { GameDefinition, GameInstance } from "../portkit/src/index.ts";
import { Dealer } from "./Dealer.ts";
import { Match } from "./Match.ts";
import { PlayerLink } from "./PlayerLink.ts";
import { RuntimeHud } from "./RuntimeHud.ts";

const game: GameDefinition = {
  slug: "hidden-role",
  behaviours: { Match, Dealer, RuntimeHud, PlayerLink },
  referee: "declared",
  debug: (instance: GameInstance) => ({
    match: () => instance.behaviour<Match>("match").m,
    hud: () => instance.behaviour<RuntimeHud>("hud").texts,
  }),
};

export default game;
