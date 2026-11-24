// The hidden-role kit: an undersea station generated from ts/src/station-map.json, its boards, consoles, markers, the
// muster post and ring, the bunkroom (the observer lounge) 70 m below, and the boarding pad outside. Nothing comes from the upstream
// project but the map's numbers (PORT.md section 6, "The kit"); every model, texture and tone is made by KitArt.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using PortKit;
using TMPro;
using Unity.VisualScripting;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace HiddenRole
{
    public sealed class HiddenRoleKitBuilder : KitBuilder
    {
        public const string MapPath = "ts/src/station-map.json";
        /// <summary>Floor to ceiling, metres (the map is 1 u = 1 m). Corridors are as the map draws them: 1.1 to 4.1 m wide.</summary>
        public const float WallHeight = 3.2f;
        /// <summary>The bunkroom (observer lounge): this far below the station (RuntimeHud LOUNGE_OFFSET).</summary>
        public static readonly Vector3 LoungeOffset = new Vector3(0, -70, 0);
        /// <summary>The boarding pad's sign, outside the station's south wall (map units; RuntimeHud ENTRY_POINT stands in front of it).</summary>
        public static readonly Vector2 EntrySign = new Vector2(6f, -55.4f);
        /// <summary>The station is drawn a region at a time on this grid over the play bounds; ts/src/region-pvs.json must be for the same grid.</summary>
        public const int RegionColumns = 6, RegionRows = 5;
        public const string PvsPath = "ts/src/region-pvs.json";

        public override string Slug => "hidden-role";
        public override string Title => "Hidden Role";
        public override string Summary => "A hidden-role game in an undersea station: technicians work through a shift of jobs while a hidden saboteur works against them.";
        public override string Description =>
            "Hidden Role (working title): 4 to 10 players, with optional bots. Technicians keep an undersea research station running " +
            "through a timed shift of jobs; one hidden saboteur eliminates, raises faults and slips through service hatches. A downed " +
            "player found, or the muster post pressed, gathers everyone living at the muster ring to talk and vote. The station takes " +
            "over the world (150 x 116 m); the downed watch from a bunkroom 70 m below. Rules translated from MIT-licensed C# by " +
            "chocowriter and dmjdesu; station, art and tones made for this port. Credits on the hub board.";
        public override bool Single => true;
        /// <summary>The photo shows the station only (the bunkroom 70 m below would shrink it to a speck).</summary>
        public override string PhotoRoot => "Station";
        /// <summary>5 cm up, so the station's floor never fights a host world's ground at 0.</summary>
        public override string SnippetPosition => "0 0.05 0";
        public override IReadOnlyList<(string name, string value)> SnippetSettings => new[]
        {
            ("room", ""), ("bots", "0"), ("min-players", "4"), ("max-players", "10"), ("saboteurs", "1"), ("start-by", "anyone"),
            ("shift-seconds", "180"), ("return-after-muster", "true"),
        };

        /// <summary>The ids the TypeScript looks behaviours up by (FindBehaviour("match") and so on), fixed in the lock file.</summary>
        public override string LockPath
        {
            get
            {
                string path = base.LockPath;
                var json = File.Exists(path) ? JObject.Parse(File.ReadAllText(path)) : new JObject();
                var behaviours = json["behaviours"] as JObject ?? new JObject();
                bool changed = false;
                foreach (var (slot, id) in new[] { ("hubBoard#Match#0", "match"), ("hubBoard#Dealer#0", "dealer"), ("hubBoard#PlayerLink#0", "link"), ("personalPanel#RuntimeHud#0", "hud") })
                    if ((string)behaviours[slot] != id) { behaviours[slot] = id; changed = true; }
                if (changed)
                {
                    json["behaviours"] = behaviours;
                    if (json["objects"] == null) json["objects"] = new JObject();
                    if (json["nextBehaviour"] == null) json["nextBehaviour"] = 1;
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    File.WriteAllText(path, json.ToString());
                }
                return path;
            }
        }

        // ---- what the build found, for the report and the checks ----
        JObject map;
        Rect bounds;
        OpenGrid grid;
        List<MapRect> props;
        TMP_FontAsset font;
        KitStage stage;
        object hud;
        public static string LastStats = "";

        protected override void Compose(KitStage s)
        {
            stage = s;
            map = JObject.Parse(File.ReadAllText(MapPath));
            var pvs = JObject.Parse(File.ReadAllText(PvsPath));
            if ((int)pvs["cols"] != RegionColumns || (int)pvs["rows"] != RegionRows)
                throw new Exception($"{PvsPath} is for a {pvs["cols"]} x {pvs["rows"]} grid, the kit draws {RegionColumns} x {RegionRows}: run node tools/sightlines.ts {RegionColumns} {RegionRows}");
            var pb = Floats(map["playBounds"]);
            bounds = new Rect(pb[0], pb[1], pb[2], pb[3]);
            font = KitText.DefaultFont() ?? throw new Exception("no LiberationSans SDF: run PortKit/Setup/Run SDK Setup");
            KitArt.Materials();
            KitArt.BeginMeshes();
            var tones = KitArt.Tones();

            var root = stage.Root.transform;
            var station = stage.Create("Station", root);
            // what is drawn, a region of the map at a time: the page switches off the regions far from the player
            var regionParent = stage.Create("Regions", station.transform).transform;
            regionRoots.Clear();
            for (int g = 0; g < RegionColumns * RegionRows; g++) regionRoots.Add(stage.Create($"R{g:00}", regionParent).transform);
            Station(station.transform);

            // ---- the behaviours (ids fixed by LockPath). The HUD's field object is filled in as its objects are made:
            //      the stage keeps this very JObject and resolves its keys when the kit is finished ----
            var personal = stage.Create("Personal", root).transform;
            var panel = stage.Create("Panel", personal);
            stage.Object(panel, key: "personalPanel");
            hudFields = new JObject();
            hud = stage.Behaviour(panel, "RuntimeHud", hudFields);
            PersonalPanel(personal, panel);

            var hubBoard = HubBoard(stage.Create("Hub", RegionRoot(0, 11.55)).transform);
            stage.Object(hubBoard, key: "hubBoard");
            stage.Behaviour(hubBoard, "Match");
            stage.Behaviour(hubBoard, "Dealer");
            stage.Behaviour(hubBoard, "PlayerLink");
            HubButtons(hubBoard.transform);

            Muster(stage.Create("Muster", RegionRoot(0, 0)).transform);
            Lounge(stage.Create("Lounge", root).transform);
            Entry(stage.Create("Entry", RegionRoot(EntrySign.x, EntrySign.y)).transform);
            Speaker(stage.Create("Audio", root).transform, tones);
            Markers(station.transform);
            Consoles(station.transform);
            FaultPanels(station.transform);

            hudFields["voteLabels"] = new JArray(voteLabels);
            hudFields["bodies"] = new JArray(bodies);
            hudFields["botMarkers"] = new JArray(bots);
            hudFields["consoles"] = new JArray(consoles);
            hudFields["jobBars"] = new JArray(jobBars);
            var regionValues = new JArray();
            foreach (var r in regionRoots)
            {
                stage.Object(r.gameObject, key: "region" + r.name.Substring(1));
                regionValues.Add(stage.ObjectValue(r.gameObject));
            }
            hudFields["regions"] = regionValues;
            hudFields["regionGrid"] = new JArray(RegionColumns, RegionRows);
            KitArt.SaveMeshes();
        }

        // ------------------------------------------------------------------ the HUD's fields

        JObject hudFields;
        readonly List<JToken> voteLabels = new List<JToken>(), bodies = new List<JToken>(), bots = new List<JToken>(), consoles = new List<JToken>(), jobBars = new List<JToken>();

        JObject Text(GameObject go) => stage.ComponentValue(go, "TMP");

        // ------------------------------------------------------------------ the station's shell

        readonly List<Transform> regionRoots = new List<Transform>();
        Transform RegionRoot(double x, double y) => regionRoots[Region(x, y)];

        int Region(double x, double y)
        {
            int cx = Mathf.Clamp((int)((x - bounds.xMin) / bounds.width * RegionColumns), 0, RegionColumns - 1);
            int cy = Mathf.Clamp((int)((y - bounds.yMin) / bounds.height * RegionRows), 0, RegionRows - 1);
            return cy * RegionColumns + cx;
        }

        void Station(Transform station)
        {
            var walk = new List<MapRect>();
            foreach (var r in map["rooms"]) walk.Add(R(Floats(r["rect"])));
            foreach (var c in map["corridors"]) walk.Add(R(Floats(c)));
            foreach (var d in map["doorways"]) walk.Add(R(Floats(d)));
            var cuts = map["cuts"].Select(c => R(Floats(c))).ToList();
            props = map["props"].Select(p => R(Floats(p["rect"]))).ToList();
            grid = new OpenGrid(walk, cuts);
            var gallery = R(Floats(map["rooms"].First(r => (string)r["id"] == "lantern-dome")["rect"]));
            var xCuts = Enumerable.Range(1, RegionColumns - 1).Select(i => (double)bounds.xMin + bounds.width * i / RegionColumns).ToArray();
            var yCuts = Enumerable.Range(1, RegionRows - 1).Select(i => (double)bounds.yMin + bounds.height * i / RegionRows).ToArray();
            var shell = Shell.Build(grid, WallHeight, 0f, Region,
                w => !w.Vertical && w.Facing == -1 && Math.Abs(w.At - gallery.Y1) < 0.01 && w.From >= gallery.X0 - 0.01 && w.To <= gallery.X1 + 0.01 ? "window" : "wall",
                xCuts: xCuts, yCuts: yCuts);

            // props: solid boxes of their exact rectangle
            var names = map["props"].Select(p => (string)p["name"]).ToList();
            for (int i = 0; i < props.Count; i++)
            {
                var r = props[i];
                float h = PropHeight(names[i]);
                int g = Region(r.CX, r.CY);
                shell.Part(g, "prop").Box(new Vector3((float)r.X0, 0, (float)r.Y0), new Vector3((float)r.X1, h, (float)r.Y1), 1f);
                shell.Solids.Add((new Vector3((float)r.CX, h / 2, (float)r.CY), new Vector3((float)(r.X1 - r.X0), h, (float)(r.Y1 - r.Y0)), g));
            }

            // room signs under the ceiling (both sides), the Commons excepted (the muster board hangs there)
            foreach (var room in map["rooms"])
            {
                if ((string)room["id"] == "commons") continue;
                var at = Floats(room["label"]);
                int g = Region(at[0], at[1]);
                var signPart = shell.Part(g, "trim");
                signPart.Box(new Vector3(at[0] - 1.3f, 2.55f, at[1] - 0.03f), new Vector3(at[0] + 1.3f, 2.95f, at[1] + 0.03f), 1f, true);
                signPart.Box(new Vector3(at[0] - 0.02f, 2.95f, at[1] - 0.02f), new Vector3(at[0] + 0.02f, WallHeight, at[1] + 0.02f), 1f);
                for (int side = 0; side < 2; side++)
                {
                    var t = Label(regionRoots[g], "Sign " + (string)room["id"] + (side == 0 ? "" : " back"), ((string)room["name"]).ToUpperInvariant(), 2.4f, 0.36f, 1.7f, KitArt.Sand);
                    t.transform.localPosition = new Vector3(at[0], 2.75f, at[1] + (side == 0 ? -0.04f : 0.04f));
                    t.transform.localRotation = Quaternion.Euler(0, side == 0 ? 0 : 180, 0);
                }
            }

            // hatches: plates on the floor (nothing solid; the rules let anyone walk over them)
            foreach (var h in map["hatches"])
            {
                var at = Floats(h["at"]);
                shell.Part(Region(at[0], at[1]), "hatch").Add(KitArt.Ring(0, 0.55f, 24, 0.012f), Matrix4x4.Translate(new Vector3(at[0], 0, at[1])));
            }

            // the drawn parts, one renderer per region and material
            int triangles = 0, renderers = 0;
            foreach (var pair in shell.Parts.OrderBy(p => p.Key.Item1).ThenBy(p => p.Key.Item2, StringComparer.Ordinal))
            {
                if (pair.Value.TriangleCount == 0) continue;
                string name = $"R{pair.Key.Item1:00}_{pair.Key.Item2}";
                var go = stage.Create("Shell_" + pair.Key.Item2, regionRoots[pair.Key.Item1]);
                go.AddComponent<MeshFilter>().sharedMesh = KitArt.Keep(pair.Value.ToMesh(name));
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = KitArt.Get(pair.Key.Item2);
                mr.shadowCastingMode = ShadowCastingMode.Off;
                mr.receiveShadows = false;
                mr.lightProbeUsage = LightProbeUsage.Off;
                mr.reflectionProbeUsage = ReflectionProbeUsage.Off;
                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.OccluderStatic);
                triangles += pair.Value.TriangleCount;
                renderers++;
            }

            // what a body meets: one floor under the play area, the walls, the roof, the props (Default layer)
            var solid = stage.Create("Solid", station);
            var floor = solid.AddComponent<BoxCollider>();
            floor.center = new Vector3(bounds.center.x, -0.25f, bounds.center.y);
            floor.size = new Vector3(bounds.width, 0.5f, bounds.height);
            var byRegion = shell.Solids.GroupBy(b => b.region).OrderBy(g => g.Key);
            foreach (var group in byRegion)
            {
                var holder = stage.Create($"R{group.Key:00}", solid.transform);
                foreach (var (center, size, _) in group)
                {
                    var box = holder.AddComponent<BoxCollider>();
                    box.center = center;
                    box.size = size;
                }
            }
            LastStats = $"station: {shell.Floors} floor rectangles ({shell.OpenArea:F0} m2 open before props), {shell.WallCount} wall runs, {props.Count} props, " +
                        $"{shell.Solids.Count + 1} box colliders, {renderers} shell renderers, {triangles} shell triangles; grid {grid.Nx} x {grid.Ny}";
            stage.Report.AppendLine("   " + LastStats);
        }

        static float PropHeight(string name)
        {
            switch (name)
            {
                case "Pressure chamber": return 2.3f;
                case "Server rack": case "Locker wall": case "Tool wall": case "Filter bank": return 2.2f;
                case "Ballast column": return 3.2f;
                case "Main pump": return 2.0f;
                case "Gauge cabinet": case "West cell racks": case "East cell racks": case "Scrubber canisters": case "Transformer": case "Trim tanks": return 1.85f;
                case "Specimen tank": case "Impeller casing": case "Valve bank": return 1.6f;
                case "Bin stack A": case "Bin stack B": case "Bin stack C": return 1.4f;
                case "Flood barrier": return 1.2f;
                case "Bunk pod": return 1.1f;
                case "Low shelf": return 0.95f;
                default: return 1.0f;                     // benches, desks, consoles
            }
        }

        // ------------------------------------------------------------------ helpers for kit objects

        GameObject Draw(Transform parent, string name, Mesh mesh, string material, Vector3 position, Vector3 scale, Quaternion? rotation = null)
        {
            var go = stage.Create(name, parent);
            go.transform.localPosition = position;
            go.transform.localRotation = rotation ?? Quaternion.identity;
            go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = KitArt.Get(material);
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows = false;
            mr.lightProbeUsage = LightProbeUsage.Off;
            mr.reflectionProbeUsage = ReflectionProbeUsage.Off;
            return go;
        }

        GameObject DrawPart(Transform parent, string name, MeshPart part, string material, Vector3 position)
        {
            var mesh = KitArt.Keep(part.ToMesh($"{parent.name}_{name}"));
            return Draw(parent, name, mesh, material, position, Vector3.one);
        }

        /// <summary>A TextMeshPro text, read from -Z, `w` x `h` metres; `size` is the text's height in decimetres (TMP's 3D scale).</summary>
        GameObject Label(Transform parent, string name, string text, float w, float h, float size, Color colour, TextAlignmentOptions align = TextAlignmentOptions.Center, bool autoSize = false)
        {
            var go = stage.Create(name, parent);
            var tmp = go.AddComponent<TextMeshPro>();
            tmp.font = font;
            tmp.rectTransform.sizeDelta = new Vector2(w, h);
            tmp.fontSize = size;
            tmp.color = colour;
            tmp.alignment = align;
            tmp.textWrappingMode = TextWrappingModes.Normal;
            tmp.overflowMode = TextOverflowModes.Truncate;
            tmp.richText = false;
            tmp.text = text;
            if (autoSize)
            {
                tmp.enableAutoSizing = true;
                tmp.fontSizeMin = size * 0.4f;
                tmp.fontSizeMax = size;
            }
            var mr = go.GetComponent<MeshRenderer>();
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows = false;
            return go;
        }

        /// <summary>A flat button: an empty with the click collider (the bound object), a face and a label as children.</summary>
        GameObject Button(Transform parent, string name, string text, Vector3 position, float w, float h, string material = "button", float textSize = 0)
        {
            var go = stage.Create(name, parent);
            go.transform.localPosition = position;
            var box = go.AddComponent<BoxCollider>();
            box.size = new Vector3(w, h, 0.04f);
            Draw(go.transform, "Face", KitArt.Quad(), material, new Vector3(0, 0, 0.002f), new Vector3(w, h, 1));
            var label = Label(go.transform, "Label", text, w * 0.94f, h * 0.9f, textSize > 0 ? textSize : h * 5.5f, Color.white);
            label.transform.localPosition = new Vector3(0, 0, -0.004f);
            stage.Object(go, click: true);
            return go;
        }

        /// <summary>A bar: a back quad and a fill that the page scales along x from the bar's left end. Returns the fill.</summary>
        GameObject Bar(Transform parent, string name, Vector3 center, float w, float h, string fillMaterial)
        {
            var bar = stage.Create(name, parent);
            bar.transform.localPosition = center;
            Draw(bar.transform, "Back", KitArt.Quad(), "barBack", new Vector3(0, 0, 0.002f), new Vector3(w + 0.01f, h + 0.01f, 1));
            var fill = stage.Create("Fill", bar.transform);
            fill.transform.localPosition = new Vector3(-w / 2, 0, 0);
            Draw(fill.transform, "Bar", KitArt.Quad(), fillMaterial, new Vector3(w / 2, 0, 0), new Vector3(w, h, 1));
            fill.transform.localScale = new Vector3(0.001f, 1, 1);
            stage.Object(fill);
            stage.Ref(fill);
            return fill;
        }

        void StationButton(GameObject go, string kind, int index)
        {
            stage.Object(go, click: true);
            stage.Behaviour(go, "StationButton", new JObject { ["kind"] = kind, ["index"] = index, ["hud"] = stage.BehaviourValue(hud) });
        }

        // ------------------------------------------------------------------ the hub board (Commons, north side)

        GameObject HubBoard(Transform hub)
        {
            var board = stage.Create("Board", hub);
            board.transform.localPosition = new Vector3(0, 1.75f, 11.55f);
            Draw(board.transform, "Back", KitArt.Quad(), "board", new Vector3(0, 0, 0.01f), new Vector3(3.3f, 2.1f, 1));
            var post = new MeshPart();
            post.Box(new Vector3(-1.62f, -1.75f, 0.02f), new Vector3(-1.52f, -1.05f, 0.1f), 1f);
            post.Box(new Vector3(1.52f, -1.75f, 0.02f), new Vector3(1.62f, -1.05f, 0.1f), 1f);
            DrawPart(board.transform, "Legs", post, "fixture", Vector3.zero);
            var text = Label(board.transform, "Text", "HIDDEN ROLE", 2.15f, 1.7f, 0.9f, Color.white, TextAlignmentOptions.TopLeft, true);
            text.transform.localPosition = new Vector3(-0.5f, 0.1f, 0);
            stage.Object(text, key: "hubText");
            stage.Ref(text);
            hudFields["hubText"] = Text(text);
            var bar = Bar(board.transform, "JobBar", new Vector3(-0.5f, -0.9f, -0.003f), 2.1f, 0.09f, "barFill");
            var barLabel = Label(board.transform, "JobBarLabel", "JOBS", 0.5f, 0.12f, 0.8f, KitArt.Sand, TextAlignmentOptions.Right);
            barLabel.transform.localPosition = new Vector3(-1.82f, -0.9f, 0);
            jobBars.Add(stage.ObjectValue(bar));
            return board;
        }

        void HubButtons(Transform board)
        {
            float x = 1.15f;
            var join = Button(board, "Join", "Join / leave lobby", new Vector3(x, 0.78f, -0.005f), 0.85f, 0.24f, "button", 0.75f);
            var start = Button(board, "Start", "Start match", new Vector3(x, 0.46f, -0.005f), 0.85f, 0.24f, "button", 0.75f);
            var abort = Button(board, "Abort", "Stop match", new Vector3(x, 0.14f, -0.005f), 0.85f, 0.24f, "buttonWarn", 0.75f);
            var leave = Button(board, "Leave", "Leave the station", new Vector3(x, -0.18f, -0.005f), 0.85f, 0.24f, "button", 0.75f);
            var credits = Button(board, "Credits", "Credits", new Vector3(x, -0.5f, -0.005f), 0.85f, 0.24f, "button", 0.75f);
            stage.Object(join, key: "joinButton");
            stage.Object(start, key: "startButton");
            stage.Object(abort, key: "abortButton");
            stage.Object(leave, key: "leaveButton");
            stage.Object(credits, key: "creditsButton");
            stage.Event(join, "click", hud, "ClickJoin");
            stage.Event(start, "click", hud, "ClickStart");
            stage.Event(abort, "click", hud, "ClickAbort");
            stage.Event(leave, "click", hud, "ClickLeave");
            stage.Event(credits, "click", hud, "ClickCredits");

            // the credits, over the board's text, for this viewer only
            var panel = stage.Create("CreditsPanel", board.parent);
            panel.transform.localPosition = board.localPosition + new Vector3(-0.5f, 0.05f, -0.03f);
            Draw(panel.transform, "Back", KitArt.Quad(), "board", new Vector3(0, 0, 0.002f), new Vector3(2.25f, 1.95f, 1));
            var body = Label(panel.transform, "Text", CreditsText, 2.1f, 1.85f, 0.62f, Color.white, TextAlignmentOptions.TopLeft, true);
            body.transform.localPosition = new Vector3(0, 0, -0.002f);
            var box = panel.AddComponent<BoxCollider>();
            box.size = new Vector3(2.25f, 1.95f, 0.04f);
            stage.Object(panel, key: "creditsPanel", click: true);
            stage.Event(panel, "click", hud, "ClickCredits");
            panel.SetActive(false);
            hudFields["creditsPanel"] = stage.ObjectValue(panel);
        }

        const string CreditsText =
            "HIDDEN ROLE (working title): an original hidden-role game for Altspace.\n" +
            "Rules translated from MIT-licensed C#: Copyright (c) 2026 chocowriter; gameplay code by dmjdesu (MIT licence). " +
            "The station is generated from that project's map data; every name, word and look here is this port's own.\n" +
            "Port and runtime (portkit): MIT. Source: github.com/sidequestlegend/hidden-role-altspace\n" +
            "Station models, textures and tones: made for this port from formulas, no outside files.\n" +
            "Text: Liberation Sans, digitized data copyright (c) 2010 Google Corporation, copyright (c) 2012 Red Hat, Inc. (SIL Open Font License 1.1).\n" +
            "No voice isolation exists here: while a match runs, the downed and onlookers are kept in a bunkroom 70 m below, beyond the 50 m a voice can carry.\n" +
            "Click to close.";

        // ------------------------------------------------------------------ the personal panel and the blackout shell

        void PersonalPanel(Transform personal, GameObject panel)
        {
            panel.transform.localPosition = LoungeOffset + new Vector3(0, 0.5f, -3.5f); // out of the way (in the lounge) until the page puts it in front of the head
            Draw(panel.transform, "Back", KitArt.Quad(), "board", new Vector3(0, 0, 0.002f), new Vector3(0.52f, 0.46f, 1));
            var text = Label(panel.transform, "Text", "", 0.48f, 0.31f, 0.2f, Color.white, TextAlignmentOptions.TopLeft, true);
            text.transform.localPosition = new Vector3(0, 0.065f, 0);
            stage.Object(text, key: "panelText");
            stage.Ref(text);
            hudFields["panelText"] = Text(text);
            var jobBar = Bar(panel.transform, "JobBar", new Vector3(0.03f, -0.115f, -0.001f), 0.4f, 0.014f, "barFill");
            var jobLabel = Label(panel.transform, "JobBarLabel", "JOBS", 0.06f, 0.02f, 0.12f, KitArt.Sand, TextAlignmentOptions.Left);
            jobLabel.transform.localPosition = new Vector3(-0.215f, -0.115f, 0);
            jobBars.Add(stage.ObjectValue(jobBar));
            var work = Bar(panel.transform, "Work", new Vector3(0.03f, -0.14f, -0.001f), 0.4f, 0.014f, "workFill");
            var workLabel = Label(panel.transform, "WorkLabel", "WORK", 0.06f, 0.02f, 0.12f, KitArt.Sand, TextAlignmentOptions.Left);
            workLabel.transform.localPosition = new Vector3(-0.215f, -0.14f, 0);
            // the timing band (70-82% of the sweep), drawn over the work bar while a timing job is in hand
            var band = Draw(work.transform.parent, "Band", KitArt.Quad(), "band", new Vector3(-0.2f + 0.4f * 0.76f, 0, -0.002f), new Vector3(0.4f * 0.12f, 0.02f, 1));
            stage.Object(band);
            stage.Ref(band);
            band.SetActive(false);
            stage.Object(work, key: "workBar");
            hudFields["workBar"] = stage.ObjectValue(work);
            hudFields["workBand"] = stage.ObjectValue(band);
            string[] names = { "Use", "Eliminate", "Alarm", "Fault", "Hatch" };
            string[] keys = { "panelUse", "panelEliminate", "panelAlarm", "panelFault", "panelHatch" };
            string[] labels = { "Use (E)", "Eliminate (Q)", "Alarm (R)", "Fault (F)", "Hatch (V)" };
            for (int i = 0; i < names.Length; i++)
            {
                var b = Button(panel.transform, names[i], labels[i], new Vector3(-0.2f + i * 0.1f, -0.185f, -0.002f), 0.094f, 0.045f, i == 1 ? "buttonWarn" : "button", 0.11f);
                stage.Object(b, key: keys[i]);
                stage.Event(b, "click", hud, "Click" + names[i]);
            }
            var shell = Draw(personal, "Shell", KitArt.Sphere(true), "shell", LoungeOffset, Vector3.one * 0.01f);
            stage.Object(shell, key: "shell");
            stage.Ref(shell);
            shell.SetActive(false);
            hudFields["personalPanel"] = stage.ObjectValue(panel);
            hudFields["shell"] = stage.ObjectValue(shell);
        }

        // ------------------------------------------------------------------ the muster post, ring and board

        void Muster(Transform muster)
        {
            var at = Floats(map["muster"]);
            muster.localPosition = new Vector3(at[0], 0, at[1]);
            DrawPart(muster, "Pillar", KitArt.Cylinder(0.08f, 0f, 1.0f, 12), "fixture", Vector3.zero);
            DrawPart(muster, "Ring", KitArt.Ring(2.65f, 2.95f, 64, 0.01f), "ring", Vector3.zero);
            var post = Draw(muster, "Post", KitArt.Cube(), "post", new Vector3(0, 1.06f, 0), new Vector3(0.34f, 0.12f, 0.34f));
            var postBox = post.AddComponent<BoxCollider>();
            postBox.size = new Vector3(2.5f, 6f, 2.5f);                                   // a slim post, a generous click target
            StationButton(post, "post", 0);
            stage.Object(post, key: "musterPost");

            var board = stage.Create("Board", muster);
            board.transform.localPosition = new Vector3(0, 2.35f, 0);
            stage.Object(board, key: "musterBoard");
            stage.Ref(board);
            hudFields["musterBoard"] = stage.ObjectValue(board);
            Draw(board.transform, "Back", KitArt.Quad(), "board", new Vector3(0, 0, 0.01f), new Vector3(2.7f, 1.38f, 1));
            var text = Label(board.transform, "Text", "Muster board", 1.3f, 1.25f, 0.7f, Color.white, TextAlignmentOptions.TopLeft, true);
            text.transform.localPosition = new Vector3(-0.66f, 0, 0);
            stage.Object(text, key: "musterText");
            stage.Ref(text);
            hudFields["musterText"] = Text(text);
            for (int i = 0; i < 10; i++)
            {
                var b = Button(board.transform, "Vote" + i, "", new Vector3(0.36f + (i % 2) * 0.62f, 0.5f - (i / 2) * 0.21f, -0.005f), 0.58f, 0.18f, "button", 0.65f);
                stage.Object(b, key: "vote" + i);
                var label = b.transform.Find("Label").gameObject;
                stage.Object(label, key: "voteLabel" + i);
                stage.Ref(label);
                voteLabels.Add(Text(label));
                stage.Event(b, "click", hud, "ClickVote" + i);
            }
            var abstain = Button(board.transform, "Pass", "Pass", new Vector3(0.67f, -0.56f, -0.005f), 1.2f, 0.17f, "buttonWarn", 0.65f);
            stage.Object(abstain, key: "abstainButton");
            stage.Event(abstain, "click", hud, "ClickAbstain");
        }

        // ------------------------------------------------------------------ the bunkroom (observer lounge), 70 m below

        void Lounge(Transform lounge)
        {
            lounge.localPosition = LoungeOffset;
            var room = new OpenGrid(new List<MapRect> { new MapRect(-6, -4, 12, 8) }, new List<MapRect>());
            var shell = Shell.Build(room, WallHeight, 0f, (x, y) => 0, w => !w.Vertical && w.Facing == 1 ? "window" : "wall");
            var solid = stage.Create("Solid", lounge);
            var floor = solid.AddComponent<BoxCollider>();
            floor.center = new Vector3(0, -0.25f, 0);
            floor.size = new Vector3(13, 0.5f, 9);
            foreach (var (center, size, _) in shell.Solids)
            {
                var box = solid.AddComponent<BoxCollider>();
                box.center = center;
                box.size = size;
            }
            foreach (var pair in shell.Parts) DrawPart(lounge, "Shell_" + pair.Key.Item2, pair.Value, pair.Key.Item2, Vector3.zero);
            var board = stage.Create("Board", lounge);
            board.transform.localPosition = new Vector3(0, 1.75f, 3.9f);
            Draw(board.transform, "Back", KitArt.Quad(), "board", new Vector3(0, 0, 0.01f), new Vector3(3.2f, 2.1f, 1));
            var text = Label(board.transform, "Text", "Off-shift bunkroom", 3.0f, 1.95f, 0.9f, Color.white, TextAlignmentOptions.TopLeft, true);
            text.transform.localPosition = new Vector3(-0.45f, 0, 0);
            text.GetComponent<TextMeshPro>().rectTransform.sizeDelta = new Vector2(2.1f, 1.95f);
            stage.Object(text, key: "loungeText");
            stage.Ref(text);
            hudFields["loungeText"] = Text(text);
            // the starter (or the world's owner) may stop the match from here; anyone out of it may leave the station
            var abort = Button(board.transform, "Abort", "Stop match", new Vector3(1.1f, 0.6f, -0.005f), 0.8f, 0.24f, "buttonWarn", 0.75f);
            stage.Object(abort, key: "loungeAbortButton");
            stage.Event(abort, "click", hud, "ClickAbort");
            var leave = Button(board.transform, "Leave", "Leave the station", new Vector3(1.1f, 0.28f, -0.005f), 0.8f, 0.24f, "button", 0.75f);
            stage.Object(leave, key: "loungeLeaveButton");
            stage.Event(leave, "click", hud, "ClickLeave");
        }

        // ------------------------------------------------------------------ the boarding pad outside

        void Entry(Transform entry)
        {
            entry.localPosition = new Vector3(EntrySign.x, 0, EntrySign.y);
            var deck = new MeshPart();
            deck.Box(new Vector3(-2f, -0.05f, -3.2f), new Vector3(2f, 0.02f, 0.4f), 1f);
            DrawPart(entry, "Deck", deck, "pad", Vector3.zero);
            var sign = stage.Create("Sign", entry);
            sign.transform.localPosition = new Vector3(0, 1.6f, 0);
            Draw(sign.transform, "Back", KitArt.Quad(), "board", new Vector3(0, 0, 0.01f), new Vector3(2.4f, 1.1f, 1));
            var legs = new MeshPart();
            legs.Box(new Vector3(-1.15f, -1.6f, 0.02f), new Vector3(-1.05f, -0.55f, 0.1f), 1f);
            legs.Box(new Vector3(1.05f, -1.6f, 0.02f), new Vector3(1.15f, -0.55f, 0.1f), 1f);
            DrawPart(sign.transform, "Legs", legs, "fixture", Vector3.zero);
            var title = Label(sign.transform, "Text", "HIDDEN ROLE\nUndersea station: board here", 2.2f, 0.6f, 1.2f, Color.white);
            title.transform.localPosition = new Vector3(0, 0.2f, 0);
            var enter = Button(sign.transform, "Enter", "Enter the station", new Vector3(0, -0.32f, -0.005f), 1.2f, 0.28f, "button", 0.9f);
            StationButton(enter, "board", 0);
            stage.Object(enter, key: "enterButton");
        }

        // ------------------------------------------------------------------ the speaker and its two tones

        void Speaker(Transform audio, AudioClip[] tones)
        {
            var speaker = stage.Create("Speaker", audio);
            var source = speaker.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.spatialBlend = 0f;                                       // each page plays its own player's alert
            source.volume = 0.8f;
            var bsAudio = speaker.AddComponent(GraphTypes.Find("BS.BSAudioSource"));
            var so = new SerializedObject(bsAudio);
            var clips = so.FindProperty("clips");
            clips.arraySize = tones.Length;
            for (int i = 0; i < tones.Length; i++) clips.GetArrayElementAtIndex(i).objectReferenceValue = tones[i];
            var playOnAwake = so.FindProperty("playOnAwake");
            if (playOnAwake != null) playOnAwake.boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
            var variables = speaker.AddComponent<Variables>();
            var mirror = new AotList();
            foreach (var t in tones) mirror.Add(t);
            variables.declarations.Set(RelayGraph.ClipsVariable, mirror);
            stage.Object(speaker, key: "speaker");
            stage.Ref(speaker);
        }

        // ------------------------------------------------------------------ markers: the downed, the bots

        void Markers(Transform station)
        {
            var bodyParent = stage.Create("Bodies", station).transform;
            for (int i = 0; i < 10; i++)
            {
                var body = stage.Create("Body" + i, bodyParent);
                DrawPart(body.transform, "Disc", KitArt.Ring(0, 0.45f, 24, 0.015f), "downed", Vector3.zero);
                var cross = new MeshPart();
                cross.Add(Slab(0.7f, 0.03f, 0.11f), Matrix4x4.TRS(new Vector3(0, 0.03f, 0), Quaternion.Euler(0, 45, 0), Vector3.one));
                cross.Add(Slab(0.7f, 0.03f, 0.11f), Matrix4x4.TRS(new Vector3(0, 0.03f, 0), Quaternion.Euler(0, -45, 0), Vector3.one));
                DrawPart(body.transform, "Cross", cross, "downedMark", Vector3.zero);
                var box = body.AddComponent<BoxCollider>();
                box.center = new Vector3(0, 0.3f, 0);
                box.size = new Vector3(1.0f, 0.6f, 1.0f);
                StationButton(body, "body", i);
                stage.Object(body, key: "body" + i);
                stage.Ref(body);
                bodies.Add(stage.ObjectValue(body));
                body.SetActive(false);
            }
            var botParent = stage.Create("Bots", station).transform;
            for (int i = 0; i < 9; i++)
            {
                var bot = stage.Create("Bot" + i, botParent);
                var shape = new MeshPart();
                shape.Box(new Vector3(-0.17f, 0.25f, -0.17f), new Vector3(0.17f, 1.3f, 0.17f), 1f, true);
                shape.Box(new Vector3(-0.26f, 0.85f, -0.05f), new Vector3(0.26f, 0.95f, 0.05f), 1f, true);
                DrawPart(bot.transform, "Body", shape, "bot", Vector3.zero);
                var lamp = new MeshPart();
                lamp.Add(KitArt.Ring(0.2f, 0.32f, 20, 0.05f), Matrix4x4.identity);
                DrawPart(bot.transform, "Hover", lamp, "botLamp", Vector3.zero);
                Draw(bot.transform, "Lamp", KitArt.Sphere(false), "botLamp", new Vector3(0, 1.47f, 0), Vector3.one * 0.32f);
                for (int side = 0; side < 2; side++)
                {
                    var name = Label(bot.transform, side == 0 ? "Name" : "NameBack", "Bot " + (i + 1), 0.8f, 0.2f, 1.4f, KitArt.Sand);
                    name.transform.localPosition = new Vector3(0, 1.85f, 0);
                    name.transform.localRotation = Quaternion.Euler(0, side == 0 ? 0 : 180, 0);
                }
                var box = bot.AddComponent<BoxCollider>();
                box.center = new Vector3(0, 0.95f, 0);
                box.size = new Vector3(0.6f, 1.9f, 0.6f);
                StationButton(bot, "bot", i);
                stage.Object(bot, key: "bot" + i);
                stage.Ref(bot);
                bots.Add(stage.ObjectValue(bot));
                bot.SetActive(false);
            }
        }

        static MeshPart Slab(float w, float h, float d)
        {
            var p = new MeshPart();
            p.Box(new Vector3(-w / 2, -h / 2, -d / 2), new Vector3(w / 2, h / 2, d / 2), 1f);
            return p;
        }

        // ------------------------------------------------------------------ job consoles and fault panels

        /// <summary>Open floor for the rules at radius 0 (rooms and corridors, less cut-outs and props).</summary>
        bool Walkable(double x, double y)
        {
            int i = Array.BinarySearch(grid.Xs, x), j = Array.BinarySearch(grid.Ys, y);
            if (i < 0) i = ~i - 1;
            if (j < 0) j = ~j - 1;
            return grid.At(i, j) && !props.Any(p => p.Contains(x, y));
        }

        /// <summary>The direction (of eight) with the most open floor in front of `at`, up to 2.5 m: where a player stands.</summary>
        Vector2 OpenSide(Vector2 at)
        {
            Vector2 best = Vector2.up;
            float bestRun = -1;
            for (int k = 0; k < 8; k++)
            {
                var d = new Vector2(Mathf.Sin(k * Mathf.PI / 4), Mathf.Cos(k * Mathf.PI / 4));
                float run = 0;
                for (float s = 0.1f; s <= 2.5f && Walkable(at.x + d.x * s, at.y + d.y * s); s += 0.1f) run = s;
                if (k % 2 == 1) run -= 0.05f;                                           // straight over diagonal when equal
                if (run > bestRun) { bestRun = run; best = d; }
            }
            return best;
        }

        void Consoles(Transform station)
        {
            Transform parent = null;
            var hatches = map["hatches"].Select(h => Floats(h["at"])).Select(a => new Vector2(a[0], a[1])).ToList();
            var fixtures = new Dictionary<int, MeshPart>();
            foreach (var job in map["jobs"])
            {
                int id = (int)job["id"];
                var a = Floats(job["at"]);
                var at = new Vector2(a[0], a[1]);
                var face = OpenSide(at);
                // a hatch on the same spot (hatch 5 and console 14): the console steps back from it
                var base2 = at - face * 0.15f;
                if (hatches.Any(h => Vector2.Distance(h, at) < 1.0f)) base2 = at - face * 0.75f;
                var yaw = Quaternion.LookRotation(new Vector3(-face.x, 0, -face.y));      // local -Z (the readable side) toward the player
                var pos = new Vector3(base2.x, 0, base2.y);
                int g = Region(at.x, at.y);
                if (!fixtures.TryGetValue(g, out var part)) fixtures[g] = part = new MeshPart();
                part.Add(Slab(0.5f, 0.95f, 0.34f), Matrix4x4.TRS(pos + new Vector3(0, 0.475f, 0), yaw, Vector3.one));
                // the screen (the bound object: the page colours it), tilted back on the pedestal
                parent = regionRoots[g];
                var screen = Draw(parent, $"Console{id:00}", KitArt.Quad(), "screen", pos + yaw * new Vector3(0, 1.08f, -0.06f), new Vector3(0.46f, 0.32f, 1f),
                                  yaw * Quaternion.Euler(35, 0, 0));
                var box = screen.AddComponent<BoxCollider>();
                box.size = new Vector3(1.3f, 1.6f, 0.6f);                                   // in the screen's scaled units: 0.6 x 0.5 x 0.6 m
                StationButton(screen, "job", id);
                stage.Object(screen, key: "console" + id);
                stage.Ref(screen);
                consoles.Add(stage.ObjectValue(screen));
                var name = Label(parent, $"Label{id:00}", (string)job["name"] + "\n" + ((string)job["kind"]).ToUpperInvariant(), 0.9f, 0.24f, 0.55f, KitArt.Sand);
                name.transform.localPosition = pos + yaw * new Vector3(0, 1.45f, 0.05f);
                name.transform.localRotation = yaw;
            }
            foreach (var pair in fixtures) DrawPart(regionRoots[pair.Key], "Pedestals", pair.Value, "fixture", Vector3.zero);
        }

        void FaultPanels(Transform station)
        {
            int n = 0;
            var cabinetsBy = new Dictionary<int, MeshPart>();
            foreach (var p in map["panels"])
            {
                var a = Floats(p["at"]);
                var at = new Vector2(a[0], a[1]);
                var face = OpenSide(at);
                var yaw = Quaternion.LookRotation(new Vector3(-face.x, 0, -face.y));
                var pos = new Vector3(at.x - face.x * 0.2f, 0, at.y - face.y * 0.2f);
                int g = Region(at.x, at.y);
                var parent = regionRoots[g];
                if (!cabinetsBy.TryGetValue(g, out var cabinets)) cabinetsBy[g] = cabinets = new MeshPart();
                cabinets.Add(Slab(0.7f, 1.9f, 0.28f), Matrix4x4.TRS(pos + new Vector3(0, 0.95f, 0), yaw, Vector3.one));
                var front = Draw(parent, "Panel" + n, KitArt.Quad(), "fault", pos + yaw * new Vector3(0, 1.2f, -0.145f), new Vector3(0.58f, 0.9f, 1), yaw);
                var box = front.AddComponent<BoxCollider>();
                box.size = new Vector3(1.1f, 1.2f, 0.5f);
                StationButton(front, "panel", n);
                stage.Object(front, key: "faultPanel" + n);
                var label = Label(parent, "PanelLabel" + n, ((string)p["name"]).ToUpperInvariant() + " PANEL", 0.9f, 0.2f, 0.6f, Color.white);
                label.transform.localPosition = pos + yaw * new Vector3(0, 1.78f, -0.15f);
                label.transform.localRotation = yaw;
                n++;
            }
            foreach (var pair in cabinetsBy) DrawPart(regionRoots[pair.Key], "Cabinets", pair.Value, "fixture", Vector3.zero);
        }

        // ------------------------------------------------------------------ map reading

        static float[] Floats(JToken t) => t.Select(v => (float)v).ToArray();
        static MapRect R(float[] a) => new MapRect(a[0], a[1], a[2], a[3]);
    }
}
