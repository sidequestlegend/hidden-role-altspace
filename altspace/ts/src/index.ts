// The game's definition: its slug and the classes bindings.json names by `type`. The build reads the default export.
//
// Working slug `hidden-role` (PORT.md "Names": the title and the final slug are still to be chosen). Referee
// candidates are "declared": only players who joined the lobby can be elected, so a bystander is never handed the
// roles (PORT.md Q2).

import type { GameDefinition, GameInstance } from "../portkit/src/index.ts";
import { Vector2, Vector3 } from "../portkit/src/index.ts";
import { Dealer } from "./Dealer.ts";
import { Match } from "./Match.ts";
import { PlayerLink } from "./PlayerLink.ts";
import { RuntimeHud } from "./RuntimeHud.ts";
import { STATION } from "./ShipMap.ts";
import { StationButton } from "./StationButton.ts";

const game: GameDefinition = {
  slug: "hidden-role",
  behaviours: { Match, Dealer, RuntimeHud, PlayerLink, StationButton },
  referee: "declared",
  debug: (instance: GameInstance) => debugHooks(instance),
};

/**
 * Readers for the Play-mode tests (window.__pk1.debug["hidden-role:<inst>"]). Everything here is this page's own view:
 * the public match, the local player's own sealed entry, the boards' texts. `force` is the rules' test aid and `refPos`
 * the referee's own position of a player (the referee's page only; the Node tests use them the same way). portkit puts
 * these on a test page only (`window.__pk1_debug`): a published page has none of them (fixpass test 4).
 */
function debugHooks(instance: GameInstance): Record<string, unknown> {
  const hud = () => instance.behaviour<RuntimeHud>("hud");
  const match = () => instance.behaviour<Match>("match");
  return {
    match: () => match().m,
    hud: () => hud().texts,
    me: () => {
      const p = hud().Networking.LocalPlayer;
      return { uid: p.uid, sid: p.sid, name: p.displayName };
    },
    slot: () => hud().MySlot(),
    role: () => hud().MyRole(),
    mine: () => hud().Mine(),
    joined: () => hud().Joined,
    work: () => hud().WorkAmount,
    regionsOn: () => hud().RegionsOn,
    lobby: () => match().Lobby().map((p) => p.uid),
    /** What the HUD last applied its effects for, and where the page thinks the head is (world). */
    applied: () => ({ ...(hud() as unknown as { applied: Record<string, unknown> }).applied, head: hud().Input.Position }),
    events: (kind: string) => match().history.filter((e) => e.kind === kind).map((e) => ({ t: e.t, actor: e.actor, target: e.target, detail: e.detail })),
    moves: () => hud().moves.map((mv) => ({ why: mv.why, x: mv.at.x, y: mv.at.y })),
    here: () => {
      const p = hud().MyMapPosition();
      return p ? [p.x, p.y] : null;
    },
    toMap: (x: number, y: number, z: number) => {
      const p = hud().ToMap(new Vector3(x, y, z));
      return [p.x, p.y];
    },
    world: (x: number, y: number, h = 0) => {
      const w = hud().ToWorld(new Vector2(x, y), h);
      return [w.x, w.y, w.z];
    },
    /** The route a walker takes from (x, y) to (tx, ty): the rules' own steering, a point every few metres. */
    route: (x: number, y: number, tx: number, ty: number, radius = 0.3) => {
      const points: number[][] = [];
      let at = new Vector2(x, y);
      const goal = new Vector2(tx, ty);
      for (let i = 0; i < 400 && Vector2.Distance(at, goal) > 0.05; i++) {
        const next = STATION.NextStep(at, goal, radius);
        if (Vector2.Distance(next, at) < 0.01) break;
        points.push([next.x, next.y]);
        at = next;
      }
      return points;
    },
    walkable: (x: number, y: number, radius = 0) => !STATION.IsBlocked(new Vector2(x, y), radius),
    job: (id: number) => {
      const s = STATION.JobStations[id];
      return s ? { id: s.Id, name: s.Name, kind: s.Kind, x: s.Position.x, y: s.Position.y } : null;
    },
    pathOf: (key: string) => instance.bindings.objects[key]?.path ?? null,
    isReferee: () => match().Networking.IsReferee,
    /** The referee's own position for a roster slot (the referee's page only; null elsewhere): PORT.md D12. */
    refPos: (slot: number) => {
      const p = match().rules?.players[slot]?.position;
      return p ? [p.x, p.y] : null;
    },
    force: (uids: string[] | null) => {
      match().forcedSaboteurs = uids;
      return match().Networking.IsReferee;
    },
  };
}

export default game;
