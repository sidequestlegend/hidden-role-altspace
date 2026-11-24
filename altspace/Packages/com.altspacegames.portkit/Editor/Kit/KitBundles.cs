using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// A kit's two asset bundles (Quest and Windows), and the checks a kit has to pass before anything is uploaded
    /// (generalised from FlightWorld's SnippetKits.BuildBundles).
    ///
    ///   PortKit/Kit/Build Bundles    Library/PortKit/kits/{android,windows}/&lt;slug&gt;, one build per kit, each run through the
    ///                                app's own check of a kit bundle (BS.Security.BundleChecker with its kit rules)
    ///   PortKit/Kit/Check            the edit-mode rung: the SDK's graph check finds no node the app will not run, every
    ///                                bundle's verdict is PASS, the bindings on disk match the prefab
    /// Reports: Logs/portkit_bundles.txt and Logs/portkit_check.txt, each ending with DONE or FAILED.
    /// </summary>
    public static class KitBundles
    {
        public const string BundleRoot = PortKitRemote.Dir + "/kits";
        const string LogPath = "Logs/portkit_bundles.txt";
        const string CheckLogPath = "Logs/portkit_check.txt";

        public static readonly (BuildTarget target, string folder)[] Targets =
        {
            (BuildTarget.Android, "android"),
            (BuildTarget.StandaloneWindows64, "windows"),
        };

        public static string BundlePath(string folder, string slug) => $"{BundleRoot}/{folder}/{slug}";

        [MenuItem("PortKit/Kit/Build Bundles")]
        public static void BuildBundles()
        {
            var report = new StringBuilder();
            bool ok = true;
            try
            {
                // One build per kit: each bundle then holds everything its kit needs, and the licence notices can go into
                // every one (an asset may be named for one bundle only in a build).
                var kits = KitBuilder.Chosen().Where(k => File.Exists(k.PrefabPath)).ToList();
                if (kits.Count == 0) { report.AppendLine("no kit prefab to build (PortKit/Kit/Build Prefabs first)"); ok = false; }
                foreach (var (target, folder) in Targets)
                {
                    string output = $"{BundleRoot}/{folder}";
                    Directory.CreateDirectory(output);
                    foreach (var kit in kits)
                    {
                        var assets = new List<string> { kit.PrefabPath };
                        if (kit.NoticesPath != null) assets.Add(kit.NoticesPath);
                        var build = new AssetBundleBuild { assetBundleName = kit.Slug, assetNames = assets.ToArray() };
                        var manifest = BuildPipeline.BuildAssetBundles(output, new[] { build }, BuildAssetBundleOptions.ChunkBasedCompression, target);
                        string file = BundlePath(folder, kit.Slug);
                        if (manifest == null || !File.Exists(file)) { report.AppendLine($"FAILED {folder} {kit.Slug}: no bundle"); ok = false; continue; }
                        var verdict = Check(file);
                        if (!verdict.passed) ok = false;
                        report.AppendLine($"{folder} {kit.Slug}: {new FileInfo(file).Length / 1024f:F0} KiB, {(kit.NoticesPath != null ? "with notices" : "NO NOTICES FILE")}; check: {verdict.text}");
                        Write(LogPath, report);
                    }
                }
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); ok = false; }
            report.AppendLine(ok ? "DONE" : "FAILED");
            Write(LogPath, report);
        }

        static void Write(string path, StringBuilder report)
        {
            Directory.CreateDirectory("Logs");
            File.WriteAllText(path, report.ToString());
        }

        /// <summary>The app's own check of a kit bundle before it loads one (BS.Security.BundleChecker, kit rules): pass or refuse, and why.</summary>
        public static (bool passed, string text) Check(string file)
        {
            try
            {
                const BindingFlags any = BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
                var checker = GraphTypes.Find("BS.Security.BundleChecker");
                var options = GraphTypes.Find("BS.Security.BundleCheckOptions");
                var kitOptions = options.GetMethod("Kit", any).Invoke(null, null);
                var check = checker.GetMethods(any).First(m => m.Name == "Check" && m.GetParameters().Length == 3 && m.GetParameters()[0].ParameterType == typeof(byte[]));
                var verdict = check.Invoke(null, new[] { File.ReadAllBytes(file), kitOptions, null });
                var text = new StringBuilder();
                bool passed = false;
                foreach (var member in verdict.GetType().GetFields(any))
                {
                    var value = member.GetValue(verdict);
                    if (member.Name.Contains("Kind")) passed = value?.ToString() == "Pass";
                    if (value is IEnumerable many && !(value is string)) text.Append($"{Short(member.Name)}=[{string.Join("; ", many.Cast<object>().Take(20))}] ");
                    else text.Append($"{Short(member.Name)}={value} ");
                }
                return (passed, (passed ? "PASS " : "REFUSED ") + text.ToString().Trim());
            }
            catch (Exception e) { return (false, "check failed to run: " + (e.InnerException ?? e).Message); }
        }

        static string Short(string field) => field.StartsWith("<") ? field.Substring(1, field.IndexOf('>') - 1) : field;

        [MenuItem("PortKit/Kit/Check")]
        public static void CheckAll()
        {
            var report = new StringBuilder();
            bool ok = true;
            try
            {
                var kits = KitBuilder.Chosen();
                if (kits.Count == 0) { report.AppendLine("FAIL no kit builder in this project"); ok = false; }

                // the SDK's own graph check: every graph asset and prefab of the project, and the open scene
                var roots = UnityEngine.SceneManagement.SceneManager.GetActiveScene().GetRootGameObjects();
                var nodes = AllowList.DisallowedNodes(roots);
                report.AppendLine($"{(nodes.Count == 0 ? "PASS" : "FAIL")} graphs: the SDK's check found {nodes.Count} nodes the app will not run" +
                                  (nodes.Count > 0 ? ": " + string.Join(", ", nodes.Distinct().Take(20)) : ""));
                ok &= nodes.Count == 0;

                foreach (var kit in kits)
                {
                    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(kit.PrefabPath);
                    if (prefab == null) { report.AppendLine($"FAIL {kit.Slug}: no prefab at {kit.PrefabPath}"); ok = false; continue; }

                    // bindings on disk: read back, every path leads to one object of the prefab, the hash is the document's
                    if (!File.Exists(kit.BindingsPath)) { report.AppendLine($"FAIL {kit.Slug}: no bindings at {kit.BindingsPath}"); ok = false; }
                    else
                    {
                        var json = Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(kit.BindingsPath));
                        string stated = (string)json["hash"];
                        var body = (Newtonsoft.Json.Linq.JObject)json.DeepClone();
                        body.Remove("hash");
                        string computed = CanonicalJson.Sha1(CanonicalJson.Write(body));
                        var unresolved = new List<string>();
                        foreach (var p in ((Newtonsoft.Json.Linq.JObject)json["objects"]).Properties())
                        {
                            var found = prefab.transform.Find((string)p.Value["path"]);
                            if ((string)p.Value["path"] == "") found = prefab.transform;
                            if (found == null || found.GetComponent(GraphTypes.Find("BS.BSObjectId")) == null) unresolved.Add(p.Name);
                        }
                        bool fine = stated == computed && unresolved.Count == 0;
                        report.AppendLine($"{(fine ? "PASS" : "FAIL")} {kit.Slug} bindings: {((Newtonsoft.Json.Linq.JObject)json["objects"]).Count} objects resolve by path" +
                                          (unresolved.Count > 0 ? $" EXCEPT {string.Join(", ", unresolved)}" : "") + $"; hash {(stated == computed ? "matches" : "DIFFERS")} ({computed})");
                        ok &= fine;
                    }

                    foreach (var (_, folder) in Targets)
                    {
                        string file = BundlePath(folder, kit.Slug);
                        if (!File.Exists(file)) { report.AppendLine($"FAIL {kit.Slug} {folder}: no bundle (PortKit/Kit/Build Bundles)"); ok = false; continue; }
                        bool stale = File.GetLastWriteTimeUtc(file) < File.GetLastWriteTimeUtc(kit.PrefabPath);
                        var verdict = Check(file);
                        report.AppendLine($"{(verdict.passed && !stale ? "PASS" : "FAIL")} {kit.Slug} {folder} bundle{(stale ? " IS OLDER THAN THE PREFAB" : "")}: {verdict.text}");
                        ok &= verdict.passed && !stale;
                    }
                }
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); ok = false; }
            report.AppendLine(ok ? "DONE" : "FAILED");
            Write(CheckLogPath, report);
        }
    }
}
