// The game's definition: its slug and the classes bindings.json names by `type`. The build reads the default export.

import type { GameDefinition } from "../portkit/src/index.ts";
import { Counter } from "./Counter.ts";

const game: GameDefinition = {
  slug: "change-me",
  behaviours: { Counter },
};

export default game;
