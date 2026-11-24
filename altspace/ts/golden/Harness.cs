// Golden vectors for the hidden-role game: the upstream rule methods (copied unchanged into gen/Upstream.g.cs by
// extract.ts), compiled with dotnet against UnityStubs.cs and driven through gen/Bridge.g.cs. Writes the JSON file named
// on the command line; test/golden.test.ts plays the same inputs through the TypeScript.
//
//   npm run golden      (node golden/extract.ts, then dotnet run --project golden -c Release -- vectors/upstream.json)
//
// Every case list is enumerated in the same order on both sides; results are compact strings or arrays.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

static class Harness
{
    static string F(float v) => v.ToString("R", CultureInfo.InvariantCulture);

    static int Main(string[] args)
    {
        var outPath = args.Length > 0 ? args[0] : "vectors/upstream.json";
        var mapPath = args.Length > 1 ? args[1] : "src/station-map.json";
        var o = new JsonObject();

        // G9: the vote tally. Five voters (numbers 1..5), each casting no ballot (0) or one for -1 (abstain) or 1..4.
        var votes = new StringBuilder();
        var choices = new[] { 0, -1, 1, 2, 3, 4 };
        for (var code = 0; code < 7776; code++)
        {
            var ballots = new List<int[]>();
            var c = code;
            for (var voter = 1; voter <= 5; voter++) { var pick = choices[c % 6]; c /= 6; if (pick != 0) ballots.Add(new[] { voter, pick }); }
            var r = Eject(ballots);
            votes.Append(r == -1 ? 'S' : (char)('0' + r));
        }
        o["votes"] = votes.ToString();

        // G12: the win check. 1..4 players, each a technician (role 1) or the hidden role (2), alive or not, with three jobs
        // done or two of three; then the clock state (none, running, run out) and the wave state, with and without a cut-in.
        UnityEngine.Time.time = 100f;
        var win = new StringBuilder();
        for (var n = 1; n <= 4; n++)
        {
            var combos = 1 << (3 * n);
            for (var code = 0; code < combos; code++)
            {
                var roles = new int[n]; var alive = new bool[n]; var assigned = new int[n]; var completed = new int[n];
                for (var i = 0; i < n; i++)
                {
                    var bits = (code >> (3 * i)) & 7;
                    roles[i] = (bits & 1) != 0 ? 2 : 1;
                    alive[i] = (bits & 2) != 0;
                    assigned[i] = 7;
                    completed[i] = (bits & 4) != 0 ? 7 : 3;
                }
                foreach (var pending in new[] { false, true })
                foreach (var deadline in new[] { 0f, 150f, 50f })
                foreach (var waves in new[] { 2, 1 })
                {
                    var r = Win(roles, alive, assigned, completed, pending, deadline, waves, 2);
                    win.Append(r == "0 none" ? '-' : r == "1 end:1" ? 'T' : r == "1 end:2" ? 'H' : r == "1 cutin" ? 'X' : '?');
                }
            }
        }
        o["win"] = win.ToString();

        // G10: dealing. Seeded shuffle of 4..10 players, then five jobs of 22 for each, in that order of draws.
        var deal = new JsonArray();
        for (uint seed = 1; seed <= 60; seed++)
        for (var n = 4; n <= 10; n++)
        {
            UnityEngine.Random.InitState(seed * 100 + (uint)n);
            var arr = new JsonArray();
            foreach (var v in Deal(n, 5, 22)) arr.Add(v);
            deal.Add(arr);
        }
        o["deal"] = deal;

        // The elimination cooldown: 10 s from each kill, ready when the remainder is 0.
        var cooldown = new JsonArray();
        foreach (var last in new[] { -10f, 0f, 3.5f, 7f })
        foreach (var now in new[] { 0f, 5f, 9.99f, 10f, 13.5f, 17f, 20f })
        {
            UnityEngine.Time.time = now;
            cooldown.Add(new JsonArray(F(KillRemaining(10f, last)), KillReady(10f, last)));
        }
        o["cooldown"] = cooldown;

        // G11: the three job kinds as streams of (seconds, held). Result: "<step it completed on or -1> <progress left>".
        var channels = new JsonArray();
        foreach (var (kind, bot, dts, held) in ChannelCases())
            channels.Add(Channel(kind, bot, dts, held));
        o["channels"] = channels;

        // G1, G2, G3, G5, G14: the map, read from the port's own map file (same rectangles as upstream).
        var map = JsonNode.Parse(File.ReadAllText(mapPath))!;
        float[] A(JsonNode n) { var a = n.AsArray(); var r = new float[a.Count]; for (var i = 0; i < r.Length; i++) r[i] = (float)a[i]!.GetValue<double>(); return r; }
        float[][] AA(JsonNode n, Func<JsonNode, JsonNode> pick) { var a = n.AsArray(); var r = new float[a.Count][]; for (var i = 0; i < r.Length; i++) r[i] = A(pick(a[i]!)); return r; }
        var obstacles = new List<float[]>(AA(map["cuts"]!, x => x));
        obstacles.AddRange(AA(map["props"]!, x => x["rect"]!));
        var hatches = map["hatches"]!.AsArray();
        var ventGroups = new string[hatches.Count];
        for (var i = 0; i < ventGroups.Length; i++) ventGroups[i] = hatches[i]!["group"]!.GetValue<string>();
        LoadMap(A(map["playBounds"]!), AA(map["rooms"]!, x => x["rect"]!), AA(map["corridors"]!, x => x), obstacles.ToArray(), AA(map["waypoints"]!, x => x), A(map["muster"]!), AA(map["hatches"]!, x => x["at"]!), ventGroups);

        var blocked = new StringBuilder();
        foreach (var r in new[] { 0.18f, 0.5f })
            for (var x = -75f; x <= 75f; x += 0.5f)
                for (var y = -58f; y <= 58f; y += 0.5f)
                    blocked.Append(Blocked(x, y, r) ? '1' : '0');
        o["blocked"] = blocked.ToString();

        UnityEngine.Random.InitState(4242);
        var segments = new StringBuilder();
        var segmentInputs = new JsonArray();
        for (var i = 0; i < 3000; i++)
        {
            var a = RandomPoint(); var b = RandomPoint();
            if (i % 3 == 0) { b[0] = a[0] + UnityEngine.Random.Range(-4f, 4f); b[1] = a[1] + UnityEngine.Random.Range(-4f, 4f); }
            segmentInputs.Add(new JsonArray(F(a[0]), F(a[1]), F(b[0]), F(b[1])));
            segments.Append(Segment(a[0], a[1], b[0], b[1], 0.18f) ? '1' : '0');
        }
        o["segmentInputs"] = segmentInputs;
        o["segments"] = segments.ToString();

        UnityEngine.Random.InitState(99);
        var walks = new JsonArray();
        for (var w = 0; w < 40; w++)
        {
            var p = RandomPoint();
            var path = new JsonArray(F(p[0]), F(p[1]));
            for (var s = 0; s < 100; s++)
            {
                var dx = UnityEngine.Random.Range(-0.3f, 0.3f); var dy = UnityEngine.Random.Range(-0.3f, 0.3f);
                p = Resolve(p[0], p[1], dx, dy, 0.5f);
                path.Add(F(dx)); path.Add(F(dy)); path.Add(F(p[0])); path.Add(F(p[1]));
            }
            walks.Add(path);
        }
        o["walks"] = walks;

        var nav = new JsonArray();
        var spawns = map["spawns"]!.AsArray();
        var jobs = map["jobs"]!.AsArray();
        foreach (var s in spawns)
            foreach (var j in jobs)
            {
                var a = A(s!); var b = A(j!["at"]!);
                var t = Nav(a[0], a[1], b[0], b[1]);
                nav.Add(new JsonArray(F(t[0]), F(t[1])));
            }
        o["nav"] = nav;

        UnityEngine.Random.InitState(7);
        var randomPoints = new JsonArray();
        for (var i = 0; i < 50; i++) { var p = RandomPoint(); randomPoints.Add(new JsonArray(F(p[0]), F(p[1]))); }
        o["randomPoints"] = randomPoints;

        var next = new JsonArray();
        for (var i = 0; i < hatches.Count; i++) next.Add(NextVent(i));
        o["nextHatch"] = next;

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath))!);
        File.WriteAllText(outPath, o.ToJsonString() + "\n");
        Console.WriteLine($"wrote {outPath}");
        return 0;
    }

    /// The same list as channelCases() in test/golden.test.ts.
    static IEnumerable<(int, bool, float[], bool[])> ChannelCases()
    {
        // Hold: the whole hold in one stretch, in two, broken by a release, and as a bot.
        foreach (var d in new[] { 1.3f, 1.34f, 1.35f, 1.36f, 2f })
            yield return (0, false, new[] { 0f, d }, new[] { true, true });
        yield return (0, false, new[] { 0f, 0.675f, 0.675f }, new[] { true, true, true });
        yield return (0, false, new[] { 0f, 0.7f, 0.2f, 0f, 0.7f }, new[] { true, true, false, true, true });
        var ticks = new List<float>(); var held = new List<bool>();
        for (var i = 0; i < 40; i++) { ticks.Add(0.05f); held.Add(true); }
        yield return (0, true, ticks.ToArray(), held.ToArray());
        // Tap: presses as press/release pairs; three, four, five; and a bot holding.
        foreach (var presses in new[] { 3, 4, 5 })
        {
            var dts = new List<float>(); var h = new List<bool>();
            for (var i = 0; i < presses; i++) { dts.Add(0.1f); h.Add(true); dts.Add(0.1f); h.Add(false); }
            yield return (1, false, dts.ToArray(), h.ToArray());
        }
        yield return (1, true, ticks.ToArray(), held.ToArray());
        // Timing: hold for a time, then release; the band is 70% to 82% of a 2.2 s cycle.
        foreach (var d in new[] { 1.5f, 1.518f, 1.55f, 1.65f, 1.8f, 1.81f, 1.83f, 2.19f, 3.75f, 4.0f })
            yield return (2, false, new[] { 0f, d, 0f }, new[] { true, true, false });
        yield return (2, false, new[] { 0f, 1.0f, 0f, 0f, 1.65f, 0f }, new[] { true, true, false, true, true, false });
        yield return (2, true, ticks.ToArray(), held.ToArray());
    }
}
