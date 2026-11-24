using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using BS.SDKEditor;
using Newtonsoft.Json.Linq;
using Unity.EditorCoroutines.Editor;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// The hub project's side: one Altspace world for all the games, owned by one project, which is the only one
    /// signed in to the Builder and does every upload. Game projects only produce artifact folders (KitArtifacts).
    /// Nothing here does anything in a project without ProjectSettings/PortKitHub.json:
    ///
    ///   { "world": { "id": "&lt;worlds_id&gt;", "handle": "&lt;space_slug&gt;" },
    ///     "artifacts": ["C:/workspace/AltspaceGames/chess-table/altspace/dist", ...],
    ///     "grid": { "columns": 4, "gap": 2, "origin": [0, 0, 6] } }
    ///
    ///   PortKit/Hub/Preview Release              dry run: reads the artifact folders, checks every file against its manifest,
    ///                                            and says what each release step would send where. Sends nothing.
    ///   PortKit/Hub/Write Page                   the hub world's page: one bs-snippet element per kit in the snippet section of
    ///                                            Assets/WebRoot/index.html, on a grid made from the kits' footprints, and each
    ///                                            kit's script copied beside it
    ///   PortKit/Hub/Release/1 Bundles And Photos To CDN     (as FlightWorld's SnippetUpload, which has been run: bundles as
    ///   PortKit/Hub/Release/2 Scripts To World               &lt;slug&gt;-quest.bin and &lt;slug&gt;-windows.bin and the photo through
    ///   PortKit/Hub/Release/3 Create Or Update Snippets      UploadFile; the script as an Extra file of the world; POST
    ///                                                        /v2/snippets, later PATCH /v2/snippets/{id})
    ///
    /// The release steps are outward-facing and need a go-ahead per game: Library/PortKit/release_go.txt must read
    /// "&lt;world handle&gt;: &lt;slug&gt;, &lt;slug&gt;". Kits not named there are left alone. A snippet's slug can never be changed or
    /// used again once it exists. What was sent where is kept in release/manifest.json (checked in).
    /// Reports: Logs/portkit_release_preview.txt, Logs/portkit_release.txt (ends DONE or FAILED), Logs/portkit_hub_page.txt.
    /// </summary>
    public static class PortKitHub
    {
        public const string ConfigPath = "ProjectSettings/PortKitHub.json";
        public const string ManifestPath = "release/manifest.json";
        const string GoPath = PortKitRemote.Dir + "/release_go.txt";
        const string LogPath = "Logs/portkit_release.txt";
        const string CdnRoot = "https://cdn.sidequestvr.com/";
        const BindingFlags Any = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;

        // ------------------------------------------------------------------ what there is to release

        public sealed class Kit
        {
            public string Slug, Folder;
            public JObject Info;
            public readonly List<string> Problems = new List<string>();
            public string File(string name) => $"{Folder}/{name}";
            public string ScriptName => $"pk-{Slug}.js";
            public Vector3 Centre => Vector(Info["footprint"]?["center"]);
            public Vector3 Size => Vector(Info["footprint"]?["size"]);
            static Vector3 Vector(JToken t) => t is JArray a && a.Count == 3 ? new Vector3((float)a[0], (float)a[1], (float)a[2]) : Vector3.zero;
        }

        static JObject Config()
        {
            if (!File.Exists(ConfigPath)) throw new Exception($"this is not the hub project (no {ConfigPath})");
            return JObject.Parse(File.ReadAllText(ConfigPath));
        }

        static (string id, string handle) World(JObject config)
        {
            string id = (string)config["world"]?["id"] ?? "", handle = (string)config["world"]?["handle"] ?? "";
            if (id.Length == 0 || !System.Text.RegularExpressions.Regex.IsMatch(handle, "^[a-z0-9-]{4,}$"))
                throw new Exception($"{ConfigPath} needs world.id and world.handle (lower-case letters, digits and hyphens, four or more)");
            return (id, handle);
        }

        /// <summary>Every kit of every artifact folder, each file checked against its manifest (what is wrong is in Kit.Problems).</summary>
        public static List<Kit> Kits(JObject config)
        {
            var kits = new List<Kit>();
            foreach (var folder in (config["artifacts"] as JArray ?? new JArray()).Select(f => ((string)f).Replace('\\', '/').TrimEnd('/')))
            {
                string manifestPath = folder + "/manifest.json";
                if (!File.Exists(manifestPath)) { kits.Add(new Kit { Slug = "?", Folder = folder, Info = new JObject(), Problems = { "no manifest.json in " + folder } }); continue; }
                var manifest = JObject.Parse(File.ReadAllText(manifestPath));
                foreach (var p in (manifest["kits"] as JObject ?? new JObject()).Properties())
                {
                    var kit = new Kit { Slug = p.Name, Folder = folder, Info = (JObject)p.Value };
                    if (kits.Any(k => k.Slug == kit.Slug)) kit.Problems.Add("the slug is in two artifact folders");
                    var files = kit.Info["files"] as JObject ?? new JObject();
                    foreach (var needed in new[] { $"android/{kit.Slug}", $"windows/{kit.Slug}", kit.ScriptName, $"{kit.Slug}.jpg", $"{kit.Slug}.snippet.html" })
                    {
                        if (files[needed] == null || !File.Exists(kit.File(needed))) { kit.Problems.Add("missing " + needed); continue; }
                        if (KitArtifacts.Sha1(File.ReadAllBytes(kit.File(needed))) != (string)files[needed]["sha1"]) kit.Problems.Add(needed + " is not the file its manifest describes");
                    }
                    foreach (var check in (kit.Info["checks"] as JObject ?? new JObject()).Properties())
                        if ((string)check.Value != "PASS") kit.Problems.Add($"the {check.Name} bundle's kit check says {check.Value}");
                    if ((kit.Info["checks"] as JObject)?.Count != 2) kit.Problems.Add("not both bundles were checked");
                    kits.Add(kit);
                }
            }
            return kits.OrderBy(k => k.Slug, StringComparer.Ordinal).ToList();
        }

        static JObject Manifest() => File.Exists(ManifestPath) ? JObject.Parse(File.ReadAllText(ManifestPath)) : new JObject { ["kits"] = new JObject() };

        static void Save(JObject manifest)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ManifestPath));
            File.WriteAllText(ManifestPath, manifest.ToString(Newtonsoft.Json.Formatting.Indented) + "\n");
        }

        static JObject Entry(JObject manifest, string slug)
        {
            var kits = manifest["kits"] as JObject ?? (JObject)(manifest["kits"] = new JObject());
            return kits[slug] as JObject ?? (JObject)(kits[slug] = new JObject());
        }

        static (string key, string file, string name)[] CdnFiles(Kit kit) => new[]
        {
            ("android", kit.File($"android/{kit.Slug}"), $"{kit.Slug}-quest.bin"),
            ("windows", kit.File($"windows/{kit.Slug}"), $"{kit.Slug}-windows.bin"),
            ("photo", kit.File($"{kit.Slug}.jpg"), $"{kit.Slug}.jpg"),
        };

        static string ScriptAddress(string handle, Kit kit) => $"https://{handle}.worldspace.host/{kit.ScriptName}";

        /// <summary>
        /// The script as it is sent: the game's built script with one line in front that says where this kit's bundles
        /// are (README, "Kit load": window.__pk1_bundles[slug]). Null until both bundles have a CDN path.
        /// </summary>
        public static byte[] ScriptWithAddresses(Kit kit, JObject entry)
        {
            string windows = (string)entry?["windows"]?["path"], android = (string)entry?["android"]?["path"];
            if (windows == null || android == null) return null;
            string line = $"(window.__pk1_bundles=window.__pk1_bundles||{{}})[{CanonicalJson.String(kit.Slug)}]={{windows:{CanonicalJson.String(CdnRoot + windows)},android:{CanonicalJson.String(CdnRoot + android)}}};\n";
            return Encoding.UTF8.GetBytes(line + File.ReadAllText(kit.File(kit.ScriptName)));
        }

        static string Markup(Kit kit, string script) => File.ReadAllText(kit.File($"{kit.Slug}.snippet.html")).Replace(KitArtifacts.ScriptPlaceholder, script);

        static JObject SnippetBody(Kit kit, JObject entry, string script) => new JObject
        {
            ["name"] = (string)kit.Info["title"],
            ["description"] = (string)kit.Info["description"],
            ["image_url"] = (string)entry?["photo"]?["path"],
            ["code"] = Markup(kit, script),
        };

        static string Sha(JObject body) => KitArtifacts.Sha1(Encoding.UTF8.GetBytes(body.ToString(Newtonsoft.Json.Formatting.None)));

        /// <summary>The slugs Library/PortKit/release_go.txt gives the go-ahead for, for this world: "&lt;handle&gt;: slug, slug".</summary>
        static HashSet<string> GoAhead(string handle)
        {
            var slugs = new HashSet<string>();
            if (!File.Exists(GoPath)) return slugs;
            foreach (var line in File.ReadAllLines(GoPath))
            {
                var parts = line.Split(new[] { ':' }, 2);
                if (parts.Length == 2 && parts[0].Trim() == handle)
                    foreach (var slug in parts[1].Split(new[] { ',', ' ' }, StringSplitOptions.RemoveEmptyEntries)) slugs.Add(slug);
            }
            return slugs;
        }

        // ------------------------------------------------------------------ dry run

        [MenuItem("PortKit/Hub/Preview Release")]
        public static void Preview()
        {
            var text = new StringBuilder();
            try
            {
                var config = Config();
                var (id, handle) = World(config);
                var manifest = Manifest();
                var go = GoAhead(handle);
                text.AppendLine($"DRY RUN: nothing is sent. World {handle} ({id}); go-ahead in {GoPath}: {(go.Count == 0 ? "none" : string.Join(", ", go.OrderBy(s => s)))}");
                foreach (var kit in Kits(config))
                {
                    var entry = (manifest["kits"] as JObject)?[kit.Slug] as JObject;
                    text.AppendLine($"=== {kit.Slug}: \"{kit.Info["title"]}\" from {kit.Folder}{(go.Contains(kit.Slug) ? "" : "   [no go-ahead: the release steps would leave it alone]")}");
                    foreach (var problem in kit.Problems) text.AppendLine($"   PROBLEM: {problem}");
                    if (kit.Problems.Count > 0) continue;
                    foreach (var (key, file, name) in CdnFiles(kit))
                    {
                        var data = File.ReadAllBytes(file);
                        bool same = (string)entry?[key]?["sha"] == KitArtifacts.Sha1(data);
                        text.AppendLine($"   1 CDN     {(same ? "unchanged" : "SEND")} {name} ({data.Length / 1024f:F0} KiB){(same ? " at " + CdnRoot + entry[key]["path"] : "")}");
                    }
                    var script = ScriptWithAddresses(kit, entry);
                    string address = ScriptAddress(handle, kit);
                    if (script == null) text.AppendLine($"   2 script  waits for step 1 (the bundles' addresses go into it); then {kit.ScriptName} -> {address}");
                    else text.AppendLine($"   2 script  {((string)entry?["script"]?["sha"] == KitArtifacts.Sha1(script) ? "unchanged" : "SEND")} {kit.ScriptName} ({script.Length} bytes with its address line) -> {address} (an Extra file of the world)");
                    long snippet = (long?)entry?["snippet"] ?? 0;
                    var body = SnippetBody(kit, entry, address);
                    if (snippet == 0) text.AppendLine($"   3 snippet POST /v2/snippets with slug \"{kit.Slug}\" (for ever: a slug cannot be changed or used again)" + (body["image_url"].Type == JTokenType.Null ? "; waits for the photo's CDN path" : ""));
                    else text.AppendLine($"   3 snippet {((string)entry["snippet_sha"] == Sha(body) ? "unchanged" : "PATCH /v2/snippets/" + snippet)}");
                    text.AppendLine($"   name \"{body["name"]}\", description {((string)body["description"] ?? "").Length} characters, markup:");
                    foreach (var line in ((string)body["code"]).TrimEnd().Split('\n')) text.AppendLine("      " + line);
                }
                text.AppendLine("DONE");
            }
            catch (Exception e) { text.AppendLine("FAILED: " + e.Message); }
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/portkit_release_preview.txt", text.ToString());
        }

        // ------------------------------------------------------------------ the hub world's page

        [MenuItem("PortKit/Hub/Write Page")]
        public static void WritePage()
        {
            var report = new StringBuilder();
            try
            {
                var config = Config();
                var manifest = Manifest();
                var kits = Kits(config).Where(k => k.Problems.All(p => !p.StartsWith("missing") && !p.StartsWith("no manifest"))).ToList();
                int columns = Mathf.Max(1, (int?)config["grid"]?["columns"] ?? 4);
                float gap = (float?)config["grid"]?["gap"] ?? 2f;
                var o = config["grid"]?["origin"] as JArray;
                var origin = o != null && o.Count == 3 ? new Vector3((float)o[0], (float)o[1], (float)o[2]) : new Vector3(0f, 0f, 6f);

                // a grid of cells: each column as wide as its widest kit, each row as deep as its deepest; a kit's
                // footprint (not its origin) is centred in its cell, the first row nearest the origin, rows going away along +Z
                var widths = new float[columns];
                var depths = new List<float>();
                for (int i = 0; i < kits.Count; i++)
                {
                    widths[i % columns] = Mathf.Max(widths[i % columns], kits[i].Size.x);
                    if (i % columns == 0) depths.Add(0f);
                    depths[i / columns] = Mathf.Max(depths[i / columns], kits[i].Size.z);
                }
                float total = widths.Take(Mathf.Min(columns, kits.Count)).Sum() + gap * Mathf.Max(0, Mathf.Min(columns, kits.Count) - 1);
                var block = new StringBuilder();
                block.Append(BlockBegin + "\n");
                for (int i = 0; i < kits.Count; i++)
                {
                    int column = i % columns, row = i / columns;
                    float x = origin.x - total * 0.5f + widths.Take(column).Sum() + gap * column + widths[column] * 0.5f;
                    float z = origin.z + depths.Take(row).Sum() + gap * row + depths[row] * 0.5f;
                    var at = new Vector3(x - kits[i].Centre.x, origin.y, z - kits[i].Centre.z);
                    string position = FormattableString.Invariant($"{at.x:0.##} {at.y:0.##} {at.z:0.##}");
                    string markup = Markup(kits[i], kits[i].ScriptName).Replace("position=\"0 0 0\"", $"position=\"{position}\"");
                    foreach (var line in markup.TrimEnd().Split('\n')) block.Append("  ").Append(line.TrimEnd('\r')).Append('\n');

                    // the script beside the page: by name it is the same file the world serves once step 2 has sent it
                    var entry = (manifest["kits"] as JObject)?[kits[i].Slug] as JObject;
                    var script = ScriptWithAddresses(kits[i], entry);
                    File.WriteAllBytes($"Assets/WebRoot/{kits[i].ScriptName}", script ?? File.ReadAllBytes(kits[i].File(kits[i].ScriptName)));
                    report.AppendLine($"{kits[i].Slug}: at {position} (footprint {kits[i].Size.x:F1} x {kits[i].Size.z:F1} m)" +
                                      (script == null ? "; its script has no bundle addresses yet (they come with release step 1): in Play mode it loads nothing until then" : ""));
                }
                block.Append("  " + BlockEnd + "\n");

                const string indexPath = "Assets/WebRoot/index.html";
                string page = File.ReadAllText(indexPath);
                const string begin = "<!-- snippet section -->", end = "<!-- end snippet section -->";     // the SDK's own markers (SnippetHtmlSync)
                if (page.IndexOf(begin, StringComparison.Ordinal) < 0 || page.IndexOf(end, StringComparison.Ordinal) < 0)
                {
                    int body = page.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
                    if (body < 0) throw new Exception(indexPath + " has no </body>");
                    page = page.Substring(0, body) + "  " + begin + "\n  " + end + "\n" + page.Substring(body);
                }
                int from = page.IndexOf(BlockBegin, StringComparison.Ordinal), to = page.IndexOf(BlockEnd, StringComparison.Ordinal);
                if (from >= 0 && to > from)
                {
                    int lineStart = page.LastIndexOf('\n', from) + 1;
                    int lineEnd = page.IndexOf('\n', to);
                    page = page.Substring(0, lineStart) + page.Substring(lineEnd < 0 ? page.Length : lineEnd + 1);
                }
                int sectionEnd = page.IndexOf(end, StringComparison.Ordinal);
                int insertAt = page.LastIndexOf('\n', sectionEnd) + 1;
                page = page.Substring(0, insertAt) + "  " + block + page.Substring(insertAt);
                File.WriteAllText(indexPath, page);
                AssetDatabase.Refresh();
                report.AppendLine($"{kits.Count} elements written to the snippet section of {indexPath}");
                report.AppendLine("DONE");
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e.Message); }
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/portkit_hub_page.txt", report.ToString());
        }

        const string BlockBegin = "<!-- portkit hub: generated by PortKit/Hub/Write Page, do not edit -->";
        const string BlockEnd = "<!-- end portkit hub -->";

        // ------------------------------------------------------------------ the release itself (outward-facing: needs the go-ahead)

        static StringBuilder log;
        static bool running;

        static void Say(string line)
        {
            log.AppendLine(line);
            Directory.CreateDirectory("Logs");
            File.WriteAllText(LogPath, log.ToString());
        }

        static EditorWindow Builder()
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("BuilderWindow", false)).FirstOrDefault(t => t != null);
            return type == null ? null : Resources.FindObjectsOfTypeAll(type).OfType<EditorWindow>().FirstOrDefault();
        }

        /// <summary>The Builder's signed-in session, or null with the reason logged.</summary>
        static SqEditorAppApi Api()
        {
            var window = Builder();
            if (window == null) { Say("FAILED: the Builder window is not open (Creator SDK > Builder)"); return null; }
            var api = window.GetType().GetField("sq", Any)?.GetValue(window) as SqEditorAppApi;
            if (api == null || api.User == null) { Say("FAILED: the Builder is not signed in"); return null; }
            return api;
        }

        static void Start(Func<IEnumerator> work)
        {
            if (running) { Debug.LogWarning("[PortKit] a release step is already running"); return; }
            running = true;
            log = new StringBuilder();
            EditorCoroutineUtility.StartCoroutineOwnerless(Run(work()));
        }

        static IEnumerator Run(IEnumerator work)
        {
            // (stepped by hand so that an exception ends the run with a line in the log instead of silently)
            var stack = new Stack<IEnumerator>();
            stack.Push(work);
            while (stack.Count > 0)
            {
                bool more;
                try { more = stack.Peek().MoveNext(); }
                catch (Exception e) { Say("FAILED: " + e); break; }
                if (!more) { stack.Pop(); continue; }
                if (stack.Peek().Current is IEnumerator inner) stack.Push(inner);
                else yield return stack.Peek().Current;
            }
            running = false;
        }

        /// <summary>The kits a step may touch: sound artifacts, named in the go-ahead for this world, in a world this account owns.</summary>
        static IEnumerator Cleared(SqEditorAppApi api, Action<string, string, List<Kit>> then)
        {
            var config = Config();
            var (id, handle) = World(config);
            var go = GoAhead(handle);
            if (go.Count == 0) { Say($"FAILED: no go-ahead for world {handle} ({GoPath} must read \"{handle}: <slug>, <slug>\")"); yield break; }
            List<SqEditorWorld> worlds = null;
            Exception error = null;
            yield return api.ListWorlds(w => worlds = w, e => error = e);
            if (worlds == null || !worlds.Any(w => w.WorldId == id && w.Slug == handle))
            {
                Say($"FAILED: world {handle} ({id}) is not one of this account's worlds{(error != null ? ": " + error.Message : "")}");
                yield break;
            }
            var kits = new List<Kit>();
            foreach (var kit in Kits(config).Where(k => go.Contains(k.Slug)))
            {
                if (kit.Problems.Count > 0) Say($"FAILED {kit.Slug}: {string.Join("; ", kit.Problems)}");
                else kits.Add(kit);
            }
            foreach (var slug in go.Where(s => kits.All(k => k.Slug != s))) Say($"FAILED {slug}: named in the go-ahead, but no sound artifact folder has it");
            then(id, handle, kits);
        }

        [MenuItem("PortKit/Hub/Release/1 Bundles And Photos To CDN")]
        public static void Files() => Start(UploadFiles);

        static IEnumerator UploadFiles()
        {
            var api = Api();
            if (api == null) yield break;
            List<Kit> kits = null;
            yield return Cleared(api, (_, __, k) => kits = k);
            if (kits == null) { Say("FAILED"); yield break; }
            var manifest = Manifest();
            int sent = 0, kept = 0, failed = 0;
            foreach (var kit in kits)
            {
                var entry = Entry(manifest, kit.Slug);
                foreach (var (key, file, name) in CdnFiles(kit))
                {
                    var data = File.ReadAllBytes(file);
                    string sha = KitArtifacts.Sha1(data);
                    if ((string)entry[key]?["sha"] == sha) { kept++; continue; }
                    SqEditorCreateUpload done = null;
                    Exception error = null;
                    yield return api.UploadFile(name, data, null, u => done = u, e => error = e, null);
                    if (done == null || string.IsNullOrEmpty(done.Path))
                    {
                        Say($"FAILED {kit.Slug} {key}: {error?.Message ?? "no answer"}");
                        failed++;
                        continue;
                    }
                    entry[key] = new JObject { ["sha"] = sha, ["path"] = done.Path, ["file"] = done.FileId, ["bytes"] = data.Length };
                    Save(manifest);
                    sent++;
                    Say($"sent {kit.Slug} {key}: {data.Length / 1048576f:F1} MB -> {CdnRoot}{done.Path}");
                }
            }
            Say($"{sent} files sent, {kept} unchanged, {failed} failed");
            Say(failed == 0 && !log.ToString().Contains("FAILED") ? "DONE" : "FAILED");
        }

        [MenuItem("PortKit/Hub/Release/2 Scripts To World")]
        public static void Scripts() => Start(UploadScripts);

        static IEnumerator UploadScripts()
        {
            var api = Api();
            if (api == null) yield break;
            List<Kit> kits = null;
            string id = null, handle = null;
            yield return Cleared(api, (i, h, k) => { id = i; handle = h; kits = k; });
            if (kits == null) { Say("FAILED"); yield break; }
            var manifest = Manifest();
            manifest["world"] = new JObject { ["id"] = id, ["handle"] = handle };
            int sent = 0, kept = 0, failed = 0;
            foreach (var kit in kits)
            {
                var entry = Entry(manifest, kit.Slug);
                var data = ScriptWithAddresses(kit, entry);
                if (data == null) { Say($"FAILED {kit.Slug}: its bundles have not been sent yet (step 1)"); failed++; continue; }
                string sha = KitArtifacts.Sha1(data);
                string address = ScriptAddress(handle, kit);
                if ((string)entry["script"]?["sha"] == sha && (string)entry["script"]?["url"] == address) { kept++; continue; }
                bool ok = false;
                Exception error = null;
                // (the CDN has no type for JavaScript: a snippet's script has to be an Extra file of a world)
                yield return api.UploadFileToWorld(kit.ScriptName, data, id, handle, _ => ok = true, e => error = e, UploadAssetType.Extra, UploadAssetTypePlatform.Any, null);
                if (!ok) { Say($"FAILED {kit.Slug}: {kit.ScriptName} to {handle}: {error?.Message ?? "no answer"}"); failed++; continue; }
                entry["script"] = new JObject { ["sha"] = sha, ["url"] = address };
                Save(manifest);
                sent++;
                Say($"sent {kit.ScriptName} ({data.Length} bytes) -> {address}");
            }
            Say($"{sent} scripts sent, {kept} unchanged, {failed} failed");
            Say(failed == 0 && !log.ToString().Contains("FAILED") ? "DONE" : "FAILED");
        }

        [MenuItem("PortKit/Hub/Release/3 Create Or Update Snippets")]
        public static void Snippets() => Start(UploadSnippets);

        static IEnumerator UploadSnippets()
        {
            var api = Api();
            if (api == null) yield break;
            List<Kit> kits = null;
            yield return Cleared(api, (_, __, k) => kits = k);
            if (kits == null) { Say("FAILED"); yield break; }
            var manifest = Manifest();
            var send = typeof(SqEditorAppApi).GetMethod("JsonPost", Any).MakeGenericMethod(typeof(JObject));
            int created = 0, updated = 0, kept = 0, failed = 0;
            foreach (var kit in kits)
            {
                var entry = Entry(manifest, kit.Slug);
                string script = (string)entry["script"]?["url"];
                if (script == null || entry["photo"] == null || entry["windows"] == null || entry["android"] == null)
                {
                    Say($"FAILED {kit.Slug}: its files and script have not all been sent (steps 1 and 2)");
                    failed++;
                    continue;
                }
                var body = SnippetBody(kit, entry, script);
                string sha = Sha(body);
                long id = (long?)entry["snippet"] ?? 0;
                if (id > 0 && (string)entry["snippet_sha"] == sha) { kept++; continue; }
                if (id == 0) body["slug"] = kit.Slug;
                JObject answer = null;
                Exception error = null;
                yield return (IEnumerator)send.Invoke(api, new object[]
                {
                    id == 0 ? "/v2/snippets" : $"/v2/snippets/{id}", body, (Action<JObject>)(r => answer = r), (Action<Exception>)(e => error = e),
                    true, false, id == 0 ? "POST" : "PATCH",
                });
                long got = (long?)answer?["snippets_id"] ?? 0;
                if (got == 0)
                {
                    Say($"FAILED {kit.Slug}: {error?.Message ?? answer?.ToString(Newtonsoft.Json.Formatting.None) ?? "no answer"}");
                    failed++;
                    continue;
                }
                entry["snippet"] = got;
                entry["snippet_sha"] = sha;
                Save(manifest);
                if (id == 0) created++; else updated++;
                Say($"{(id == 0 ? "created" : "updated")} {kit.Slug}: snippet {got}, slug {answer["slug"]}");
            }
            Say($"{created} created, {updated} updated, {kept} unchanged, {failed} failed");
            Say(failed == 0 && !log.ToString().Contains("FAILED") ? "DONE" : "FAILED");
        }
    }
}
