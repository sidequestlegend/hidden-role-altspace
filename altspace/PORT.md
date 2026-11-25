# PORT.md: hidden-role station game (working slug `hidden-role`)

An original hidden-role game for Altspace snippets: technicians keep an undersea research station running through a
shift while one hidden saboteur works against them. Its **rules** are translated from MIT-licensed C# (upstream
repository and authors: see `README.md` of this repository, "Credits"); its name, theme, map names, job names, words
and look are this port's own. Nothing from the commercial game the upstream imitates is used: not its name, role names,
terms, task or sabotage names, room names, map layout, look or sounds.

Written 2026-11-24; fix pass 2026-11-25 (portkit 812f285, the independent review's findings: see sections 3, 5
"Trust", 8 Q3 and `TESTS.md`); re-synced to portkit c971100 the same day (rungs 0 to 4 again). Upstream commit `4c8d3e1`. Nothing upstream was opened in Unity; the TypeScript rules run and are
tested in Node on portkit's fake room (rung 1). The Unity kit was built the same day (section 11): the station is
generated from the map data, nothing upstream is imported, and rungs 2 to 4 pass in the editor (`TESTS.md`).

Contents: 1 Status, 2 Names and terms, 3 Decisions and deliberate differences, 4 Feature checklist, 5 How it works,
6 Map data, 7 Tests, 8 Gaps and open questions, 9 Files, 10 Licences, 11 The kit (Unity).

---

## 1. Status

