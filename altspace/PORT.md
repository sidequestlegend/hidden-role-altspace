# PORT.md: hidden-role station game (working slug `hidden-role`)

An original hidden-role game for Altspace snippets: technicians keep an undersea research station running through a
shift while one hidden saboteur works against them. Its **rules** are translated from MIT-licensed C# (upstream
repository and authors: see `README.md` of this repository, "Credits"); its name, theme, map names, job names, words
and look are this port's own. Nothing from the commercial game the upstream imitates is used: not its name, role names,
terms, task or sabotage names, room names, map layout, look or sounds.

Written 2026-11-24. Upstream commit `4c8d3e1`. Nothing upstream was opened in Unity; the TypeScript rules run and are
tested in Node on portkit's fake room (rung 1). The Unity kit (rung 2 onward) is not built yet.

Contents: 1 Status, 2 Names and terms, 3 Decisions and deliberate differences, 4 Feature checklist, 5 How it works,
6 Map data, 7 Tests, 8 Gaps and open questions, 9 Files, 10 Licences.

---

## 1. Status

| Item | State |
|---|---|
| Rules in TypeScript (`ts/src/`) | Done: match flow, roles, jobs, waves, eliminations, alarms, musters, votes, faults, resets, hatches, shift clock, win checks, bots |
| Map data | Done: `ts/src/station-map.json`, generated from the upstream map's geometry by `ts/tools/convert-map.ts`, every name replaced |
| Hidden information | Done: roles and jobs by sealed delivery; input as fixed-rate sealed beats; tested on contents, sizes and timing |
| Referee | Done: `"declared"` candidates (lobby players only); any referee change voids a running match |
| Bots | Done: upstream's bots translated, an option (`bots` setting) |
| Tests | `npm test`: typecheck, lint, **40 tests, 40 pass** (6.4 s): 9 golden-vector suites against the upstream C# (dotnet 8), 12 rules tests, 16 fake-room scenarios, 3 secrecy tests |
| Build | `pk-hidden-role.js`, 418 KB, built to a scratch folder |
| `bindings.json` | **Provisional**, hand-written (78 objects, 57 refs, 19 click events); the kit builder will replace it |
| Unity kit, bundles, relay graph, Play mode (rungs 2 to 4) | Not started |
| Checklist (section 4, 82 items) | **57 Done, 21 Changed (deliberately), 3 Partial (display waits for the kit), 1 Left out** |

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
| **Ballot**, **Abstain**, **locked out** | vote, skip, ejected |
| **Fault** / **fault panel** / **reset** | sabotage / its console / its repair |
| **Ballast breach** | the countdown fault (the station floods: saboteurs win) |
| **Blackout** | the vision fault (living technicians' view closes in) |
| **Sonar jam** | the fault that blocks jobs |
| **Scrubber fault** | the fourth fault, given a countdown in the port (D2) |
| **Service hatch** | a vent: the saboteur's shortcut to the next hatch of its group |
| **Observer lounge** | where the downed and observers wait, out of sight and earshot |
| **Referee** | the client that runs the rules (upstream: the host) |

## 3. Decisions and deliberate differences

### Decisions (coordinator)

- Keep the rule numbers: one hidden role at 4 to 10 players, every cooldown, range, timer, vote and tie rule, win
  condition and the 180 s shift clock. Fix the plain upstream bugs (D1, D2, D3, D4, D6) and list each.
- The host is not forced into the hidden role (D5).
- Referee only among players who joined the lobby (`"declared"`); a referee change mid-match voids the match (D9).
- Roles by sealed delivery, with fixed-rate beats so that write timing reveals nothing (D16).
- The downed go to a lounge; musters gather the living (D3, D13).
- Bots stay as an option, translated from upstream (D10).
- Fresh repository, no upstream assets; original name, theme and terms.

### Deliberate differences from upstream

| Id | Upstream | Port | Where |
|---|---|---|---|
| D1 | A downed crew member's unfinished tasks stay in the total, so one early elimination makes the task win impossible (F29, F30) | A downed technician counts only the jobs they finished; their unfinished ones leave the total | `MatchRules.GetCrewTaskProgress`; golden test "D1" proves it is the only change in the win table |
| D2 | The fourth sabotage has no effect at all (F60) | The scrubber fault counts down like the breach (`scrubber-seconds`, default 45; 0 restores upstream) | `FaultCountdown`; rules and scenario tests |
| D3 | A meeting moves nobody (F46, F53), which with proximity voice is a silent vote | The living are teleported to a ring at the muster post, held still, and sent back where they stood (`return-after-muster`) | `RuntimeHud.Effects`; scenario "report and muster" |
| D4 | The roster shows every death the moment it happens (F74) | A downed player shows as down only once their body is reported or a muster begins (they are then missing from the ring). The data is public state: an interface rule, not a secret | `seenDown`, `RosterLine`; scenarios |
| D5 | The host is the hidden role by default (F7) | Fair deal; forcing exists only as a test aid (`Match.forcedSaboteurs`, not a setting) | rules test "start" |
| D6 | The round flag stays set after the end, so the emergency button can restart a finished round (3.5 quirk) | Musters and alarms need a match in play | rules test "muster post" |
| D7 | At the end everyone is frozen until the host restarts (F72) | The result shows for 4.5 s, then everyone is back in the lobby, at the hub, with the roster kept and the last result on the board | scenario "shift clock" |
| D8 | Each client's countdowns use its own `Time.time` (off by the start-up difference) | One synced clock for everyone | `Match.Rel` |
| D9 | The host owns the session; it ends when the host leaves (F10) | A referee elected among lobby players only; start by any lobby player (or the world's owner, `start-by="admin"`); stop by the starter or the owner; a referee change voids the match | scenarios "bystander", "change of referee", "stop" |
| D10 | The host keeps min(5, 10 - humans) bots in the lobby (F79) | `bots` setting, 0 by default, bots added at the start up to the free slots; drawn as markers | scenario "one person and five bots" |
| D11 | One hidden role, fixed | `saboteurs` setting 1 to 3, always fewer than half the roster | rules test "dealing" |
| D12 | Ranges against server-simulated positions | Positions are self-reported (a page cannot read another player's position): `range-slack` 0.5 m is added for people, and a position that jumps where no walk could go is not trusted for 1.5 s unless the game caused the jump (start, ring, return, hatch) | scenario "a position that jumps" |
| D13 | The dead watch from their body, silent and invisible to others | The downed and observers are sent to the observer lounge, out of sight and earshot (no voice isolation or avatar hiding exists) | scenarios |
| D14 | Lights shrink the crew camera | Blackout puts a local vision shell round living technicians' heads (4.8 m) | scenario "faults" |
| D15 | Bots steer greedily over the map's waypoints at radius 0.5, every frame | The map's waypoints do not form a connected graph (props cut four rooms off) and the greedy pick strands bots on a waypoint (found by the tests), so bots and test walkers steer on a shortest route over a 1 u grid of open floor (`ShipMap.NextStep`), move straight when the line is clear (`MoveToward`), at radius 0.3, re-steer every 0.25 s, step onto the nearest open point after 10 stuck steps; per-frame chances are per 50 ms tick. `GetNavigationTarget` itself is kept and matches upstream (G5) | `Bots.ts`, `ShipMap.ts` |
| D16 | Input every 64 Hz tick; everything replicated to everyone in plain properties | Input as a sealed beat every 0.25 s from every rostered player, with timestamped edges applied at the time they happened; roles, job masks and cooldowns sealed per player and rewritten together every 0.25 s; ballots in the beats | section 5; secrecy tests |
| D17 | The host moves the venting player | The player's own client makes the hatch trip; the referee accepts it only from a living saboteur at a hatch | scenario "hatches" |
| D18 | A player who disconnects is gone | A rostered player keeps the seat for 5 s, so a page reload keeps role, jobs and cooldowns | scenario "a reload" |
| D19 | Timers checked every frame | Timers checked on the referee's 0.25 s step (cut-in 180.0-180.25 s, end 184.0-184.25 s) and at every input edge | scenario "shift clock" |

## 4. Feature checklist

Status: **Done** (as upstream), **Changed** (deliberately, see the D or C id), **Partial** (rules done; the display
needs the kit), **Left out**. Evidence names a test in `ts/test/` (G = golden vectors, R = rules, S = scenario,
X = secrecy).

| # | Upstream behaviour (short) | Status | Evidence / note |
|---|---|---|---|
| F1 | Named rooms: host, join or auto | Left out | The world instance is the room (X5) |
| F2 | At most 10 players | Done | `max-players` 2-10; R settings |
| F3 | Player objects, numbers, colours, lobby spawn points | Changed | Roster slots by join order; platform names; hub spawn points used when returning (D9) |
| F4 | Everyone walks the map in the lobby | Done | No lock in the lobby (kit geometry pending) |
| F5 | Only the host may start; 4 participants incl. bots | Changed | Any lobby player starts; 4 incl. bots (D9, D10); S all |
| F6 | Host restarts any time | Changed | Starter or owner stops; automatic return after the result (D7, D9); S stop |
| F7 | Host is the hidden role by default | Changed | D5; R start |
| F8 | Late joiner spectates | Done | Observer, lounge, no beats; S late joiner |
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
| F19 | Nobody moves in a meeting, dead, cut-in, end | Changed | Movement lock in musters, cut-in and result; the downed move freely in the lounge (D13); S vote, clock |
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
| F35 | Job list nearest first, 7 rows; pointer hidden in a fault | Partial | List with compass and distance on the personal panel; no 3D pointer arrow until the kit exists |
| F36 | Own stations marked; gold in range; hidden role's purple | Partial | Console colours sent (`setColor`); kit objects not built |
| F37 | Progress bar while working | Partial | Panel hint only ("Holding..."); console bar/lamps/needle wait for the kit |
| F38 | Elimination: living hidden role, 10 s cooldown, ready at start | Done | G cooldown; R elimination |
| F39 | Nearest living crew within 1.45, clear line | Done | R elimination (range edge, wall) |
| F40 | Victim down where they stand; flash | Changed | Body marker stays; victim to the lounge; no flash (D13) |
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
| F77 | The dead are told and keep the boards | Done | Panel "You are out", lounge board; S eliminations |
| F78 | "Player n" names and suit colours | Changed | Platform names, no colours (X7) |
| F79 | Lobby bots | Changed | D10 |
| F80 | Crew bot routine | Done | Translated (`Bots.ts`), steering D15; S jobs, clock, bots |
| F81 | Hidden-role bot routine | Done | Translated; S bots |
| F82 | Bot voting | Done | Translated; S bots |

Counts: Done 57, Changed 21, Partial 3, Left out 1 (82).

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

### Referee and lobby

Join on the hub board sets `j` and offers the player as referee candidate (`Networking.SetRefereeCandidate`). The
first-joined candidates rank for the seat; bystanders are never candidates. Start: a lobby player (or the owner) sends
the command `CmdStart` (`networkCallable`); the referee takes the first `max-players` by join time plus bots and
deals. If the referee seat changes while a match runs, the new referee writes the lobby with notice `void-referee`;
every page unlocks and returns to the hub.

### Input path

Keys E (use), Q (eliminate), R (alarm), F (fault), V (hatch); VR right A (use), right B (alarm), left X (eliminate),
left Y (hatch at a hatch, else fault); the personal panel's five buttons (Use latches); the muster board's ten name
buttons and Abstain. Each press or release is an edge with the synced time; the referee merges every player's edges
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
| 1 | `decompression` | Decompression Bay | -59..-37 | 3.5..20.5 |
| 2 | `wet-lab` | Wet Lab | -50..-26 | 28..46 |
| 3 | `gallery` | Viewing Gallery | -10..10 | 40..54 |
| 4 | `sonar` | Sonar Room | 26..44 | 28..42 |
| 5 | `dive-locker` | Dive Locker | 41..59 | 4.5..19.5 |
| 6 | `pump-hall` | Pump Hall | 36..62 | -26..-8 |
| 7 | `ballast` | Ballast Control | 24..50 | -54..-32 |
| 8 | `battery` | Battery Bay | -2..16 | -51.5..-36.5 |
| 9 | `kelp-store` | Kelp Store | -34..-4 | -40..-18 |
| 10 | `scrubbers` | Scrubber Room | -61..-39 | -26..-10 |

| Id | Job | Room | Kind | x, y |
|---|---|---|---|---|
| 0 | Sign the shift ledger | Commons | hold | -10, 7 |
| 1 | Bleed the chamber gauge | Decompression Bay | hold | -53.5, 7 |
| 2 | Set the recompression valve | Decompression Bay | timing | -42, 17 |
| 3 | Trim tank pressure | Wet Lab | timing | -46, 32 |
| 4 | Log the specimen tray | Wet Lab | hold | -31, 40 |
| 5 | Focus the floodlights | Viewing Gallery | timing | 0, 43 |
| 6 | Send the surface packet | Sonar Room | hold | 29, 36 |
| 7 | Trim hydrophone gain | Sonar Room | timing | 39.5, 29.5 |
| 8 | Charge the dive lamps | Dive Locker | hold | 43.25, 8.25 |
| 9 | Tag the wetsuit racks | Dive Locker | tap | 53.25, 15.25 |
| 10 | Balance the main pump | Pump Hall | timing | 39, -13 |
| 11 | Prime the bilge line | Pump Hall | tap | 50, -10 |
| 12 | Check the impeller housing | Pump Hall | hold | 59, -22 |
| 13 | Level the trim tanks | Ballast Control | timing | 28, -36 |
| 14 | Seat the flood dampers | Ballast Control | tap | 45, -50 |
| 15 | Re-route feeder B | Battery Bay | tap | 2, -38 |
| 16 | Cycle the bus ties | Battery Bay | tap | 8, -39 |
| 17 | Ping the cable run | Battery Bay | tap | 13, -45 |
| 18 | Weigh the harvest bins | Kelp Store | hold | -31, -22 |
| 19 | Strap loose crates | Kelp Store | tap | -8.75, -31.25 |
| 20 | Purge the condensate trap | Scrubber Room | tap | -57.75, -13.75 |
| 21 | Read the reserve bottles | Scrubber Room | hold | -43, -19 |

| Panel | Fault | Room | Countdown | x, y |
|---|---|---|---|---|
| 0 | Ballast breach | Ballast Control | 45 s | 30, -36 |
| 1 | Blackout | Battery Bay | no | 8, -38 |
| 2 | Sonar jam | Sonar Room | no | 35, 33 |
| 3 | Scrubber fault | Scrubber Room | 45 s (D2) | -47, -13 |

| Hatch | Group | Room | x, y |
|---|---|---|---|
| 0 | north | Decompression Bay | -55.5, 7 |
| 1 | north | Wet Lab | -32, 40 |
| 2 | north | Sonar Room | 30, 31 |
| 3 | east | Dive Locker | 55, 15.5 |
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
ceiling; lounge 70 m below the station.

## 7. Tests

`cd ts && npm test` (typecheck, lint, then the Node test runner): **40 tests, all pass**, 6.4 s.

| File | Tests | What |
|---|---|---|
| `golden.test.ts` | 9 | Against the upstream C# rule methods compiled with dotnet 8 (`npm run golden`): G9 every ballot set of 5 voters (7,776); G12 win check over 56,160 combinations (roles, deaths, jobs, clock, waves, cut-in), equal to upstream with D1 switched back, and D1 shown to change only blocked job wins; G10 600 seeded deals (shuffle + 5 of 22 masks) and the role count at 4-10; elimination cooldown; G11 hold/tap/timing and the bots' versions at the edges (1.34/1.35 s, 3/4/5 taps, 69/70/82/83%); G1 walkable test over the whole map at two radii (140,266 points); G2 3,000 lines of reach; G3 40 sliding walks; G5 330 steering targets; G7 random start points; G14 hatch order |
| `rules.test.ts` | 12 | Settings; start state and fair deal (D5); elimination range, wall, cooldown, muster; muster post (D6); faults (4 s, 18 s, one at a time, reset 2 s, cleared by a muster); D2; waves (30, 75, delayed by a muster, living technicians only, no job win before both, D1); clock and cut-in; leaving; fixed-length beats and secrets; state budget; muster timeout and invalid ballots |
| `scenarios.test.ts` | 16 | Real clients (each its own page, head and keys) on the fake room, bots where stated: matches won by **jobs**, **eliminations**, **vote**, **shift clock**; **alarm and muster** (ring, locks, abstentions, return, body stays, cooldown); **faults and reset** (blackout shell, jam, breach win at 45 s); scrubber countdown; **hatches**; **bystander never referee**; **referee change voids**; **late joiner observes**; **two matches in one room**; reload keeps the seat; position jump not trusted; **one person and five bots**; stop by the starter |
| `secrecy.test.ts` | 3 | Contents of every write; sizes and send times of every beat and sealed entry; the same match with the hidden role dealt elsewhere has the identical schedule |

Build: `node portkit/tools/build.ts --game . --out <scratch>` writes `pk-hidden-role.js` (418,150 bytes). `npm run
build` targets `../Assets/WebRoot` (the Unity project, not created yet).

Golden vectors: `npm run golden` runs `golden/extract.ts` (copies 31 rule members out of the upstream files, unchanged,
into `golden/gen/`, not checked in, since it is upstream code with upstream names) and the dotnet harness
(`golden/Harness.cs`, `golden/UnityStubs.cs`, the upstream `GameTypes.cs` and `ShipMapData.cs` compiled from the
upstream checkout). `vectors/upstream.json` is checked in, so the tests run without the upstream.

## 8. Gaps and open questions

### Runtime and fake-room gaps met in this job

| Gap | Workaround here | Status |
|---|---|---|
| The fake room's key table lacked V | Tests used the panel's Hatch button | Fixed in portkit `c876a0c`; workaround removed after the re-sync |
| No way to attach a kit object to the head (only to a hand, `AttachToHand`, new) | The personal panel and the blackout shell follow the head by transform, sent only when the head moved 5 cm | Open: ask portkit for head attachment, or attach the panel to the left hand in VR |
| Remote players' positions cannot be read by a page | Positions are self-reported in the sealed beat, with slack and a jump hold (D12) | Platform limit, stated |
| No voice isolation, muting or avatar hiding | Lounge 70 m away; ring at musters (D3, D13) | Platform limit, stated: a downed player who walks back, or a host world that raises the voice range above about 1.4x, breaks it |
| No referee hand-over of secrets | A referee change voids the match | By design |
| `Random` in the app comes from the page's generator | Deals use `this.Random` (only the referee sees its draws) | Could move to `this.Random.Bytes` (new); not needed for fairness against others |
| The app sends space state in batches every 0.2 s | Other pages see a change up to about 0.5 s after the referee's step | Measured in the fake room; tests wait for it |
| `this.Host.op`, `UnityRandom`, portkit's `golden/UnityStubs.cs` (new) | Not used: the port's own `golden/UnityStubs.cs` has a seeded generator both sides share, which is all the vectors need | None |

Portkit copy: `ts/portkit/` mirrors portkit commit `1118ef0` (re-synced at the end of this job, `robocopy /MIR`).

### Not done in this job (needs Unity, or a person)

- The kit: station geometry from `station-map.json` (floors, walls, ceiling, props, consoles, panels, hatches, muster
  post, ring marks, lounge), boards, personal panel, markers, shell, the two generated tones; the relay graph;
  bundles; `bindings.json` from the kit builder (the current one is provisional); Play-mode tests (rungs 2-4).
- In-world bot bodies are markers only (`Station/Bots/Bot0..8`); how they look is the kit's.
- VR controller mapping and the desktop keys are untested in the app (Q and E may clash with grapple when a world
  enables it); the panel buttons are the guaranteed path.
- Name tags may show through walls and the blackout shell (not determined; behind `SetSettings`).
- Title and slug: choose one of section 2 and check it before registering.

### Open questions

| # | Question | Proposed handling |
|---|---|---|
| Q1 | Scale 1 u = 1 m makes a 150 x 116 m station | Walk it in a headset at 1.0 and 0.75; rules stay in u |
| Q2 | Should a player who leaves reveal their role? Their departure drops the job total if they were a technician (as upstream's bar did) | Keep upstream; stated |
| Q3 | The upstream map imitation check was from memory | A person compares names before release |

## 9. Files in this folder

```
altspace/
  PORT.md                 this file
  ts/
    package.json          npm test, npm run build, npm run golden, npm run map
    bindings.json         PROVISIONAL kit bindings
    script-header.txt     the built script's header
    src/                  the game (section 5)
    test/                 helpers.ts (drivers), rng.ts, golden, rules, scenarios, secrecy tests
    golden/               extract.ts, Harness.cs, UnityStubs.cs, Golden.csproj (gen/, bin/, obj/ ignored)
    vectors/upstream.json golden vectors
    tools/convert-map.ts  upstream map -> station-map.json (renames by index)
    portkit/              copy of the shared kit (portkit commit 1118ef0)
```

## 10. Licences

- Upstream code: MIT ("Copyright (c) 2026 chocowriter"; the gameplay is by dmjdesu under the same repository licence).
  The port's code is MIT; the README carries the licence text and names both authors.
- portkit: MIT (`ts/portkit/LICENSE`).
- Not used and never copied: the upstream's character art (a commercial licence that forbids redistribution), its
  2D tile pack (no licence found), the Photon Fusion SDK, its fonts and room art. The two upstream sounds are
  generated in code; the kit will generate its own tones from its own formulas.
