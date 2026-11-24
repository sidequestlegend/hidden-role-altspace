# hidden-role: test evidence

Everything here ran on 2026-11-24 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor (project
`altspace/`, Play-mode page port 44000). Nothing ran in the Altspace app, on a Quest, or with controllers (rung 5:
not run; worlds stay Private).

The runtime in `ts/portkit/` mirrors portkit commit `1118ef0` (the fixed kit; `tools/sync.sh` run again when the
Unity project was made: no change). The game already declared `Match.networkCallable = ["CmdStart", "CmdAbort"]` (its
only `SendCommand` targets; it sends no network events) and had no local workarounds left.

How to run each rung again:

```
cd altspace/ts && npm test                                                     rungs 0 and 1
node tools/walkable-grid.ts; node tools/sightlines.ts                          remake the collider vectors and the visible sets
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Prefabs"             the kit and ts/bindings.json
cd altspace/ts && npm run build                                                Assets/WebRoot/pk-hidden-role.js
portkit/tools/remote.sh altspace menu "PortKit/Kit/Build Bundles" 1800
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                     rung 2 (Logs/portkit_check.txt)
portkit/tools/remote.sh altspace menu "HiddenRole/Check Walkable"             rung 2, colliders (Logs/hiddenrole_walkable.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json hidden-role  rung 3
portkit/tools/remote.sh altspace menu "PortKit/Multiplayer/Activate Player 2"
portkit/tools/playtest.sh altspace altspace/playtest/multi.json hidden-role   rung 4
portkit/tools/remote.sh altspace menu "PortKit/Kit/Export Artifacts"          dist/
```

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`: **42 tests, 42 pass, 0 fail** (9.8 s). The 40 of the rules port (`PORT.md` section 7:
golden vectors against the upstream C#, rules, scenarios on the fake room, secrecy) run on the bindings the kit
builder wrote, plus two new ones (`test/kit.test.ts`):

```
ok 10 - console clicks work every kind of job; the work bar and the jobs-done bars follow
ok 11 - the muster post and a body marker are clicked; the boarding pad and Leave move a player in and out
# tests 42
# pass 42
# fail 0
```

The first works a technician's jobs by clicking the consoles only (hold: one click, let go by the HUD when done; tap:
four clicks; timing: two clicks 1.65 s apart) and checks each job done, the work bar moving, and both jobs-done bars at
done / total. The second calls a muster by clicking the post, has the saboteur down a technician and reports the body
by clicking its marker, then uses Leave and the boarding pad, and checks that only some of the 30 regions are drawn
from the Commons.

## Rung 2: edit mode

`PortKit/Kit/Check` (`Logs/portkit_check.txt`):

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS hidden-role bindings: 124 objects resolve by path; hash matches (dfa38295e9ffc5a8d53a3da5becbd1d091094fdc)
PASS hidden-role android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, ...
PASS hidden-role windows bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, ...
DONE
```

Build (`Logs/portkit_kits.txt`, `Logs/portkit_bundles.txt`): 510 objects, 124 bound (71 clickable), 62 refs, 51
behaviours, 24 events; relay graph 49 distinct members, all on the allow list of 29,061; bundles Android 1,100 KiB,
Windows 1,141 KiB, each PASS from `BS.Security.BundleChecker` with its kit rules.

The station's colliders against the rules' walkable test (`HiddenRole/Check Walkable`, `PORT.md` section 11): the
rules' `ShipMap.IsBlocked` at every 0.25 m of the play bounds (600 x 464 points, `ts/vectors/walkable-grid.json`)
against the built prefab's colliders, with a body capsule of radius 0.25 m:

```
grid 600 x 464 at 0.25 m, body radius 0.25 m, height 1.70 m (from 0.30 m)
PASS nothing solid where the rules give a body room: 70654 of 70654 clear points free, 0 blocked
PASS a body reaches nothing the rules call blocked: 70861 points reachable from the Commons, 0 of them blocked to the rules
PASS everything the rules connect is reachable: 70654 of 70654 connected clear points reached
DONE
```