| Item | State |
|---|---|
| Rules in TypeScript (`ts/src/`) | Done: match flow, roles, jobs, waves, eliminations, alarms, musters, votes, faults, resets, hatches, shift clock, win checks, bots |
| Map data | Done: `ts/src/station-map.json`, generated from the upstream map's geometry by `ts/tools/convert-map.ts`, every name replaced |
| Hidden information | Done: roles and jobs by sealed delivery; input as fixed-rate sealed beats; tested on contents, sizes and timing |
| Referee | Done: `"declared"` candidates (lobby players only); any referee change voids a running match |
| Bots | Done: upstream's bots translated, an option (`bots` setting) |
| Tests | `npm test`: typecheck, lint, **48 tests, 48 pass**: 9 golden-vector suites against the upstream C# (dotnet 8), 12 rules tests, 15 fake-room scenarios, 3 secrecy tests, 2 kit tests (console clicks per job kind, the bars, the post, a body marker, Leave, the boarding pad, the drawn regions), 7 tests of the review's findings (`fixpass.test.ts`) |
| Build | `npm run build`: `Assets/WebRoot/pk-hidden-role.js`, 500,361 bytes on portkit c971100 (the game's and portkit's MIT notices in its banner) |
| `bindings.json` | Written by the kit builder (124 objects, 62 refs, 51 behaviours, 24 events) |
| Unity kit (section 11) | Built: `Assets/Kit/hidden-role.prefab` by `Assets/Kit/Editor/HiddenRoleKitBuilder.cs`; bundles Android 1,116 KiB, Windows 1,155 KiB (portkit c971100), both PASS the app's kit check; licence texts in the bundles and in `dist/licenses/hidden-role/`; footprint the station's (123.5 x 3.45 x 112.85 m) |
| Rungs (`TESTS.md`) | Again after the fix pass (portkit 812f285, 2026-11-25): 0 and 1 pass; 2 passes (and the collider check against the rules' walkable test); 3 passes twice in a row (one person and five bots, 28 of 28 and 35 of 35, with new checks for the referee's positions, the jobs total and the wording); 4 passes twice in a row (two players and three bots, 35 of 35 each, with the bunkroom's Leave refused and the boarding pad sent back); `dist/` exported. Again on portkit c971100: 0 to 2 pass, 3 twice in a row (58 of 58, 51 of 51), 4 twice in a row (35 of 35 each) |
| Checklist (section 4, 82 items) | **60 Done, 21 Changed (deliberately), 0 Partial, 1 Left out** |

## 2. Names and terms

### Proposed titles

"Saboteur" is the title of an existing card game, so the game needs its own. Three proposals, **none checked for
conflicts** (no web search was made from this job; a person should check them, and the slug, before anything is
registered, since a snippet slug can never be changed):

| Title | Slug | Note |
|---|---|---|
| **Hollow Reef** | `hollow-reef` | The station's name in this port; the boards already say "HOLLOW REEF". |
| **Pressure Shift** | `pressure-shift` | Says both the setting (deep water) and the clock (a shift to survive). |
| **Silt Line** | `silt-line` | Short; the line of murky water the saboteur hides behind. |

Considered and dropped: "Undertow" (the title of an existing video game).

### Terms used everywhere in the port (code, data, boards)

| Port term | Meaning (generic mechanic) |
|---|---|
| **Technician** | the crew role; together, "the technicians" |
| **Saboteur** | the hidden role; together, "the saboteurs" |
| **Observer** | someone in the world who is not in the match (late arrival, bystander) |
| **Shift** | a match; the **shift clock** is the deadline (180 s); "SHIFT OVER" is the deadline cut-in |
| **Job** | a task; kinds **hold** (hold Use 1.35 s), **tap** (4 presses), **timing** (release inside 70-82% of a 2.2 s sweep) |
| **Cover jobs** | the saboteur's own jobs, which count for nothing |
| **Job wave** | a new job handed to each living technician at 30 s and 75 s |
| **Console** | a job station |
| **Eliminate** / **down** | the hidden role's kill / a player who was eliminated |
| **Raise the alarm** | report a downed player |
| **Muster** / **muster post** | a meeting / the button that calls one |
| **Ballot**, **Pass**, **locked out** | vote, skip (the board's "Pass" button), ejected |
| **Fault** / **fault panel** / **reset** | sabotage / its console / its repair |
| **Ballast breach** | the countdown fault (the station floods: saboteurs win) |
| **Blackout** | the vision fault (living technicians' view closes in) |
| **Sonar jam** | the fault that blocks jobs |
| **Scrubber fault** | the fourth fault, given a countdown in the port (D2) |
| **Service hatch** | a vent: the saboteur's shortcut to the next hatch of its group |
| **Bunkroom** (the off-shift bunkroom) | where the downed and observers wait while a match runs, out of sight and beyond earshot (50 m) of the station; the code calls it the lounge |
| **Referee** | the client that runs the rules (upstream: the host) |

## 3. Decisions and deliberate differences

### Decisions (coordinator)

- Keep the rule numbers: one hidden role at 4 to 10 players, every cooldown, range, timer, vote and tie rule, win
  condition and the 180 s shift clock. Fix the plain upstream bugs (D1, D2, D3, D4, D6) and list each.
- The host is not forced into the hidden role (D5).
- Referee only among players who joined the lobby (`"declared"`); a referee change mid-match voids the match (D9).
- Roles by sealed delivery, with fixed-rate beats so that write timing reveals nothing (D16).
- The downed go to a bunkroom out of earshot; musters gather the living (D3, D13).
- Bots stay as an option, translated from upstream (D10).
- Fresh repository, no upstream assets; original name, theme and terms.

### Deliberate differences from upstream

| Id | Upstream | Port | Where |
|---|---|---|---|
| D1 | A downed crew member's unfinished tasks stay in the total, so one early elimination makes the task win impossible (F29, F30) | A downed technician counts only the jobs they finished; their unfinished ones leave the total the win check uses. The total everyone is shown (boards, bars) keeps them, and the wave jobs the technician would have been given, until the death is seen (D4), so the bar gives no kill away | `MatchRules.GetCrewTaskProgress` (win check), `GetPublicTaskProgress` (published); golden test "D1" proves it is the only change in the win table; fixpass 1, 3 |
| D2 | The fourth sabotage has no effect at all (F60) | The scrubber fault counts down like the breach (`scrubber-seconds`, default 45; 0 restores upstream) | `FaultCountdown`; rules and scenario tests |
| D3 | A meeting moves nobody (F46, F53), which with proximity voice is a silent vote | The living are teleported to a ring at the muster post, held still, and sent back where they stood (`return-after-muster`) | `RuntimeHud.Effects`; scenario "report and muster" |
| D4 | The roster shows every death the moment it happens (F74) | A downed player shows as down only once their body is reported or a muster begins (they are then missing from the ring); the jobs total on the boards follows the same rule (D1). The alive flags are public state: an interface rule, not a secret (section 5, "Trust") | `seenDown`, `RosterLine`, `GetPublicTaskProgress`; scenarios; fixpass 1, 3 |
| D5 | The host is the hidden role by default (F7) | Fair deal; forcing exists only as a test aid (`Match.forcedSaboteurs`, not a setting) | rules test "start" |
| D6 | The round flag stays set after the end, so the emergency button can restart a finished round (3.5 quirk) | Musters and alarms need a match in play | rules test "muster post" |
| D7 | At the end everyone is frozen until the host restarts (F72) | The result shows for 4.5 s, then everyone is back in the lobby, at the hub, with the roster kept and the last result on the board | scenario "shift clock" |
| D8 | Each client's countdowns use its own `Time.time` (off by the start-up difference) | One synced clock for everyone | `Match.Rel` |
| D9 | The host owns the session; it ends when the host leaves (F10) | A referee elected among lobby players only; start by any lobby player (or the world's owner, `start-by="admin"`); stop by the starter or the owner; a referee change voids the match | scenarios "bystander", "change of referee", "stop" |
| D10 | The host keeps min(5, 10 - humans) bots in the lobby (F79) | `bots` setting, 0 by default, bots added at the start up to the free slots; drawn as markers | scenario "one person and five bots" |
| D11 | One hidden role, fixed | `saboteurs` setting 1 to 3, always fewer than half the roster | rules test "dealing" |
| D12 | Ranges against positions the host moved (Player.cs:576-581) | A page cannot read another player's position, so each page reports its own in the sealed beat, and the referee keeps its **own** position for each player: it moves to the reported point only when a body could have got there, along a straight line of open floor (the rules' walkable test, `HasClearWalkableSegment`) within a travel allowance that fills at a run (4.6 m/s: the app's 3.25 m/s walk times 1.4) up to one VR teleport hop (8.5 m; the app's default Teleport Range is 8 m). Otherwise it goes toward the point along open floor as far as the allowance reaches, and no farther: a claimed jump is never taken, and the position is never inside a wall or prop. Jumps the game makes (start, muster ring, return, hatch) are taken at once. `range-slack` 0.5 m is added to people's ranges. What a modified page can still do: section 5, "Trust" | `Match.ApplyPosition`; fixpass 2; scenario "hatches"; rung 3 "a jump the page did not make" |
| D13 | The dead watch from their body, silent and invisible to others | No voice isolation or avatar hiding exists, so while a match runs nobody but its living players may be within earshot of the station: the downed and observers are sent to the bunkroom 70 m below (each person's voice carries at most 50 m), "Leave" and the boarding pad's "Enter" are refused until the match ends, and anyone not alive in the match who is within 50 m of the station's floor (in three dimensions: the boarding pad, the roof, the water round it) is sent back on the next tick | `RuntimeHud.InEarshot`, `Effects`, `Leave`, `Board`; fixpass 1; scenarios; rung 4 |
| D14 | Lights shrink the crew camera | Blackout puts a local vision shell round living technicians' heads (4.8 m) | scenario "faults" |
| D15 | Bots steer greedily over the map's waypoints at radius 0.5, every frame | The map's waypoints do not form a connected graph (props cut four rooms off) and the greedy pick strands bots on a waypoint (found by the tests), so bots and test walkers steer on a shortest route over a 1 u grid of open floor (`ShipMap.NextStep`), move straight when the line is clear (`MoveToward`), at radius 0.3, re-steer every 0.25 s, step onto the nearest open point after 10 stuck steps; per-frame chances are per 50 ms tick. `GetNavigationTarget` itself is kept and matches upstream (G5) | `Bots.ts`, `ShipMap.ts` |
| D16 | Input every 64 Hz tick; everything replicated to everyone in plain properties | Input as a sealed beat every 0.25 s from every rostered player, with timestamped edges applied at the time they happened; roles, job masks and cooldowns sealed per player and rewritten together every 0.25 s; ballots in the beats | section 5; secrecy tests |
| D17 | The host moves the venting player | The player's own client makes the hatch trip; the referee accepts it only from a living saboteur at a hatch | scenario "hatches" |
| D18 | A player who disconnects is gone | A rostered player keeps the seat for 5 s, so a page reload keeps role, jobs and cooldowns | scenario "a reload" |
| D19 | Timers checked every frame; input and bots on the host's one tick | The referee runs the rules 0.5 s behind the synced clock (`INPUT_DELAY`), so every player's input, which reaches it up to a beat and a room batch late, goes in at the time it happened, in order with the bots' ticks (every 50 ms of rules time) and the timers (checked before each input edge and each bot tick). The rules clock never goes back; input later than the delay goes in at the clock's time. Results show up to 0.5 s later than they would on arrival | `Match.Advance`; fixpass 7; scenario "shift clock" | scenario "shift clock" |

## 4. Feature checklist

Status: **Done** (as upstream), **Changed** (deliberately, see the D or C id), **Partial** (rules done; the display
needs the kit), **Left out**. Evidence names a test in `ts/test/` (G = golden vectors, R = rules, S = scenario,
X = secrecy).

| # | Upstream behaviour (short) | Status | Evidence / note |
|---|---|---|---|
| F1 | Named rooms: host, join or auto | Left out | The world instance is the room (X5) |
| F2 | At most 10 players | Done | `max-players` 2-10; R settings |
| F3 | Player objects, numbers, colours, lobby spawn points | Changed | Roster slots by join order; platform names; hub spawn points used when returning (D9) |
| F4 | Everyone walks the map in the lobby | Done | No lock in the lobby; the station is walkable in the lobby (boarding pad outside, Leave on the hub board) |
| F5 | Only the host may start; 4 participants incl. bots | Changed | Any lobby player starts; 4 incl. bots (D9, D10); S all |
| F6 | Host restarts any time | Changed | Starter or owner stops; automatic return after the result (D7, D9); S stop |
| F7 | Host is the hidden role by default | Changed | D5; R start |
| F8 | Late joiner spectates | Done | Observer, bunkroom, no beats; S late joiner; fixpass 1 |
| F9 | Leaving runs the win check | Done | After a 5 s grace (D18); R leaving, S reload |
| F10 | Host leaving ends the session | Changed | Referee change voids the match (D9); S referee change |
| F11 | Shuffle; one hidden role at 4-10 | Done | G10; setting D11 |
| F12 | 5 distinct of 22 stations each | Done | G10 |
| F13 | Random separated start points | Done | R start |
| F14 | Start state; elimination ready at once | Done | R start, G cooldown |
| F15 | Timers: fault 4 s, muster 0, wave 30, clock 180 | Done | R faults, muster, waves, clock |
| F16 | Own role only; fellow hidden roles; all at the end | Done | Sealed entries (D16); X contents; S vote |
| F17 | 4.5 u/s movement | Changed | Platform movement (C3) |
| F18 | Walkable test, sliding moves | Done | G1, G3 (rules, bots); people move against kit colliders (C3) |
| F19 | Nobody moves in a meeting, dead, cut-in, end | Changed | Movement lock in musters, cut-in and result; the downed move freely in the bunkroom and are kept out of earshot (D13); S vote, clock |
| F20 | Location named | Done | Panel "In: <room>" |
| F21 | Follow camera | Changed | First person (C2) |
| F22 | Who may work jobs | Done | G11, R |
| F23 | Nearest assigned job within 1.1 | Done | G11; + slack for people (D12) |
| F24 | Hold 1.35 s | Done | G11 |
| F25 | Tap 4 times | Done | G11 |
| F26 | Timing band 70-82% of 2.2 s | Done | G11 |
| F27 | Progress dropped on leaving range, meeting, death, repair | Done | Same code (G11); R |
| F28 | Once per player; shared consoles | Done | Same code |
| F29 | Crew progress counts the dead | Changed | D1 |
| F30 | The dead cannot work: job win blocked | Changed | D1; G "D1", R waves |
| F31 | Waves at 30 and +45, to living crew; wait out meetings | Done | R waves; S clock (waves at 30.0, 75.0) |
| F32 | New-job alert for 6 s with a tone | Done | `RuntimeHud.OnSecret` (local only); not covered by a test |
| F33 | Comms sabotage blocks jobs | Done | Sonar jam; S faults |
| F34 | Hidden role's fake tasks | Done | Cover jobs, never counted |
| F35 | Job list nearest first, 7 rows; pointer hidden in a fault | Done | List with compass and distance on the personal panel (a compass word, not a 3D arrow); during a fault the compass words and the nearest console's amber are hidden, as upstream hid its pointer (S faults, rung 3 when a fault runs); each console has its job's name and kind over it |
| F36 | Own stations marked; gold in range; hidden role's purple | Done | The console screens take the colours (relay op `color`, read back in Unity by the Play-mode test) |
| F37 | Progress bar while working | Done | The personal panel's work bar (hold time, taps, the timing sweep with its band, a reset's hold); the jobs-done bar on the hub board and the panel; rung 3 |
| F38 | Elimination: living hidden role, 10 s cooldown, ready at start | Done | G cooldown; R elimination |
| F39 | Nearest living crew within 1.45, clear line | Done | R elimination (range edge, wall) |
| F40 | Victim down where they stand; flash | Changed | Body marker stays; victim to the bunkroom; no flash (D13) |
| F41 | No elimination in a meeting or after the clock | Done | R elimination, clock |
| F42 | Report nearest body within 1.7, clear line | Done | S report |
| F43 | Reported body not reportable; bodies stay | Done | S report |
| F44 | Emergency: in range, no fault, 25 s cooldown, usable at once | Done | R muster post |
| F45 | A meeting clears the fault and all progress | Done | R faults |
| F46 | 30 s meeting; nobody moved | Changed | Ring at the post (D3); S vote |
| F47 | Why it was called, who, time left | Done | Muster board; S vote, report |
| F48 | Voters, one ballot, targets, invalid = skip | Done | G9; R muster timeout |
| F49 | Who has voted is visible; the choice is not | Done | `vo` public, ballots sealed (D16) |
| F50 | Resolve when all voted or at 30 s | Done | S vote (early), R muster timeout |
| F51 | Tally: single highest wins; ties and skip remove nobody | Done | G9 (every ballot set of 5 voters) |
| F52 | Removed: no body; name and role told | Done | S vote |
| F53 | Win check, then play resumes where they stood | Changed | Sent back from the ring (D3); S report |
| F54 | The clock runs through meetings | Done | R clock |
| F55 | Fault: range 1.2, one at a time, 18 s, not in a meeting | Done | R faults; S faults |
| F56 | Four panels | Changed | Renamed (C1) |
| F57 | Countdown fault: 45 s, then the hidden role wins | Done | Ballast breach; S faults (45.0-45.35 s) |
| F58 | Lights shrink living crew's view | Changed | Vision shell (D14); S faults |
| F59 | Comms: see F33 | Done | Sonar jam |
| F60 | Fourth fault does nothing | Changed | D2; S, R |
| F61 | Any fault blocks the button, is shown with its countdown | Done | R muster post; boards |
| F62 | Repair: crew, 1.2, hold 2 s; repair before job | Done | R faults; S faults |
| F63 | Vent to the next of the group | Changed | Client-made trip, referee-checked (D17); S hatches |
| F64 | 9 vents, 3 groups | Done | G14 |
| F65 | No win under 2 participants | Done | R leaving |
| F66 | Crew win: no hidden role alive | Done | G12; S vote |
| F67 | Hidden role wins at parity | Done | G12; S eliminations |
| F68 | Crew win: all tasks and both waves | Done | G12; S jobs |
| F69 | Clock: cut-in at 180, win at 184 | Done | S clock (D19 timing) |
| F70 | Check order | Done | G12 |
| F71 | When the checks run | Done | Same calls as upstream |
| F72 | End: result 4.5 s, roles shown, frozen | Changed | D7 |
| F73 | Clock warning in the last 30 s | Done | Boards ("!!") |
| F74 | Roster shows deaths live | Changed | D4; S eliminations, report |
| F75 | Role hints (cooldown, panel, vent) | Done | Personal panel |
| F76 | Button readiness; fault cooldown | Done | Personal panel |
| F77 | The dead are told and keep the boards | Done | Panel "You are out", bunkroom board; S eliminations |
| F78 | "Player n" names and suit colours | Changed | Platform names, no colours (X7) |
| F79 | Lobby bots | Changed | D10 |
| F80 | Crew bot routine | Done | Translated (`Bots.ts`), steering D15; S jobs, clock, bots |
| F81 | Hidden-role bot routine | Done | Translated; S bots |
| F82 | Bot voting | Done | Translated; S bots |

Counts: Done 60, Changed 21, Partial 0, Left out 1 (82).

## 5. How it works

### Files (`ts/src/`)

| File | Upstream | What |
|---|---|---|
| `GameTypes.ts` | `GameTypes.cs` | Enums (upstream numbers, port names), settings with defaults and ranges |
| `ShipMapData.ts` | `ShipMapData.cs` | `Rect` and the walkable test in float32 (`Math.fround` at the upstream's points) |
| `ShipMap.ts` | `ShipMap.cs` (rules half) | Walkable test (with a broad-phase grid proved equal to the plain loop), moves, line of reach, random points, steering, room names; plus `NextStep`/`MoveToward` (D15) |
| `Player.ts` | `Player.cs` (rules half) | `Participant`: one player's state and rules |
| `BasicSpawner.ts` | `BasicSpawner.cs` (rules) | `MatchRules`: the host's rules, no networking; `time` is set by the caller (synced time of the input) |
| `Bots.ts` | bot code of `BasicSpawner.cs` | `BotBrains` |
| `Match.ts` | the host side of `BasicSpawner.cs` | Behaviour: the referee runs `MatchRules`, applies beats on a fixed step, publishes `m` |
| `Dealer.ts` | (new; C5) | Behaviour: sealed per-slot secrets, rewritten every step |
| `PlayerLink.ts` | (Fusion input) | Per-player behaviour: lobby flag `j` and the sealed beat `b` |
| `Beat.ts` | (Fusion input struct) | Fixed-length beat and secret encodings |
| `RuntimeHud.ts` | `RuntimeHud.cs` + input | Local player: keys, buttons, panel clicks, teleports and locks, boards, markers |
| `station-map.json` | `astra..._blockout_01.json` | Renamed map data (section 6) |

### State on the room (instance prefix `pk1.hidden-role.<inst>.`)

| Leaf | Writer | Content | When |
|---|---|---|---|
| `v.match` | referee | `m`: state, match number, dealer (sid, uid), start time, roster (uid, name, bot), per slot alive / body / reportable / voted / seen down / left, start and bot positions, clock, cut-in, waves, muster (end, caller, body, ring), next muster, fault and its end, announcement, winner, jobs done/total, roles (end only), last result, notice | on the referee's step, only when it changed |
| `v.dealer` | referee | `{r, s: [sealed entry per slot]}`; each entry `{n, r, f, a, c, l, k, s}` padded to 160 characters before sealing (role, fellow saboteurs, assigned and completed masks, last wave job, next elimination, next fault) | every step (0.25 s) for the whole match |
| user `p0` | each player | `PlayerLink`: `j` (joined at), `b` (sealed beat: match, sequence, time, position, held buttons, up to 8 edges of the last second with times and an argument, padded to 360 characters) | every 0.25 s for every rostered person for the whole match |
| user `k`, `ref`, `o.*` | runtime | announcement, keys, referee record, ownership | portkit |

Budget: 4 space leaves per copy (`v.match`, `v.dealer`, their owner records), largest 6.2 KB at ten players (the sealed leaf, measured) (limit
16,384); referee writes about 8 a second (bucket 20); one user leaf per player at 4 a second.

### Why it does not leak roles

- No public value names a role until the end, except the locked-out player's (as upstream). Tested on every value the
  room carried (X "contents").
- Each sealed entry opens only for its player, and is accepted only from the referee that dealt the match
  (`openWithSender`); beats open only for the referee and count only if sealed by the leaf's own player (X).
- Every beat and every sealed entry has one ciphertext length; every rostered player beats every 250 ms, alive or
  down, acting or not; the sealed leaf is rewritten on every 250 ms step; public writes happen only on the step
  (X "sizes and timing", measured at the moment each page sends).
- The same match with the hidden role dealt to another player produces the identical write schedule: same writers,
  paths, times and sizes, and the same public record apart from the random start positions (X "same schedule").
- Bots act at 20 Hz in the referee's memory but are published only on the step, so a bot's action is not told apart
  from a person's by timing.
- Beats go only to the referee that dealt the match: a new referee (who voids it) is never sent anyone's input.

Same trust as upstream: the referee's own page knows every role (upstream: the host). The portkit README states that
with no server a modified candidate can take the referee seat; that voids the match (D9) and gives it no role of the
voided match; it would know the roles of a match it deals itself, as an upstream host does.

### Trust: what a modified page can still do (compared with upstream)

Upstream's host ran everything and moved every player from their input (Player.cs:576-581); a modified client could
only send input. Here there is no server, so some of that cannot be closed. What is closed, and what is left:

| A modified page can still... | Upstream | Closed in the port |
|---|---|---|
| Report a position its avatar is not at, moving it no faster than a run (4.6 m/s) along open floor, with one hop of up to 8.5 m at once; so it can eliminate, raise the alarm, work, fault, reset and use hatches from where a running body could have got to, and be "elsewhere" when the saboteur strikes | No: the host simulated positions | A claimed jump across the station is never taken; the referee's position is never inside a wall or prop, never faster than a run, never through a wall (D12, fixpass 2) |
| Read every public value, including the alive flags the boards hold back until a death is seen (D4) | Same: alive flags were replicated to every client | Roles, jobs and cooldowns are sealed per player (section 5) |
| Skip its own keep-out and walk (or stay) within earshot of the living after being downed; there is no voice isolation | Upstream had no voice | An unmodified page keeps the downed and observers 50 m and more away on every tick; Leave and Enter are refused during a match (D13, fixpass 1) |
| Date its input up to 0.5 s back (`INPUT_DELAY`): a press it claims came just before a muster or the end of a fault still counts | The host applied input on its own tick | Nothing older than the rules clock goes in before it (D19, fixpass 7) |
| As referee: know every role, pick the deal, run the rules as it likes | Same for the host (and upstream made the host the hidden role by default, D5) | A referee change voids a running match (D9); the deal-forcing test hook exists only on a test page (`window.__pk1_debug`), never on a published one (fixpass 4) |
| Take the referee seat as a lobby candidate | The host owned the session | Voids the running match; it gets no role of it (D9) |

### Referee and lobby

Join on the hub board sets `j` and offers the player as referee candidate (`Networking.SetRefereeCandidate`). The
first-joined candidates rank for the seat; bystanders are never candidates. Start: a lobby player (or the owner) sends
the command `CmdStart` (`networkCallable`); the referee takes the first `max-players` by join time plus bots and
deals. If the referee seat changes while a match runs, the new referee writes the lobby with notice `void-referee`;
every page unlocks and returns to the hub.

### Input path

Keys E (use), Q (eliminate), R (alarm), F (fault), V (hatch); VR right A (use), right B (alarm), left X (eliminate),
left Y (hatch at a hatch, else fault); the personal panel's five buttons (Use latches); the muster board's ten name
buttons and Pass. Each press or release is an edge with the synced time; the referee merges every player's edges
in time order, advances each player's job channel by the time between edges (so hold, tap and timing behave exactly
as upstream's per-tick code: G11), and runs the timers at each edge's time.

## 6. Map data (renamed)

Generated by `ts/tools/convert-map.ts` from the upstream runtime map: rectangles, points, kinds, panel order and hatch
groups kept; every id and name dropped and replaced by index from the tool's own tables. Theme: Hollow Reef, an
undersea research habitat. Units: 1 u = 1 m (PORT analysis 5.7). Play bounds 150 x 116 from (-75, -58); 108 corridor
rectangles; 69 room-shape cut-outs; 26 props; 48 waypoints; 15 hub spawn points; muster post at (0, 0).

| # | id | Name | x range | y range |
|---|---|---|---|---|
| 0 | `commons` | Commons (hub, muster post) | -16..16 | -12..12 |
| 1 | `moon-pool` | Moon Pool | -59..-37 | 3.5..20.5 |
| 2 | `wet-lab` | Wet Lab | -50..-26 | 28..46 |
| 3 | `lantern-dome` | Lantern Dome | -10..10 | 40..54 |
| 4 | `sonar` | Sonar Room | 26..44 | 28..42 |
| 5 | `tether-room` | Tether Room | 41..59 | 4.5..19.5 |
| 6 | `pump-hall` | Pump Hall | 36..62 | -26..-8 |
| 7 | `ballast` | Ballast Control | 24..50 | -54..-32 |
| 8 | `battery` | Battery Bay | -2..16 | -51.5..-36.5 |
| 9 | `kelp-store` | Kelp Store | -34..-4 | -40..-18 |
| 10 | `scrubbers` | Scrubber Room | -61..-39 | -26..-10 |

| Id | Job | Room | Kind | x, y |
|---|---|---|---|---|
| 0 | Sign the shift ledger | Commons | hold | -10, 7 |
| 1 | Bleed the chamber gauge | Moon Pool | hold | -53.5, 7 |
| 2 | Set the recompression valve | Moon Pool | timing | -42, 17 |
| 3 | Trim tank pressure | Wet Lab | timing | -46, 32 |
| 4 | Log the specimen tray | Wet Lab | hold | -31, 40 |
| 5 | Focus the floodlights | Lantern Dome | timing | 0, 43 |
| 6 | Spool the hydrophone tape | Sonar Room | hold | 29, 36 |
| 7 | Trim hydrophone gain | Sonar Room | timing | 39.5, 29.5 |
| 8 | Charge the dive lamps | Tether Room | hold | 43.25, 8.25 |
| 9 | Tag the wetsuit racks | Tether Room | tap | 53.25, 15.25 |
| 10 | Balance the main pump | Pump Hall | timing | 39, -13 |
| 11 | Prime the bilge line | Pump Hall | tap | 50, -10 |
| 12 | Check the impeller housing | Pump Hall | hold | 59, -22 |
| 13 | Level the trim tanks | Ballast Control | timing | 28, -36 |
| 14 | Seat the flood dampers | Ballast Control | tap | 45, -50 |
| 15 | Reseat the cell clamps | Battery Bay | tap | 2, -38 |
| 16 | Cycle the bus ties | Battery Bay | tap | 8, -39 |
| 17 | Ping the cable run | Battery Bay | tap | 13, -45 |
| 18 | Weigh the harvest bins | Kelp Store | hold | -31, -22 |
| 19 | Strap loose crates | Kelp Store | tap | -8.75, -31.25 |
| 20 | Shake out the lime trays | Scrubber Room | tap | -57.75, -13.75 |
| 21 | Read the reserve bottles | Scrubber Room | hold | -43, -19 |

| Panel | Fault | Room | Countdown | x, y |
|---|---|---|---|---|
| 0 | Ballast breach | Ballast Control | 45 s | 30, -36 |
| 1 | Blackout | Battery Bay | no | 8, -38 |
| 2 | Sonar jam | Sonar Room | no | 35, 33 |
| 3 | Scrubber fault | Scrubber Room | 45 s (D2) | -47, -13 |

| Hatch | Group | Room | x, y |
|---|---|---|---|
| 0 | north | Moon Pool | -55.5, 7 |
| 1 | north | Wet Lab | -32, 40 |
| 2 | north | Sonar Room | 30, 31 |
| 3 | east | Tether Room | 55, 15.5 |
| 4 | east | Pump Hall | 40, -21 |
| 5 | east | Ballast Control | 45, -50 |
| 6 | south | Scrubber Room | -57, -22 |
| 7 | south | Kelp Store | -27, -22 |
| 8 | south | Battery Bay | 12, -40.5 |

Props (blocking furniture, in order): Pressure chamber, Gauge cabinet, Bunk pod, Specimen tank, Dissection bench,
Window console, Sonar desk, Server rack, Locker wall, Lamp bench, Main pump, Impeller casing, Tool wall, Ballast
column, Trim tanks, Flood barrier, West cell racks, East cell racks, Transformer, Bin stack A, Bin stack B, Bin stack C,
Low shelf, Scrubber canisters, Filter bank, Valve bank.

The geometry (a ring of ten rooms round a hub, four spokes, two service corridors) is the upstream author's own.
A person should still compare the final room list and the 22 job names with the commercial game before release (the
comparison here was made from memory).

Kit-builder notes kept from the analysis: hatch 5 and console 14 share a point (draw them apart); the Blackout panel
is 1 m from console 16; the muster post must be slim (range 1.15 m); scale 1 u = 1 m; floors on layer 2; closed
ceiling; bunkroom 70 m below the station.

## 7. Tests

`cd ts && npm test` (typecheck, lint, then the Node test runner): **48 tests, all pass**, about 8 s.

| File | Tests | What |
|---|---|---|
| `golden.test.ts` | 9 | Against the upstream C# rule methods compiled with dotnet 8 (`npm run golden`): G9 every ballot set of 5 voters (7,776); G12 win check over 56,160 combinations (roles, deaths, jobs, clock, waves, cut-in), equal to upstream with D1 switched back, and D1 shown to change only blocked job wins; G10 600 seeded deals (shuffle + 5 of 22 masks) and the role count at 4-10; elimination cooldown; G11 hold/tap/timing and the bots' versions at the edges (1.34/1.35 s, 3/4/5 taps, 69/70/82/83%); G1 walkable test over the whole map at two radii (140,266 points); G2 3,000 lines of reach; G3 40 sliding walks; G5 330 steering targets; G7 random start points; G14 hatch order |
| `rules.test.ts` | 12 | Settings; start state and fair deal (D5); elimination range, wall, cooldown, muster; muster post (D6); faults (4 s, 18 s, one at a time, reset 2 s, cleared by a muster); D2; waves (30, 75, delayed by a muster, living technicians only, no job win before both, D1); clock and cut-in; leaving; fixed-length beats and secrets; state budget; muster timeout and invalid ballots |
| `scenarios.test.ts` | 15 | Real clients (each its own page, head and keys) on the fake room, bots where stated: matches won by **jobs**, **eliminations**, **vote**, **shift clock**; **alarm and muster** (ring, locks, abstentions, return, body stays, cooldown); **faults and reset** (blackout shell, jam, breach win at 45 s); scrubber countdown; **hatches**; **bystander never referee**; **referee change voids**; **late joiner observes**; **two matches in one room**; reload keeps the seat; **one person and five bots**; stop by the starter (the old "position jump not trusted for 1.5 s" test is replaced by fixpass 2) |
| `secrecy.test.ts` | 3 | Contents of every write; sizes and send times of every beat and sealed entry; the same match with the hidden role dealt elsewhere has the identical schedule |
| `kit.test.ts` | 2 | With the kit builder's bindings: console clicks for every job kind, the work bar and the jobs bars; the muster post and a body marker clicked; Leave and the boarding pad in the lobby; the drawn regions |
| `fixpass.test.ts` | 7 | The review's findings, each failing before its fix: 1 the downed and observers kept out of earshot (Leave and Enter refused, the boarding pad, 30 m out, the roof, 45 m up, the Commons; 55 m out left alone; the jobs total unchanged at the kill); 2 a claimed jump is not taken, the referee's position runs at most 4.6 m/s on open floor and arrives, never inside a prop, a 7 m hop taken at once; 3 the published total with waves, then D1's once seen; 4 no hooks on a published page; 6 a leaver's body; 7 a person's elimination 0.1 s before a bot's muster counts, every event in time order; 8 both MIT notices in the script's banner, the font's copyright lines and every licence file in the kit |

Build: `npm run build` writes `../Assets/WebRoot/pk-hidden-role.js` (500,361 bytes, portkit c971100); its banner holds
the game's MIT notice in full (`ts/script-header.txt`), then portkit's.

Golden vectors: `npm run golden` runs `golden/extract.ts` (copies 31 rule members out of the upstream files, unchanged,
into `golden/gen/`, not checked in, since it is upstream code with upstream names) and the dotnet harness
(`golden/Harness.cs`, `golden/UnityStubs.cs`, the upstream `GameTypes.cs` and `ShipMapData.cs` compiled from the
upstream checkout). `vectors/upstream.json` is checked in, so the tests run without the upstream.

## 8. Gaps and open questions

### Runtime and fake-room gaps met in this job

| Gap | Workaround here | Status |
|---|---|---|
| The fake room's key table lacked V | Tests used the panel's Hatch button | Fixed in portkit `c876a0c`; workaround removed after the re-sync |
| No way to attach a kit object to the head (only to a hand) | The personal panel and the blackout shell follow the head by transform, sent only when the head moved 5 cm | portkit now has `AttachToHead` (812f285); not switched over in this pass (the panel's tilt and offset are set per move, which the attachment would fix in place); a candidate for the headset pass |
| Remote players' positions cannot be read by a page | Positions are self-reported in the sealed beat; the referee keeps its own, no faster than a run along open floor (D12) | Platform limit, stated (section 5, "Trust") |
| No voice isolation, muting or avatar hiding | Bunkroom 70 m below; nobody but the living within 50 m of the station while a match runs, checked every tick; Leave and Enter refused until it ends; ring at musters (D3, D13) | Platform limit, stated: a host world whose `VoiceDistanceMultiplier` is above 1.4 breaks it, and a modified page can skip its own keep-out (section 5, "Trust") |
| No referee hand-over of secrets | A referee change voids the match | By design |
| `Random` in the app comes from the page's generator | Deals use `this.Random` (only the referee sees its draws) | Could move to `this.Random.Bytes` (new); not needed for fairness against others |
| The app sends space state in batches every 0.2 s | Other pages see a change up to about 0.5 s after the referee's step | Measured in the fake room; tests wait for it |
| `this.Host.op`, `UnityRandom`, portkit's `golden/UnityStubs.cs` (new) | Not used: the port's own `golden/UnityStubs.cs` has a seeded generator both sides share, which is all the vectors need | None |

Portkit copy: `ts/portkit/` and `Packages/com.altspacegames.portkit/` mirror portkit commit `c971100` (re-synced 2026-11-25 after the fix pass, `sync.sh`; before that `812f285`). The game had no workaround of its own for anything c971100 fixes; the one change it asked for is `FootprintRoot => "Station"` (section 11).

### Still unverified (needs the app, a headset, or a person)

- Everything in the Altspace app and on a Quest (rung 5): frame time and draw calls on the device, the region
  switching's cost and pop-in, Unlit materials under the app's own pipeline settings, the size of the boards' text in
  a headset, real avatars' size against 1.1 m corridors, VR teleport against the roof and walls.
- VR controller mapping and the desktop keys (Q and E may clash with grapple when a world enables it); the panel
  buttons and the clickable consoles, post, markers and panels are the guaranteed path (clicks through Play mode's
  desktop pointer only).
- Walking: Play mode's desktop player is a fly camera with no body, so the test walks a body-sized capsule against the
  kit's colliders (section 11); a real avatar's collider in the app may differ in radius (0.25 m assumed).
- The page learns the player's position from pose updates and, since portkit 812f285, once at start
  (`localPosition()`, a throwaway head attachment): unverified in the app.
- Name tags may show through walls and the blackout shell (not determined; behind `SetSettings`).
- Title and slug: choose one of section 2 and check it before registering.
- The fix pass's numbers against the app (unverified): that no voice carries past 50 m with the default
  `VoiceDistanceMultiplier` (the keep-out's radius, D13); that beats reach the referee within `INPUT_DELAY` (0.5 s) in
  a real room (later ones are applied at the clock's time, D19); that a VR teleport hop of the default 8 m and a run
  of 4.55 m/s are what the app allows (the referee's allowance, D12), and that a head leaning over a desk in VR is
  followed well enough by the projection onto open floor.

### Open questions

| # | Question | Proposed handling |
|---|---|---|
| Q1 | Scale 1 u = 1 m makes a 150 x 116 m station | Walk it in a headset at 1.0 and 0.75; rules stay in u |
| Q2 | Should a player who leaves reveal their role? Their departure drops the job total if they were a technician (as upstream's bar did) | Keep upstream; stated |
| Q3 | Names and look (review, 2026-11-25): no name of the commercial game is used, but some echoes were found | **Done in the fix pass:** the job names "Re-route feeder B", "Send the surface packet" and "Purge the condensate trap" are now "Reseat the cell clamps", "Spool the hydrophone tape" and "Shake out the lime trays"; the rooms "Decompression Bay", "Viewing Gallery", "Dive Locker" and the "Observer lounge" are now Moon Pool, Lantern Dome, Tether Room and the off-shift bunkroom; the vote result reads "Vote result: X is locked out. / Role revealed: saboteur." (or "the vote clears everyone this time"), the alarm "X sounded the alarm over Y.", and the skip button "Pass". **Pending (Shane's decision):** the four faults map one-to-one onto the commercial game's sabotages by room role (ballast breach countdown, blackout in Battery Bay, sonar jam, scrubber fault with a countdown); their mechanics are unchanged in this pass. Also left as they are: the central muster post, the voted marks and the shared jobs bar (mechanics). The title and slug are pending too (section 2) |

## 9. Files in this folder

```
altspace/
  PORT.md                 this file
  ts/
    package.json          npm test, npm run build, npm run golden, npm run map
    bindings.json         kit bindings, written by the kit builder (PortKit/Kit/Build Prefabs)
    script-header.txt     the built script's header
    src/                  the game (section 5)
    test/                 helpers.ts (drivers), rng.ts, golden, rules, scenarios, secrecy tests
    golden/               extract.ts, Harness.cs, UnityStubs.cs, Golden.csproj (gen/, bin/, obj/ ignored)
    vectors/upstream.json golden vectors
    tools/convert-map.ts  upstream map -> station-map.json (renames by index)
    portkit/              copy of the shared kit (portkit commit c971100)
    tools/walkable-grid.ts the rules' walkable test over the station -> vectors/walkable-grid.json (the collider check)
    tools/sightlines.ts   which regions of the station can be seen from which -> src/region-pvs.json
    test/kit.test.ts      the kit's clickable objects and bars on the fake room
    test/fixpass.test.ts  the review's findings (earshot, positions, jobs total, hooks, bodies, clock, licences)
  Assets/Kit/Editor/      HiddenRoleKitBuilder.cs, StationGeometry.cs, KitArt.cs, HiddenRoleTools.cs, bindings.lock.json
  Assets/Kit/             hidden-role.prefab (built), Art/ (generated materials, textures, meshes, tones), Graphs/ (relay),
                          Licenses/ (MIT texts packed into the bundles), THIRD-PARTY-NOTICES.md
  Assets/WebRoot/         pk-hidden-role.js (built), playtest/hidden-role-playtest.js (rungs 3 and 4)
  playtest/               single.json, multi.json, evidence
  TESTS.md, THIRD-PARTY-NOTICES.md
```

## 10. Licences

- Upstream code: MIT ("Copyright (c) 2026 chocowriter"; the gameplay is by dmjdesu under the same repository licence).
  The port's code is MIT; the README carries the licence text and names both authors.
- portkit: MIT (`ts/portkit/LICENSE`).
- Where the texts travel: `Assets/Kit/Licenses/MIT-hidden-role.txt` (this repository's `LICENSE`) and
  `MIT-portkit.txt` go into the bundles beside `THIRD-PARTY-NOTICES.md` (portkit packs the folder), and portkit adds
  TextMesh Pro's `LiberationSans - OFL.txt` because the kit uses Liberation Sans. The notices name the font's
  copyright lines (Google Corporation 2010, Red Hat 2012). The built script opens with the game's MIT notice in full
  (`ts/script-header.txt`), then portkit's (fixpass test 8).
- Not used and never copied: the upstream's character art (a commercial licence that forbids redistribution), its
  2D tile pack (no licence found), the Photon Fusion SDK, its fonts and room art. The two upstream sounds are
  generated in code; the kit will generate its own tones from its own formulas.

## 11. The kit (Unity)

Unity project in this folder (`altspace/`, from portkit's template: Unity 6000.3.21f1, Creator SDK 4.0.29, Play-mode
page port 44000). **Nothing from the upstream repository is imported**: its art, tile packs, fonts, sounds and the
Photon SDK are all excluded (section 10), so portkit's importer is not used and there is no `Assets/Upstream/`. The kit
is generated from `ts/src/station-map.json` by `Assets/Kit/Editor/HiddenRoleKitBuilder.cs` (on portkit's `KitBuilder`),
`StationGeometry.cs` (the shell) and `KitArt.cs` (materials, textures, meshes, tones). `PortKit/Kit/Build Prefabs`
writes `Assets/Kit/hidden-role.prefab` and `ts/bindings.json`.

### Scale and shape

- 1 u = 1 m, as the rules (Q1). The open floor is exactly the rules' walkable area at radius 0: rooms and corridors
  less the room-shape cut-outs, computed on a grid made of every rectangle edge (173 x 198 cells, no sampling).
  Walls stand on its edge, inner face on the edge, thickness (up to 0.25 m) outward and never into another open area.
- Floor to ceiling **3.2 m**; closed ceiling with light panels; a roof over it (solid, so nobody enters from above).
- Corridors are as wide as the map draws them: 1.1 m for the narrow service runs (about twice a body's width), 4.1 m
  for the main ones; openings are where corridors meet rooms (the map has no separate doorways). Props are solid boxes
  of their exact rectangle, 0.95 to 3.2 m tall by kind.
- Consoles (22), fault panels (4), hatches (9), the muster post and ring, boards and markers have **no solid
  collider** (the rules do not block on them): click colliders on the UI layer only, which bodies pass through.
- The bunkroom (the observer lounge) is a closed 12 x 8 m room 70 m below the station with its board (and Stop match,
  Leave, which works in the lobby only).
- The boarding pad stands outside the south wall at map (6, -55.4): "Enter the station" takes a person to a Commons
  spawn point; "Leave the station" on the hub board (and in the bunkroom) takes them back out. Both work in the lobby;
  while a match runs only its living players may Enter, and nobody may Leave (D13). The station takes over a
  world (`single`), placed 5 cm up (`position="0 0.05 0"`) so its floor never fights a host's ground at 0.

### Colliders against the rules (`HiddenRole/Check Walkable`)

`ts/tools/walkable-grid.ts` writes the rules' own walkable test (`ShipMap.IsBlocked`, equal to upstream by golden
vectors G1) at every 0.25 m of the play bounds (278,400 points): blocked, open, or open with a clear disc of 0.30 m.
The Unity check instantiates the built prefab and, with a body capsule of radius 0.25 m from 0.3 to 1.7 m:

```
PASS nothing solid where the rules give a body room: 70654 of 70654 clear points free, 0 blocked
PASS a body reaches nothing the rules call blocked: 70861 points reachable from the Commons, 0 of them blocked to the rules
PASS everything the rules connect is reachable: 70654 of 70654 connected clear points reached
```

### What the player sees and uses

| Object | Where | Use |
|---|---|---|
| Hub board | Commons, north side (0, 11.55) | Lobby and roster, shift clock, jobs-done bar, Join / leave lobby, Start match, Stop match, Leave the station, Credits |
| Muster post and ring | (0, 0); ring radius 2.8 m | Click the post (or E) to call a muster; the ring marks where the living stand |
| Muster board | Over the post at 1.7-3.0 m | Why and who, time left, who has voted; ten name buttons and Pass; turns to face each viewer (its own copy) |
| Consoles (22) | Each job point, facing the most open side | Screen in the player's colours (own job teal, nearest amber, in range gold, cover jobs plum); name and kind over it; a click works the job as the key does: hold (held, let go when done), tap (one press a click), timing (first click starts the sweep, second lets go) |
| Fault panels (4) | Each panel point | A saboteur's click raises its fault; a technician's click holds the reset for 2 s |
| Hatches (9) | Floor plates | V or the panel's Hatch button (saboteurs) |
| Body markers (10) | Where someone was downed | Amber disc with a dark cross; a click raises the alarm (or R) |
| Bot markers (9) | Moved by the page | A slim slate column with a lamp head and a hover ring, named "Bot n" (no likeness to any game's characters); a click eliminates (saboteurs) |
| Personal panel | Floats 0.55 m in front of the head, tilted | Role, clock, jobs nearest first with compass and distance, hints; jobs-done bar, work bar (with the timing band); Use, Eliminate, Alarm, Fault, Hatch |
| Blackout shell | Round the head | Black sphere seen from inside, radius 4.8 m (D14) |
| Bunkroom board | Bunkroom | The match as an observer sees it; Stop match; Leave (lobby only) |
| Credits | Hub board button | Licences and credits, for the viewer only |

Text is TextMesh Pro with LiberationSans SDF (SIL OFL 1.1, from TextMesh Pro's essentials). The two tones (new job,
shift over) are sine waves written by `KitArt.Tones`. Every texture is painted in code (floor plates, wall panels
with a light strip, a long window onto the water in the Lantern Dome and the bunkroom, ceiling panels, machinery
casing, hatch); no outside art is used, so there was nothing to download or replace.

### Performance

- Materials: 27, all URP Unlit (the look does not depend on the host world's lights, and no light is paid per
  object on a Quest), with URP's own keyword setup run on each. Textures: 6 of 128-256 px (ASTC 6x6 on Android) and
  the font atlas. Bundles: Android 1,116 KiB, Windows 1,155 KiB (portkit c971100: its relay graph has `pkHead` and
  per-target launches; 1,112 and 1,154 KiB in the fix pass, 1,100 and 1,141 KiB before it: portkit's larger relay graph
  and the licence texts).
- Geometry: the shell is merged into one mesh per region and material (5,868 triangles in all, 144 renderers);
  11,200 mesh triangles in the whole kit without text. Static batching does not happen for kit objects instantiated
  at run time, so the merging is done by the builder.
- **Occlusion by regions.** A kit cannot carry baked occlusion data, so the station is drawn a region at a time (6 x
  5 over the play bounds, pieces split at the region lines): `ts/tools/sightlines.ts` casts rays over the open floor
  (props below eye height do not block) every 0.5 m with 360 rays and writes, for each region, the regions visible
  from it plus its neighbours (`src/region-pvs.json`, 12.6 of 30 on average); the HUD switches regions on and off as
  the player moves (all of them outside the station, none from the bunkroom). The hub, muster post and board and the
  boarding pad sit in their regions too.
- Measured in Play mode (Game view statistics, the `stats` test command; `TESTS.md` has the runs): before the page
  knows where the player is (everything drawn) 9,080 triangles and 178 batches; walking the station with region
  switching (10 to 19 of 30 regions drawn) 4,700 to 12,000 triangles and 27 to 224 batches; SetPass calls 12 to 20.
  Editor frame 3.9 to 8.4 ms (a PC, not a Quest). The batches are mostly the station's region pieces and the text
  (95 TextMesh Pro objects, one batch each); on a Quest that is at the upper end of a comfortable budget, so the
  first thing to cut if the headset says so is text (console labels shown only near the console) and the region size.
- Colliders: 853 boxes (walls, roof pieces, props, one floor), all on the Default layer, none moving.

### Kit gaps met (portkit)

All four found in the first pass are now in portkit (812f285) and this game uses them: `walk`, `where` and `place`
are InputSim's (deleted from `HiddenRoleTools.cs`, which keeps `stats`); InputSim's pointer moves a pixel aside first
(the test's own nudge is gone); the photo frames the station only (`PhotoRoot => "Station"`); and the runtime asks
once at start where the head is (`localPosition()`).

Found in the fix pass and now in portkit (c971100): the footprint can be set (`FootprintRoot => "Station"`), so
`manifest.json` gives 123.5 x 3.45 x 112.85 m instead of 73.4 m tall (the bunkroom 70 m down lies under the station's
plan, so the area it needs on the ground is unchanged; a host world must keep the space below the station free); and
`playtest.sh --keep-play`, used for the back-to-back runs. The re-sync to c971100 needed no other change here: the game
has no grabbables, no dealt draws, no head attachments and no relay op of its own, and its commands (`CmdStart`,
`CmdAbort`) had no delay to drop.
