using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace PortKit
{
    /// <summary>
    /// A game project's whole output: a local artifact folder. No network code runs in a game project; the hub
    /// project (PortKitHub) releases from artifact folders.
    ///
    ///   PortKit/Kit/Take Photos         a picture of each kit prefab alone, Library/PortKit/kits/photos/&lt;slug&gt;.jpg
    ///   PortKit/Kit/Export Artifacts    dist/ beside Assets:
    ///         android/&lt;slug&gt;, windows/&lt;slug&gt;    the bundles, as built and checked
    ///         pk-&lt;slug&gt;.js                    the snippet's script, from Assets/WebRoot (built by the TypeScript side)
    ///         &lt;slug&gt;.jpg                      the photo
    ///         &lt;slug&gt;.snippet.html             the snippet's markup; {SCRIPT} stands for the script's address, known at release
    ///         manifest.json                   per kit: title, texts, footprint, bindings hash, check verdicts, and the
    ///                                         sha1 and size of every file
    /// Report: Logs/portkit_artifacts.txt (DONE or FAILED; a kit with a file missing is listed and fails the export).
    /// </summary>
    public static class KitArtifacts
    {
        public const string Folder = "dist";
        public const string ScriptPlaceholder = "{SCRIPT}";
        const string LogPath = "Logs/portkit_artifacts.txt";
        static string PhotoPath(string slug) => $"{KitBundles.BundleRoot}/photos/{slug}.jpg";

        public static string Sha1(byte[] data)
        {
            using (var sha = SHA1.Create()) return string.Concat(sha.ComputeHash(data).Select(b => b.ToString("x2")));
        }

        /// <summary>The box around everything the kit draws, in the kit's own axes (the kit at the origin, unturned).</summary>
        public static Bounds Footprint(GameObject prefab)
        {
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                var copy = UnityEngine.Object.Instantiate(prefab);
                SceneManager.MoveGameObjectToScene(copy, scene);
                copy.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                var bounds = new Bounds();
                bool any = false;
                foreach (var r in copy.GetComponentsInChildren<Renderer>(false))
                {
                    if (!any) { bounds = r.bounds; any = true; }
                    else bounds.Encapsulate(r.bounds);
                }
                return bounds;
            }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        static string Xml(string text) => SecurityElement.Escape(text ?? "");
        static string N(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);

        /// <summary>
        /// The snippet's markup: what a world's page gets when somebody adds the snippet (as FlightWorld's SnippetUpload.Code:
        /// a position handle and a box as wide and deep as the kit either side of its position).
        /// </summary>
        public static string Markup(KitBuilder kit, Bounds footprint)
        {
            float wide = 2f * Mathf.Max(Mathf.Abs(footprint.min.x), Mathf.Abs(footprint.max.x));
            float deep = 2f * Mathf.Max(Mathf.Abs(footprint.min.z), Mathf.Abs(footprint.max.z));
            string size = $"{wide.ToString("F1", CultureInfo.InvariantCulture)} 0.2 {deep.ToString("F1", CultureInfo.InvariantCulture)}";
            return $"<bs-snippet name=\"{kit.Slug}\" title=\"{Xml(kit.Title)}\"{(kit.Single ? " single=\"true\"" : "")}\n" +
                   $"  description=\"{Xml(kit.Summary)}\"\n" +
                   $"  script=\"{ScriptPlaceholder}\"\n" +
                   $"  position=\"{Xml(kit.SnippetPosition)}\"\n" +
                   "  rotation=\"0 0 0\"" +
                   string.Concat(kit.SnippetSettings.Select(s => $"\n  {s.name}=\"{Xml(s.value)}\"")) + ">\n" +
                   "  <bs-gizmo type=\"position\" attribute=\"position\"/>\n" +
                   $"  <bs-gizmo type=\"box\" attribute=\"position\" size=\"{size}\"/>\n" +
                   "</bs-snippet>\n";
        }

        [MenuItem("PortKit/Kit/Take Photos")]
        public static void Photos()
        {
            var report = new StringBuilder();
            const int width = 1280, height = 720;
            const float fov = 32f;
            Directory.CreateDirectory($"{KitBundles.BundleRoot}/photos");
            foreach (var kit in KitBuilder.Chosen())
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(kit.PrefabPath);
                if (prefab == null) { report.AppendLine($"FAILED {kit.Slug}: no prefab"); continue; }
                var scene = EditorSceneManager.NewPreviewScene();
                var rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB) { antiAliasing = 8 };
                var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
                try
                {
                    var copy = UnityEngine.Object.Instantiate(prefab);
                    SceneManager.MoveGameObjectToScene(copy, scene);
                    var bounds = new Bounds();
                    bool any = false;
                    foreach (var r in copy.GetComponentsInChildren<Renderer>(false))
                    {
                        if (!any) { bounds = r.bounds; any = true; }
                        else bounds.Encapsulate(r.bounds);
                    }
                    var sun = new GameObject("Sun");
                    SceneManager.MoveGameObjectToScene(sun, scene);
                    var light = sun.AddComponent<Light>();
                    light.type = LightType.Directional;
                    light.intensity = 1.3f;
                    sun.transform.rotation = Quaternion.Euler(40f, 150f, 0f);
                    var camObject = new GameObject("Camera");
                    SceneManager.MoveGameObjectToScene(camObject, scene);
                    var cam = camObject.AddComponent<Camera>();
                    cam.scene = scene;
                    cam.fieldOfView = fov;
                    cam.clearFlags = CameraClearFlags.SolidColor;
                    cam.backgroundColor = new Color(0.16f, 0.18f, 0.22f);
                    // from the -Z side (the side text and uGUI are read from), a little above and to one side, far enough to hold the whole box
                    var towards = new Vector3(0.55f, 0.45f, -1f).normalized;
                    float reach = bounds.extents.magnitude / Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) * 1.15f;
                    cam.transform.position = bounds.center + towards * Mathf.Max(reach, 0.5f);
                    cam.transform.LookAt(bounds.center);
                    cam.nearClipPlane = 0.02f;
                    cam.farClipPlane = reach * 4f + 10f;
                    cam.targetTexture = rt;
                    cam.Render();
                    RenderTexture.active = rt;
                    tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                    tex.Apply();
                    RenderTexture.active = null;
                    cam.targetTexture = null;
                    File.WriteAllBytes(PhotoPath(kit.Slug), tex.EncodeToJPG(90));
                    report.AppendLine($"photo {kit.Slug}: size {bounds.size:F2}, camera {reach:F1} m away -> {PhotoPath(kit.Slug)}");
                }
                catch (Exception e) { report.AppendLine($"FAILED {kit.Slug}: {e.Message}"); }
                finally
                {
                    EditorSceneManager.ClosePreviewScene(scene);
                    rt.Release();
                    UnityEngine.Object.DestroyImmediate(rt);
                    UnityEngine.Object.DestroyImmediate(tex);
                }
            }
            report.AppendLine(report.ToString().Contains("FAILED") ? "FAILED" : "DONE");
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/portkit_photos.txt", report.ToString());
        }

        [MenuItem("PortKit/Kit/Export Artifacts")]
        public static void Export()
        {
            var report = new StringBuilder();
            bool ok = true;
            try
            {
                Directory.CreateDirectory(Folder);
                string manifestPath = $"{Folder}/manifest.json";
                var manifest = File.Exists(manifestPath) ? JObject.Parse(File.ReadAllText(manifestPath)) : new JObject();
                manifest["schema"] = 1;
                var kits = manifest["kits"] as JObject ?? (JObject)(manifest["kits"] = new JObject());
                foreach (var kit in KitBuilder.Chosen())
                {
                    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(kit.PrefabPath);
                    if (prefab == null) { report.AppendLine($"FAILED {kit.Slug}: no prefab"); ok = false; continue; }
                    var footprint = Footprint(prefab);
                    var files = new JObject();
                    var checks = new JObject();
                    var missing = new List<string>();
                    void Put(string source, string name)
                    {
                        if (!File.Exists(source)) { missing.Add(name); return; }
                        var data = File.ReadAllBytes(source);
                        string target = $"{Folder}/{name}";
                        Directory.CreateDirectory(Path.GetDirectoryName(target));
                        File.WriteAllBytes(target, data);
                        files[name] = new JObject { ["sha1"] = Sha1(data), ["bytes"] = data.Length };
                    }
                    foreach (var (_, folder) in KitBundles.Targets)
                    {
                        string bundle = KitBundles.BundlePath(folder, kit.Slug);
                        if (File.Exists(bundle))
                        {
                            bool stale = File.GetLastWriteTimeUtc(bundle) < File.GetLastWriteTimeUtc(kit.PrefabPath);
                            var verdict = KitBundles.Check(bundle);
                            checks[folder] = stale ? "STALE" : verdict.passed ? "PASS" : "REFUSED";
                            if (stale || !verdict.passed) { report.AppendLine($"FAILED {kit.Slug} {folder}: the bundle is {(stale ? "older than the prefab" : "refused by the app's kit check")}"); ok = false; }
                        }
                        Put(bundle, $"{folder}/{kit.Slug}");
                    }
                    Put(kit.ScriptPath, $"pk-{kit.Slug}.js");
                    Put(PhotoPath(kit.Slug), $"{kit.Slug}.jpg");
                    string markup = Markup(kit, footprint);
                    File.WriteAllText($"{Folder}/{kit.Slug}.snippet.html", markup, new UTF8Encoding(false));
                    files[$"{kit.Slug}.snippet.html"] = new JObject { ["sha1"] = Sha1(Encoding.UTF8.GetBytes(markup)), ["bytes"] = Encoding.UTF8.GetByteCount(markup) };
                    string bindings = File.Exists(kit.BindingsPath) ? (string)JObject.Parse(File.ReadAllText(kit.BindingsPath))["hash"] : null;
                    kits[kit.Slug] = new JObject
                    {
                        ["title"] = kit.Title,
                        ["summary"] = kit.Summary,
                        ["description"] = kit.Description,
                        ["single"] = kit.Single,
                        ["footprint"] = new JObject
                        {
                            ["center"] = new JArray((double)footprint.center.x, (double)footprint.center.y, (double)footprint.center.z),
                            ["size"] = new JArray((double)footprint.size.x, (double)footprint.size.y, (double)footprint.size.z),
                        },
                        ["bindings"] = bindings,
                        ["checks"] = checks,
                        ["files"] = files,
                    };
                    if (missing.Count > 0) { report.AppendLine($"FAILED {kit.Slug}: missing {string.Join(", ", missing)}"); ok = false; }
                    else report.AppendLine($"ok {kit.Slug}: {files.Count} files, footprint {N(footprint.size.x)} x {N(footprint.size.y)} x {N(footprint.size.z)} m, bindings {bindings}");
                }
                File.WriteAllText(manifestPath, CanonicalJson.WriteIndented(manifest), new UTF8Encoding(false));
                report.AppendLine($"wrote {manifestPath}");
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); ok = false; }
            report.AppendLine(ok ? "DONE" : "FAILED");
            Directory.CreateDirectory("Logs");
            File.WriteAllText(LogPath, report.ToString());
        }
    }
}