`HiddenRole/Kit Stats`: 27 materials (URP Unlit), 7 textures (6 painted ones of 128-256 px and the font atlas),
11,200 mesh triangles without text, 144 renderers in the station's 30 regions, 95 texts, 853 box colliders.

## Rung 3: Play mode, one person and five bots

`playtest/single.json`: a hand-written `<bs-snippet>` (`bots="5"`, `shift-seconds="900"`, `breach-seconds="600"`,
placed at `0 0.05 6` so the editor's spawn is in the Commons) with the script and the bundles from the test's own
server; the page script `Assets/WebRoot/playtest/hidden-role-playtest.js`. Clicks go through the SDK's desktop
player (portkit's InputSim mouse); walking through this project's `walk` command, because Play mode's desktop player
is a fly camera that passes through walls: a capsule of radius 0.25 m, 1.7 m tall, moved at 3.5 m/s along the
rules' own route and slid along whatever solid it meets (`HiddenRoleTools.cs`), so a walk that arrives is one the
kit's colliders allow. The test aid of the Node tests (`Match.forcedSaboteurs`) names Bot 1 as the saboteur so the
person is a technician; Bot 1 hunts as upstream's bot does, so in some runs it downs the person first: the test then
checks the lounge, stops the match from the lounge board and plays another (up to six).

Final run (`playtest/evidence_single.txt`): **RESULT 25 passed, 0 failed**, 0 console errors.

```
PASS Join on the hub board puts the player in the lobby (click through the SDK's desktop player): joined true
PASS the one lobby player is elected referee (declared candidates)
PASS a match starts with five bots (match 1): state 1, roster Main Editor, Bot 1*, Bot 2*, Bot 3*, Bot 4*, Bot 5*
PASS the person's own role arrives sealed: technician: role technician, public roles []
PASS the person is taken to their start point: start -1.45,-48.37, Unity feet -1.45 0.05 -42.37
PASS bot markers stand in the station and move: -23.150 1.000 -18.060 -> -21.130 1.000 -16.610
PASS the person walks to a job console through the station (capsule against the kit's colliders): 3 legs in 5.2 s
PASS the work bar on the personal panel moves while the job is worked: peak 1
PASS a job is completed by clicking its console: job 15 (tap)
PASS the jobs-done bar shows the station's progress (hub board, read in Unity): jobs 2/25, fill 0.080 1.000 1.000
PASS the personal panel's jobs bar shows it too: 0.080 1.000 1.000
PASS the downed bot's marker lies where it fell: Station/Bodies/Body3 active True
PASS raising the alarm at a downed bot calls a muster: walked true, state 2, body slot 3
PASS the muster gathers the living at the ring round the post: 2.80 m from the post, Unity feet 0.00 0.05 8.80
PASS players stand still in the ring (movement locked): blocked at 0.00 8.80, 1.00 m short (movement locked)
PASS the muster board says why and who: ALARM: Main Editor found Bot 3 down. / Vote: 27s left
PASS the muster board's buttons name the living: button 5: 'Bot 5'
PASS the person's ballot is counted (who voted is public, the choice is sealed): referee's record: {"t":...,"actor":0}
PASS the vote resolves when all have voted: Bot 5 was locked out. / They were a technician.
PASS after the vote the living are sent back where they stood: before 33.37,33.32, Unity feet 33.37 0.05 39.32
PASS and may move again: ok reached 33.55 39.32
```

Earlier runs on the same kit added: `PASS an eliminated player is sent to the
observer lounge, 70 m down: -3.00 -69.95 4.50` (the person downed by Bot 1), the lounge board's Stop match, and
other job kinds done by clicks (hold: jobs 4, 6, 21; tap: 9, 15, 20). Pictures: `playtest/evidence_single_*.jpg`
(Commons with the hub board, muster post, ring and board; a console; the muster board from the ring; a room).

Frame statistics read in Play mode (Game view, `stats` command), from the runs above:

| Where | Regions drawn | Triangles | Batches | SetPass |
|---|---|---|---|---|
| Spawn, before the page knows the position | 30 of 30 | 9,080 | 178 | 18 |
| At console 8 (Dive Locker) | 18 | 4,814 | 63 | 12 |
| At console 15 (Battery Bay) | 15 | 11,993 | 179 | 19 |
| At console 20 (Scrubber Room) | 18 | 8,552 | 122 | 14 |
| At console 21 (Scrubber Room) | 19 | 11,803 | 224 | 19 |
| After a muster (Sonar Room) | | 4,716 | 37 | 12 |

Found and fixed by this rung: the start teleport was skipped when a fresh room reused a match number this device had
stored (the stored mark is now the match's start time); the station's drawn pieces crossed region lines (now split);
the hub board's buttons are switched off with their region, so a match is stopped at the hub board or the lounge
board (the test walks there first); the SDK's desktop pointer acted on the previously clicked object when the mouse
had not moved (the test moves it off and back).

## Rung 4: two Local Multiplayer players and three bots

`playtest/multi.json`, Player 2 started with `PortKit/Multiplayer/Activate Player 2`. The page whose session sorts
first is A (technician), the other B (saboteur, named by the referee's page with the test aid). A walks to the post
and calls a muster; both abstain; A stops the match; both compare digests in the lobby (a running match changes every
quarter second as bots walk, so digests are compared once the lobby has held still for 1.5 s). B leaves the lobby,
A starts a second match without B, and B reloads its page while it runs: B's body is put at the world's spawn (a
reload does not move the body; an arrival appears there), and B must end up an observer in the lounge, with the same
match as A and, after the match, the same digest.

Two consecutive runs: **RESULT 33 passed, 0 failed** each (`playtest/evidence_multi.txt` is the second), 0 console
errors.

```
[main] PASS each player sees only their own role (sealed entry; no role in the public record): saboteur, public roles [], panel 'You are a SABOTEUR'
[main] PASS the other page saw a different role of its own: technician: 'You are a TECHNICIAN'
[vp-...] PASS each player sees only their own role (sealed entry; no role in the public record): technician, public roles [], panel 'You are a TECHNICIAN'
[main] PASS the muster moves this player to the ring: 2.80 m from the post
[main] PASS and the other player too (a muster moves both): 2.80 m
[vp-...] PASS both pages hold the same state after the match (digest, in the lobby): beb453b1 / beb453b1
[vp-...] PASS A starts a second match without B: state 1, roster Player 2, Bot 1*, Bot 2*, Bot 3*
[main] PASS the reloaded page finds the match running and is not on its roster: state 1, slot -1
[main] PASS a late joiner is sent to the observer lounge, 70 m down: -3.00 -69.95 4.50
[main] PASS the late joiner's panel and the lounge board say so: Observing this match. / You are out of the match: watch from here.
[main] PASS the late joiner holds no sealed entry of the match: null
[vp-...] PASS B's reloaded page sees the same match (number, start, roster): 2 Player 2,Bot 1,Bot 2,Bot 3
[vp-...] PASS B's reloaded page and A's hold the same state in the lobby (digest): c7f501d9 / c7f501d9
[main] PASS when the match ends the observer comes back up to the hub: -8.00 0.05 9.00
```

Found on the way: the start of the second match raced B's leaving the lobby (B's flag reaches A's page through B's
user state; the test now waits until A's page no longer lists B), and A had to walk back to the hub board to stop the
match (its region is switched off elsewhere). Runs before those fixes are not counted.

## Artifacts

`PortKit/Kit/Export Artifacts` -> `dist/` (not checked in): `android/hidden-role`, `windows/hidden-role`,
`pk-hidden-role.js` (454,234 bytes), `hidden-role.jpg`, `hidden-role.snippet.html` (`single="true"`, position `0 0.05
0`, the game's settings), `manifest.json` (footprint 123.5 x 73.4 x 112.9 m: the lounge 70 m down is inside it).

## Not verified

Everything in the app and on a Quest (rung 5); controllers; a real avatar's body against the walls (the test's
capsule stands in for it); text size and the region switching's pop-in in a headset; the app's own frame rate with
the draw counts above.
