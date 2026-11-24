// The sample game: noughts and crosses with two seats, written the way a translated UdonSharp file reads.
// It is what the kit's own tests play, and `npm run build` turns it into dist/pk-tic-tac-toe.js.
//
// The upstream pattern it copies: whoever acts takes ownership, changes the synced fields and serialises;
// everyone else redraws in OnDeserialization. Two players acting in the same instant is a race for ownership:
// the room keeps one claim, and the runtime puts the other player's fields back.

import { Behaviour, type DeserializationResult, type Player, type TextRef } from "../../src/index.ts";

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export class TicTacToe extends Behaviour {
  static override synced = ["board", "seats", "turn", "winner", "moves"];

  /** 0 empty, 1 X, 2 O. */
  board: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  /** Player id in each seat (X then O), or -1. */
  seats: number[] = [-1, -1];
  /** The seat to move. */
  turn = 0;
  /** 0 playing, 1 X won, 2 O won, 3 a draw. */
  winner = 0;
  moves = 0;

  // From bindings.json.
  statusText!: TextRef;
  cellTexts: TextRef[] = [];
  seatTexts: TextRef[] = [];

  /** How many times this client redrew because of someone else's change (for the tests). */
  redraws = 0;
  snapshots = 0;

  override Start(): void {
    this.Refresh();
  }

  override OnDeserialization(result: DeserializationResult): void {
    this.redraws++;
    if (result.isSnapshot) this.snapshots++;
    this.Refresh();
  }

  override OnPlayerLeft(player: Player): void {
    // As upstream: the master tidies up after a player who left.
    if (!this.Networking.IsMaster) return;
    const seat = this.seats.indexOf(player.playerId);
    if (seat < 0) return;
    this.Networking.SetOwner(this.Networking.LocalPlayer, this.gameObject);
    this.seats[seat] = -1;
    this.RequestSerialization();
    this.Refresh();
  }

  TakeSeat(seat: number): void {
    const me = this.Networking.LocalPlayer;
    if (this.seats[seat] !== -1 || this.seats.indexOf(me.playerId) >= 0) return;
    this.Networking.SetOwner(me, this.gameObject);
    this.seats[seat] = me.playerId;
    this.RequestSerialization();
    this.Refresh();
  }

  LeaveSeat(): void {
    const me = this.Networking.LocalPlayer;
    const seat = this.seats.indexOf(me.playerId);
    if (seat < 0) return;
    this.Networking.SetOwner(me, this.gameObject);
    this.seats[seat] = -1;
    this.RequestSerialization();
    this.Refresh();
  }

  Play(cell: number): void {
    const me = this.Networking.LocalPlayer;
    const seat = this.seats.indexOf(me.playerId);
    if (seat < 0 || seat !== this.turn || this.winner !== 0 || this.board[cell] !== 0) return;
    this.Networking.SetOwner(me, this.gameObject);
    this.board[cell] = seat + 1;
    this.moves++;
    this.winner = this.CheckWinner();
    this.turn = 1 - this.turn;
    this.RequestSerialization();
    this.Refresh();
  }

  ResetGame(): void {
    const me = this.Networking.LocalPlayer;
    if (this.seats.indexOf(me.playerId) < 0 && !this.Networking.IsMaster) return;
    this.Networking.SetOwner(me, this.gameObject);
    for (let i = 0; i < 9; i++) this.board[i] = 0;
    this.turn = 0;
    this.winner = 0;
    this.moves = 0;
    this.RequestSerialization();
    this.Refresh();
  }

  CheckWinner(): number {
    for (const [a, b, c] of LINES) {
      const mark = this.board[a!]!;
      if (mark !== 0 && mark === this.board[b!] && mark === this.board[c!]) return mark;
    }
    return this.moves >= 9 ? 3 : 0;
  }

  private NameOf(seat: number): string {
    const id = this.seats[seat]!;
    if (id < 0) return "(empty)";
    const player = this.Networking.GetPlayerById(id);
    return player ? player.displayName : "(gone)";
  }

  Refresh(): void {
    for (let i = 0; i < this.cellTexts.length; i++) this.cellTexts[i]!.text = this.board[i] === 1 ? "X" : this.board[i] === 2 ? "O" : "";
    for (let i = 0; i < this.seatTexts.length; i++) this.seatTexts[i]!.text = (i === 0 ? "X: " : "O: ") + this.NameOf(i);
    if (!this.statusText) return;
    if (this.winner === 3) this.statusText.text = "A draw";
    else if (this.winner !== 0) this.statusText.text = `${this.NameOf(this.winner - 1)} wins`;
    else if (this.seats[0] === -1 || this.seats[1] === -1) this.statusText.text = "Waiting for players";
    else this.statusText.text = `${this.NameOf(this.turn)} to move`;
  }
}

/** One square of the board: a click plays it. */
export class Cell extends Behaviour {
  index = 0;
  game!: TicTacToe;

  override Interact(): void {
    this.game.Play(this.index);
  }
}

/** A seat marker: a click sits the local player down, or stands them up if it is their seat. */
export class SeatButton extends Behaviour {
  seat = 0;
  game!: TicTacToe;

  override Interact(): void {
    if (this.game.seats[this.seat] === this.Networking.LocalPlayer.playerId) this.game.LeaveSeat();
    else this.game.TakeSeat(this.seat);
  }
}

export class ResetButton extends Behaviour {
  game!: TicTacToe;

  override Interact(): void {
    this.game.ResetGame();
  }
}
