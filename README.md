# Hollow Reef (working title)

A hidden-role game for Altspace snippets. Technicians keep an undersea research station running through a timed shift
of jobs; a hidden saboteur among them eliminates, raises faults and slips through service hatches. When someone is
found down, or the muster post is pressed, everyone living gathers in a ring to talk and vote someone out.

This repository holds only the port: the game's rules in TypeScript on the shared `portkit` runtime, its tests, its
design notes, and the Unity project that generates the station kit (the 3D station, boards and markers) from the map
data. The title is not final; see `altspace/PORT.md`, "Names and terms" (working snippet slug
`hidden-role`).

## Layout

```
altspace/PORT.md             design, decisions, deliberate differences, feature checklist, map data, tests, gaps, the kit
altspace/TESTS.md            test evidence, rung by rung
altspace/ts/                 the game (src/), tests (test/), golden vectors (golden/, vectors/), tools (tools/)
altspace/ts/portkit/         copy of the shared portkit runtime (MIT)
altspace/Assets/Kit/         the kit builder (Editor/), the built kit and its generated art
altspace/Packages/com.altspacegames.portkit/   copy of portkit's Unity package (MIT)
```

## Running

Node 22.18 or later.

```
cd altspace/ts
npm install
npm test                     typecheck, lint, 42 tests on a fake room (no Unity)
node portkit/tools/build.ts --game . --out <folder>      the snippet script, pk-hidden-role.js
```

`npm run golden` and `npm run map` regenerate the golden vectors and the map data from a checkout of the upstream
repository (below); they are not needed to run the tests, which use the checked-in `vectors/upstream.json` and
`src/station-map.json`. Point them at the checkout with `node golden/extract.ts <checkout>` and
`dotnet run --project golden -c Release -p:Upstream=<checkout> -- vectors/upstream.json src/station-map.json`.

The Unity project is `altspace/` (Unity 6000.3.21f1, SideQuest Creator SDK 4.0.29): `PortKit/Kit/Build Prefabs`
generates the station from `ts/src/station-map.json` and writes `ts/bindings.json`; `altspace/TESTS.md` says how
each test rung is run.

## Credits

The game rules are translated from the C# of the MIT-licensed repository
[dmjdesu/unity6-among-us-clone](https://github.com/dmjdesu/unity6-among-us-clone) (commit `4c8d3e1`): the gameplay
code by **dmjdesu**, in a project derived from one by **chocowriter**, whose copyright notice the upstream licence
keeps. The station's geometry (rooms, corridors, props, consoles) is generated from that repository's map data.

This game is an original work in the hidden-role genre. It is not affiliated with, endorsed by, or based on the art,
names or content of any commercial game: the title, theme, room and job names, role names, terms, interface and
sounds are this port's own. No art, sprites, fonts, sounds or third-party SDKs from the upstream repository are
included.

`portkit` (in `altspace/ts/portkit/`) is MIT-licensed by the portkit authors; its licence is in that folder.

## Licence

MIT. The upstream licence, whose notice must be kept with the translated code, is reproduced here:

```
MIT License

Copyright (c) 2026 chocowriter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The same terms apply to this port's own code (see `LICENSE`).
