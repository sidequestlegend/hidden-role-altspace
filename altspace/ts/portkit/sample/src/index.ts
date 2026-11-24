// What a game's ts/src/index.ts looks like: the definition the build bundles with bindings.json.

import type { GameDefinition } from "../../src/index.ts";
import { Cell, ResetButton, SeatButton, TicTacToe } from "./TicTacToe.ts";

export const game: GameDefinition = {
  slug: "tic-tac-toe",
  behaviours: { TicTacToe, Cell, SeatButton, ResetButton },
};

export default game;
