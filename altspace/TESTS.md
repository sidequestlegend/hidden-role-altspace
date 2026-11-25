# hidden-role: test evidence

## Page script on portkit 552622c, 2026-11-25 evening

Re-synced `ts/portkit` and the package to portkit `552622c`. That commit includes `425bd55`: the page loads kit
items one at a time, because overlapping loads lost relay graphs and Variables in the app. It also includes
`0880bf5`: a referee claimant starts only once its claim has stood for 1.5 s, which fixes the equal-term double
claim, and user-state flushes go one at a time. The bundles are unchanged from the rebuild below. `npm test`:
**52 of 52** (0 failed). `npm run build`: 504409 bytes. Export Artifacts -> `dist/`: 8 files (3 licence texts), footprint 123.5 x 3.45 x 112.85 m ('Station'), bindings 126bf586a7b4a238d23036cd9eb8fba756f107ba.

## The personal panel and pushing, 2026-11-25 evening (portkit 476075d)

In world 9d7311 the personal panel followed every visitor's head, 0.55 m in front of it and 0.35 m below, even with
no match running, and a person there was shoved about. (The shove Shane felt after this game was taken off the page
was rp-toolkit's head label: the SDK gives every world-space canvas a solid box, measured in the hub, portkit GAPS.md
"Fourth pass". This kit has no canvases; the kit check confirms it.) Two changes:

- **The panel follows only a person in a match.** `RuntimeHud.PanelFollows(m, slot)`: on the roster (not a bot's slot)
  of a match that is playing, in a muster, or showing its result. Otherwise the panel and the blackout shell go back
  where the kit put them (`PANEL_PARK` = the lounge offset + (0, 0.5, -3.5), `SHELL_PARK`, kit-root local) once, and
  stay there.
- **Every click collider is a trigger** (`HiddenRoleKitBuilder`: the buttons, consoles, fault panels, the muster post,
  body and bot markers, the credits panel). The SDK's click rays (`BSDesktopController.TryGetClickTarget`) cover layers
  5 and 22 with `QueryTriggerInteraction.Collide`, so triggers are clicked. The SDK's seat prefab is a UI-layer
  trigger that is documented as clickable "in the app and in Play mode". The docs say bodies pass through UI-layer
  colliders anyway (`Docs/building-in-unity/layers.md`), and a trigger never pushes whatever the client's matrix does.

Results on portkit `476075d`:

- **Rung 0/1:** `npm test`: **52 tests, 52 pass** (48 before). New `test/panel.test.ts`: the follow rule; a visitor
  with no match (nothing sent near the head, panel and shell at their park); lobby players, then a match (panel 0.55 m
  in front of each rostered head), an observer during it, everyone after the match; the kit agrees (park position as
  the builder has it, every collider on the UI layer of the built prefab a trigger). Tests 2 and 3 fail with the old
  unconditional follow, and test 4 fails on the prefab built before.
- **Rung 2:** Check PASS (graphs, 124 bindings, hash `126bf586`, the new "canvas colliders" line, both bundles);
  Android 1,117 KiB, Windows 1,159 KiB; `HiddenRole/Check Walkable` PASS (70,654 of 70,654; 0 blocked; all reached).
  Script 501,592 bytes.
- **Rung 3** (`playtest/single.json`) has two new push checks. With no match: the panel stays in the bunkroom
  (0, -69.45, 2.5 with the kit at 0 0.05 6, 71 m from the head), and `standstill 5` returns "ok still: body moved
  0.000 m, player moved 0.000 m". In a match, in the muster ring: the panel is 0.65 m from the head and `standstill 5`
  returns "ok still". Runs 1 and 2 had the in-match check at the start of match 1, so the person stood still while the
  saboteur bot hunted. Run 1: 46 passed, 0 failed. Run 2: 44 passed, 3 failed, all scenario timing: the walk was cut
  by a bot's muster, the match had ended before the bunkroom check, and a 1 m step after the vote met a wall. The
  check then moved into the muster, where everyone stands still anyway. **Runs 3 and 4 in a row: 54 passed, 0 failed
  and 32 passed, 0 failed**, 0 console errors (run 4 covered everything in one match; `playtest/evidence_single.txt`
  is run 4). Every click in the runs (Join, Start, consoles, the post, the vote buttons) went to a trigger.
- **Rung 4** (`playtest/multi.json`), twice in a row: **35 passed, 0 failed** each, 0 console errors (`playtest/evidence_multi.txt` is run 2).
- **Artifacts:** Export Artifacts -> `dist/` (bindings `126bf586`).

A caveat: in Play mode the old panel probably would not have pushed the stand-in either. Its buttons sat 0.3 m beyond
the stand-in's radius, and the docs say bodies pass through layer 5. The Node tests are the ones that fail on the
old code.

## Re-sync, 2026-11-25 (portkit c971100)

Everything in this section ran on 2026-11-25 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor
(Play-mode page port 44000), after re-syncing `ts/portkit/` and `Packages/com.altspacegames.portkit/` to portkit
`c971100` (`sync.sh`). The game had no workaround of its own to drop for this kit; the one change is
`FootprintRoot => "Station"` in `HiddenRoleKitBuilder.cs`. Nothing ran in the Altspace app or on a Quest (rung 5: not
run).

- **Rung 0/1:** `npm test`: typecheck and lint clean; **48 tests, 48 pass** (before and after the kit was rebuilt). No
  test changed.
- **Rung 2:** Build Prefabs: 510 objects, 124 bound (71 clickable, 0 grabbable, so no click events added), relay
  graph 52 distinct members (was 49: `pkHead` and the per-target launches), all on the allow list. `PortKit/Kit/Check`
  PASS (graphs, 124 bindings, hash `126bf586`, both bundles); `HiddenRole/Check Walkable` PASS, the same three lines
  as before (70,654 of 70,654 clear points free; 0 reachable points blocked; all connected reached). Bundles Android
  **1,116 KiB** (1,142,374 bytes; was 1,112 KiB, 1,138,777), Windows **1,155 KiB** (1,183,015 bytes; was 1,154 KiB,
  1,182,177): graph blobs 308 to 340 KiB. Script `pk-hidden-role.js` 500,361 bytes (was 487,538).
- **Rung 3** (`playtest/single.json`), twice in a row (`playtest.sh --keep-play`): **58 passed, 0 failed** and
  **51 passed, 0 failed**, 0 console errors each (`playtest/evidence_single.txt` and the pictures are run 2). Run 1
  played four matches (the person was downed twice and sent to the bunkroom, 70 m down); both runs did a job by
  clicks (jobs 7 and 10, timing), the alarm and muster, the vote, and the jobs total kept until a death is seen.
- **Rung 4** (`playtest/multi.json`), twice in a row: **35 passed, 0 failed** each, 0 console errors
  (`playtest/evidence_multi.txt` is run 2). Digests equal after the first match (`ca162f79`) and after B's reload
  (`c823d302`); B's reloaded page sent to the bunkroom and Leave refused while the match runs.
- **Artifacts:** Take Photos (`'Station' only, 286 renderers, size 123.50 x 3.45 x 112.85`) and Export Artifacts ->
  `dist/` (not checked in): `android/hidden-role` 1,142,374 bytes, `windows/hidden-role` 1,183,015, `pk-hidden-role.js`
  500,361, `hidden-role.jpg`, `hidden-role.snippet.html`, `licenses/hidden-role/` (new: `MIT-hidden-role.txt`,
  `MIT-portkit.txt`, `LiberationSans - OFL.txt`), `manifest.json` with **footprint 123.5 x 3.45 x 112.85 m
  ('Station')** (was 123.5 x 73.4 x 112.85 m: the bunkroom 70 m down no longer counts; it lies under the station's
  plan, so the station's area is still the whole footprint on the ground).

---

## Fix pass, 2026-11-25 (portkit 812f285, the review's findings)

Everything in this section ran on 2026-11-25 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor
(project `altspace/`, Play-mode page port 44000), after re-syncing `ts/portkit/` and
`Packages/com.altspacegames.portkit/` to portkit `812f285` and fixing the findings of `REVIEW-FINDINGS.md`
("hidden-role"). Nothing ran in the Altspace app, on a Quest, or with controllers (rung 5: not run).

- **Rung 0/1:** `npm test`: typecheck and lint clean; **48 tests, 48 pass** (was 42: the old "position jump not trusted
  for 1.5 s" scenario is replaced, `test/fixpass.test.ts` adds 7, each failing before its fix; see PORT.md section 7).
- **Rung 2:** `PortKit/Kit/Check` PASS (graphs, 124 bindings, both bundles); `HiddenRole/Check Walkable` PASS, the
  same three lines as below (70,654 of 70,654 clear points free; 0 reachable points blocked; all connected reached).
  Bundles Android **1,112 KiB** (was 1,100), Windows **1,154 KiB** (was 1,141): the relay graph grew with portkit's
  ops (285 to 308 KiB of graph blobs) and the bundles now carry `MIT-hidden-role.txt`, `MIT-portkit.txt` and
  `LiberationSans - OFL.txt`. Script `pk-hidden-role.js` 487,538 bytes (was 454,234; portkit's runtime grew and the
  banner now holds both MIT notices in full).
- **Rung 3** (`playtest/single.json`): three runs. Run 1: 49 passed, 1 failed: the new "put back, the referee's
  position comes back" check failed because the saboteur bot downed the person during it (a downed person's position
  stays where it fell); the check now stands down when that happens. Runs 2 and 3, in a row: **28 passed, 0 failed**
  and **35 passed, 0 failed**, 0 console errors (`playtest/evidence_single.txt` is run 3). New checks of this pass:

```
PASS a jump the page did not make is not taken by the referee (its own position follows at most at a run): page at 0.00,-3.00, referee's position 36.09,31.15, 8.5 m from the start after 1.0 s
PASS put back where it was, the referee's position comes back to the person: 29.43,36.33
PASS an eliminated player is sent to the bunkroom, 70 m down: -3.00 -69.95 4.50
PASS a downed bot's jobs stay in the hub board's total until the death is seen: Jobs done: 4 / 35, highest total 35
PASS the muster board says why and who: Main Editor sounded the alarm over Bot 2. / Vote: 27s left
PASS during a fault the job list gives no directions (upstream hid its pointer): You are a TECHNICIAN / Shift clock: 879s / FAULT: Blackout - reset it at its panel / Jobs (5 left): / Seat the flood dampers (Tap) - Ballast Control 38 m / Read the reserve bottles (Hold) - Scrubber Room 56 m
```

  (The last line is from run 1: a fault ran while the person was alive only there; in runs 2 and 3 none did, and the
  page says so.) Pictures: `playtest/evidence_single_*.jpg` (the muster board with the new wording and the Pass
  button).
- **Rung 4** (`playtest/multi.json`): five runs. Run 1: 31 passed, 4 failed: A started the first match before its page listed B in the lobby, so B was not dealt in (the test now waits for that). Run 2: 35 passed, 0 failed. Run 3: the main editor's page never started its script (no check ran on it; 5 passed, 5 failed, TIMEOUT: the test harness, not the game). Runs 4 and 5, in a row: **35 passed, 0 failed** each, 0 console errors (`playtest/evidence_multi.txt` is run 5). New checks of this pass, on B's reloaded page while the second match runs:

```
[main] PASS the late joiner's panel and the bunkroom board say so: Observing this match. / You are out of the match: watch from here. / Leave opens when the match ends.
[main] PASS Leave is refused while the match runs: moves [], Unity feet -3.00 -69.95 4.50
[main] PASS an onlooker who reaches the boarding pad is sent back to the bunkroom at once: -3.00 -69.95 4.50 moves [{"why":"lounge","x":-3,"y":-1.5}]
[main] PASS and in the lobby the reloaded page's digest is A's: f2173741 / f2173741
[vp-...] PASS both pages hold the same state after the match (digest, in the lobby): cce284ff / cce284ff
```
- **Artifacts:** `PortKit/Kit/Export Artifacts` -> `dist/` (not checked in): `android/hidden-role` (1,138,777 bytes),
  `windows/hidden-role` (1,182,177 bytes), `pk-hidden-role.js` (487,538 bytes), `hidden-role.jpg` (the station only,
  `PhotoRoot`), `hidden-role.snippet.html`, `manifest.json` (footprint 123.5 x 73.4 x 112.85 m: the bunkroom 70 m
  down is still inside the footprint, which `PhotoRoot` does not change).

What changed in the tests themselves: the drivers of the Node tests run at 4.2 m/s (was 6 m/s, faster than the
referee now follows); the Play-mode test uses portkit's `walk`, `where`, `place` and pointer (its own copies and the
mouse nudge are gone); A waits until its page lists B in the lobby before starting the first two-player match (a
race seen once in this pass).

---

## First pass, 2026-11-24 (portkit 1118ef0)

Everything below ran on 2026-11-24 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor (project
`altspace/`, Play-mode page port 44000). Nothing ran in the Altspace app, on a Quest, or with controllers (rung 5:
not run; worlds stay Private). Its evidence files were replaced by this pass's; the names it shows ("Observer lounge",
"ALARM: X found Y down", "Abstain") are the old ones.

The runtime in `ts/portkit/` then mirrored portkit commit `1118ef0`. The game already declared `Match.networkCallable = ["CmdStart", "CmdAbort"]` (its
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
player (portkit's InputSim mouse); walking through this project's `walk` command (portkit's own since 812f285), because Play mode's desktop player
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
