using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// Loads kits the way a stranger's world would, in Play mode, and collects what the page reports (generalised from
    /// FlightWorld's KitPlayTest.cs): hand-written bs-snippet elements are put into the page, the snippet's script and
    /// the bundles come from the test server (TestServer), and the page's own test code prints lines that end up in a log.
    ///
    ///   Library/PortKit/playtest.json    { "name": "s1", "elements": ["&lt;bs-snippet ...&gt;&lt;/bs-snippet&gt;", ...],
    ///                                      "timeout": 240, "players": 1 }
    ///                                    {SERVER} in an element is the test server's address (http://localhost:&lt;page port + 100&gt;)
    ///   PortKit/Test/Arm Kit Test        puts the elements into Assets/WebRoot/index.html (the page is kept aside), starts
    ///                                    the test server; then enter Play mode
    ///   PortKit/Test/Restore Page        puts the page back by hand (a finished or timed-out test does it itself)
    ///
    /// The page's test code talks through the console (console.log lines reach the editor's log):
    ///   PKTEST PASS &lt;what&gt;: &lt;detail&gt;     PKTEST FAIL &lt;what&gt;: &lt;detail&gt;     PKTEST INFO &lt;anything&gt;
    ///   PKTEST CMD &lt;id&gt; &lt;command&gt; &lt;args...&gt;   asks the editor to do something only it can (see Commands); the answer
    ///                                          comes back as window.__pktest.reply("&lt;id&gt;", "&lt;text&gt;")
    ///   PKTEST DONE                        this player's page has finished
    ///
    /// Every player (the main editor and each Multiplayer Play Mode player) writes its lines to
    /// Logs/portkit_playtest_&lt;name&gt;_&lt;player&gt;.txt in the main project as they come. When every player has said DONE, or
    /// at the timeout, the main editor writes Logs/portkit_playtest_&lt;name&gt;.txt (every player's lines, the console's
    /// errors, "RESULT n passed, m failed", DONE or TIMEOUT), puts the page back and leaves Play mode.
    /// </summary>
    [InitializeOnLoad]
    public static class KitPlayTest
    {
        const string IndexPath = "Assets/WebRoot/index.html";
        static string ConfigPath => PlayPort.MainRoot + "/" + PortKitRemote.Dir + "/playtest.json";
        static string ArmedPath => PlayPort.MainRoot + "/" + PortKitRemote.Dir + "/playtest_armed.json";
        static string BackupPath => PlayPort.MainRoot + "/" + PortKitRemote.Dir + "/index.html.playtest_backup";
        static string PlayerLog(string name, string player) => $"{PlayPort.MainRoot}/Logs/portkit_playtest_{name}_{player}.txt";
        static string FinalLog(string name) => $"{PlayPort.MainRoot}/Logs/portkit_playtest_{name}.txt";

        /// <summary>
        /// What a page may ask of the editor: command name -> handler(arguments, reply). A handler is stepped once per
        /// editor update until it ends, and calls reply once with a short text. Games add their own here from an
        /// [InitializeOnLoad] class of their kit's editor folder.
        /// </summary>
        public static readonly Dictionary<string, Func<string[], Action<string>, IEnumerator>> Commands =
            new Dictionary<string, Func<string[], Action<string>, IEnumerator>>();

        static JObject armed;
        static double started = -1;
        static bool sawDone, hooked;
        static readonly List<string> pending = new List<string>();
        static readonly List<string> console = new List<string>();
        static readonly List<IEnumerator> running = new List<IEnumerator>();

        static KitPlayTest()
        {
            InputSim.Register();
            // shot <name> <from x y z> <at x y z> [fov]: a picture of the scene as it is now, Library/PortKit/shots/<test>_<name>.jpg
            Commands["shot"] = (a, reply) =>
            {
                string fov = a.Length > 7 ? a[7] : "60";
                PortKitRemote.Shot($"{Name}_{a[0]};{a[1]},{a[2]},{a[3]};{a[4]},{a[5]},{a[6]};{fov}");
                reply($"{PortKitRemote.Dir}/shots/{Name}_{a[0]}.jpg");
                return null;
            };
            if (File.Exists(ArmedPath)) Hook();
        }

        /// <summary>"live": true in the test's description: the published script and the bundles it names, nothing from this machine.</summary>
        static bool Live => (bool?)armed?["live"] ?? false;

        static void Hook()
        {
            try { armed = JObject.Parse(File.ReadAllText(ArmedPath)); }
            catch (Exception) { armed = null; return; }
            if (!PlayPort.IsClone && !Live) TestServer.Start();
            if (hooked) return;
            hooked = true;
            EditorApplication.update += Tick;
            Application.logMessageReceived += OnLog;
        }

        static void Unhook()
        {
            hooked = false;
            armed = null;
            EditorApplication.update -= Tick;
            Application.logMessageReceived -= OnLog;
        }

        static string Name => (string)armed?["name"] ?? "test";

        static void OnLog(string message, string stack, LogType type)
        {
            if (!EditorApplication.isPlaying) return;
            int at = message.IndexOf("PKTEST ", StringComparison.Ordinal);
            if (at >= 0)
            {
                string line = message.Substring(at).Split('\n')[0].TrimEnd();
                pending.Add(line);
                if (line.StartsWith("PKTEST DONE")) sawDone = true;
                if (line.StartsWith("PKTEST CMD ")) Run(line.Substring("PKTEST CMD ".Length));
            }
            else if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
            {
                if (console.Count < 80) console.Add($"[{type}] {message.Split('\n')[0]}" + (type == LogType.Exception ? " | " + stack.Split('\n').FirstOrDefault() : ""));
            }
        }

        static void Run(string command)
        {
            var parts = command.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return;
            string id = parts[0], name = parts[1];
            bool replied = false;
            void Reply(string text)
            {
                if (replied) return;
                replied = true;
                pending.Add($"PKTEST REPLY {id} {text}");
                Evaluate($"window.__pktest&&window.__pktest.reply({CanonicalJson.String(id)},{CanonicalJson.String(text ?? "")})");
            }
            if (!Commands.TryGetValue(name, out var handler)) { Reply("error: no such command"); return; }
            IEnumerator Guarded()
            {
                IEnumerator inner;
                try { inner = handler(parts.Skip(2).ToArray(), Reply); }
                catch (Exception e) { Reply("error: " + e.Message); yield break; }
                while (true)
                {
                    bool more;
                    try { more = inner != null && inner.MoveNext(); }
                    catch (Exception e) { Reply("error: " + e.Message); yield break; }
                    if (!more) break;
                    yield return null;
                }
                Reply("ok");
            }
            running.Add(Guarded());
        }

        /// <summary>Run script in the world's page (the same call the SDK's "Inject BullSchript" node makes).</summary>
        public static void Evaluate(string script)
        {
            try { BS.BSScene.Instance().link.pipe.view.EvaluateJS(script, _ => { }); }
            catch (Exception e) { pending.Add("PKTEST INFO editor could not run script in the page: " + e.Message); }
        }

        [MenuItem("PortKit/Test/Arm Kit Test")]
        public static void Arm()
        {
            Directory.CreateDirectory("Logs");
            try
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode) throw new Exception("leave Play mode first");
                if (PlayPort.IsClone) throw new Exception("arm the test in the main editor");
                var config = JObject.Parse(File.ReadAllText(ConfigPath));
                string name = (string)config["name"] ?? "test";
                if (!File.Exists(BackupPath)) File.Copy(IndexPath, BackupPath);
                string page = File.ReadAllText(BackupPath);
                bool live = (bool?)config["live"] ?? false;
                var elements = new StringBuilder();
                foreach (var element in (JArray)config["elements"] ?? new JArray())
                {
                    if (live && ((string)element).Contains("{SERVER}")) throw new Exception("a live test names the published script and no bundles: no {SERVER} in its elements");
                    // A bundle's address names its content ("?v=<start of its sha1>"): the SDK keeps downloaded bundles by address,
                    // and a rebuilt kit under the old address is answered from that cache (seen: one HEAD request, no GET).
                    string text = System.Text.RegularExpressions.Regex.Replace((string)element, @"\{SERVER\}/kits/([^""?\s]+)", m =>
                    {
                        string file = $"{PlayPort.MainRoot}/{KitBundles.BundleRoot}/{m.Groups[1].Value}";
                        return File.Exists(file) ? $"{m.Value}?v={KitArtifacts.Sha1(File.ReadAllBytes(file)).Substring(0, 10)}" : m.Value;
                    });
                    elements.Append("  ").Append(text.Replace("{SERVER}", TestServer.Address)).Append('\n');
                }
                int body = page.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
                if (body < 0) throw new Exception(IndexPath + " has no </body>");
                File.WriteAllText(IndexPath, page.Substring(0, body) + elements + page.Substring(body));
                foreach (var old in Directory.GetFiles(PlayPort.MainRoot + "/Logs", $"portkit_playtest_{name}*.txt")) File.Delete(old);
                File.WriteAllText(ArmedPath, config.ToString());
                Hook();
                File.WriteAllText("Logs/portkit_playtest_arm.txt", $"armed '{name}': {((JArray)config["elements"])?.Count ?? 0} elements, " +
                    (live ? "LIVE (the published script and the bundles it names)" : $"test server {TestServer.Address} ({(TestServer.Running ? "running" : "NOT RUNNING")})") +
                    $", page port {PlayPort.Port}\nDONE\n");
            }
            catch (Exception e) { File.WriteAllText("Logs/portkit_playtest_arm.txt", "FAILED: " + e.Message + "\n"); }
        }

        [MenuItem("PortKit/Test/Restore Page")]
        public static void Restore()
        {
            if (PlayPort.IsClone) return;
            if (File.Exists(BackupPath))
            {
                File.Copy(BackupPath, IndexPath, true);
                File.Delete(BackupPath);
            }
            if (File.Exists(ArmedPath)) File.Delete(ArmedPath);
            TestServer.Stop();
            Unhook();
        }

        static void Flush()
        {
            if (pending.Count == 0 || armed == null) return;
            try
            {
                File.AppendAllLines(PlayerLog(Name, PlayPort.PlayerTag), pending);
                pending.Clear();
            }
            catch (IOException) { /* being read; next tick */ }
        }

        static void Tick()
        {
            if (!File.Exists(ArmedPath)) { Unhook(); return; }             // the main editor finished the test
            if (!EditorApplication.isPlaying) { started = -1; return; }
            double now = EditorApplication.timeSinceStartup;
            if (started < 0)
            {
                started = now;
                sawDone = false;
                pending.Clear();
                console.Clear();
                running.Clear();
                pending.Add($"PKTEST INFO {PlayPort.PlayerTag} in Play, page port {PlayPort.Port}");
            }
            for (int i = running.Count - 1; i >= 0; i--)
            {
                bool more;
                try { more = running[i].MoveNext(); }
                catch (Exception e) { more = false; pending.Add("PKTEST INFO command failed: " + e.Message); }
                if (!more) running.RemoveAt(i);
            }
            Flush();
            if (PlayPort.IsClone) return;

            int players = (int?)armed["players"] ?? 1;
            double timeout = (double?)armed["timeout"] ?? 240;
            bool everyone = sawDone;
            if (everyone && players > 1)
            {
                var others = Directory.GetFiles(PlayPort.MainRoot + "/Logs", $"portkit_playtest_{Name}_vp-*.txt");
                everyone = others.Length >= players - 1 && others.All(f => ReadShared(f).Contains("PKTEST DONE"));
            }
            if (everyone || now - started > timeout) Finish(everyone);
        }

        static string ReadShared(string path)
        {
            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var reader = new StreamReader(stream)) return reader.ReadToEnd();
            }
            catch (IOException) { return ""; }
        }

        static void Finish(bool complete)
        {
            string name = Name;
            Flush();
            var log = new StringBuilder();
            log.AppendLine(Live ? "LIVE: the published script and the bundles it names" : $"local: script and bundles from the test server {TestServer.Address}");
            // pictures the test's description asks for: "shots": [{ "name": "all", "from": [x, y, z], "at": [x, y, z], "fov": 60 }]
            foreach (var shot in armed?["shots"] as JArray ?? new JArray())
            {
                try
                {
                    string V(string key) => string.Join(",", ((JArray)shot[key]).Select(n => ((double)n).ToString(CultureInfo.InvariantCulture)));
                    PortKitRemote.Shot($"{name}_{shot["name"]};{V("from")};{V("at")};{((double?)shot["fov"] ?? 60).ToString(CultureInfo.InvariantCulture)}");
                    log.AppendLine($"picture: {PortKitRemote.Dir}/shots/{name}_{shot["name"]}.jpg");
                }
                catch (Exception e) { log.AppendLine($"picture {shot["name"]} failed: {e.Message}"); }
            }
            int passed = 0, failed = 0;
            foreach (var file in Directory.GetFiles(PlayPort.MainRoot + "/Logs", $"portkit_playtest_{name}_*.txt").OrderBy(f => f, StringComparer.Ordinal))
            {
                string player = Path.GetFileNameWithoutExtension(file).Substring($"portkit_playtest_{name}_".Length);
                foreach (var line in ReadShared(file).Split('\n').Select(l => l.TrimEnd()).Where(l => l.Length > 0))
                {
                    if (line.StartsWith("PKTEST PASS")) passed++;
                    if (line.StartsWith("PKTEST FAIL")) failed++;
                    log.AppendLine($"[{player}] {line.Substring("PKTEST ".Length)}");
                }
            }
            log.AppendLine($"served: {string.Join(", ", TestServer.Hits.OrderBy(h => h.Key, StringComparer.Ordinal).Select(h => $"{h.Key} x{h.Value}"))}");
            log.AppendLine($"console (main editor): {console.Count} error lines");
            foreach (var line in console.Distinct().Take(40)) log.AppendLine("   " + (line.Length > 300 ? line.Substring(0, 300) : line));
            log.AppendLine($"RESULT {passed} passed, {failed} failed");
            log.AppendLine(complete ? "DONE" : "TIMEOUT");
            File.WriteAllText(FinalLog(name), log.ToString());
            started = -1;
            InputSim.Release();
            Restore();
            EditorApplication.isPlaying = false;
        }
    }
}
