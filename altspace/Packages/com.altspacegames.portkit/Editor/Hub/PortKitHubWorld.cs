using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using Newtonsoft.Json.Linq;
using Unity.EditorCoroutines.Editor;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// The hub world itself, without clicking in the Builder (lifted from FlightWorld's FlightWorldPublish.cs, plus
    /// making the world). Uses reflection: the Builder window exposes no public API. Scene, world and sign-in are
    /// whatever the open Builder window has (Creator SDK > Builder).
    ///
    ///   PortKit/Hub/Builder/Run Checklist      the Builder's own checklist for the scene it is set to build
    ///   PortKit/Hub/Builder/Build And Upload   its "Build & upload" path. Outward-facing: needs Library/PortKit/upload_go.txt
    ///                                          holding the handle of the world selected in the Builder
    ///   PortKit/Hub/World/Create And Select    creates a Private world (SqEditorAppApi.CreateWorld, POST /v2/worlds) named as
    ///                                          Library/PortKit/world_create.txt says, selects it in the Builder, and, if the
    ///                                          file has a second line, gives it that handle (PUT /v2/worlds/{id}/slug).
    ///                                          Outward-facing: needs Library/PortKit/world_go.txt holding the same first line
    /// Without its go-ahead file a menu only says what it would do. Reports: Logs/portkit_publish.txt, Logs/portkit_world.txt.
    /// </summary>
    public static class PortKitHubWorld
    {
        const string ReportPath = "Logs/portkit_publish.txt";
        const string WorldReportPath = "Logs/portkit_world.txt";
        const BindingFlags Any = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;

        static EditorWindow Builder(StringBuilder report)
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("BuilderWindow", false)).FirstOrDefault(t => t != null);
            if (type == null)
            {
                report.AppendLine("Creator SDK BuilderWindow type not found");
                return null;
            }
            var window = Resources.FindObjectsOfTypeAll(type).OfType<EditorWindow>().FirstOrDefault();
            if (window == null) report.AppendLine("Builder window is not open (Creator SDK > Builder)");
            return window;
        }

        static object Field(object target, string name) => target.GetType().GetField(name, Any)?.GetValue(target);
        static object Property(object target, string name) => target?.GetType().GetProperty(name, Any)?.GetValue(target);

        static string SelectedHandle(EditorWindow window)
        {
            var world = Field(window, "selectedWorld");
            return world == null ? null : (Property(world, "Slug") ?? world.GetType().GetField("Slug", Any)?.GetValue(world)) as string;
        }

        static void Describe(EditorWindow window, StringBuilder report)
        {
            var api = Field(window, "sq");
            var autoUpload = Field(window, "autoUpload");
            report.AppendLine($"scene: {Field(window, "scenePath")}");
            report.AppendLine($"world: {SelectedHandle(window) ?? "none selected"}");
            report.AppendLine($"signed in: {(api != null && Property(api, "User") != null)}");
            report.AppendLine($"upload after building: {Property(autoUpload, "value")}");
        }

        static object RunChecklist(EditorWindow window, StringBuilder report, bool forBuild)
        {
            var method = window.GetType().GetMethod("RunChecklist", Any);
            var result = method.Invoke(window, new object[] { forBuild, true });
            if (result == null)
            {
                report.AppendLine("checklist did not run");
                return null;
            }
            report.AppendLine($"checklist: {Property(result, "Summary")}");
            var blockers = ((IEnumerable)Property(result, "Blockers")).Cast<object>().ToList();
            foreach (var issue in (IEnumerable)Property(result, "Issues"))
            {
                bool blocks = blockers.Contains(issue);
                // (the issue type's members have been renamed between SDK versions: print whatever it has)
                var members = issue.GetType().GetFields(Any).Select(f => (f.Name, value: f.GetValue(issue)))
                    .Concat(issue.GetType().GetProperties(Any).Where(p => p.GetIndexParameters().Length == 0).Select(p => (p.Name, value: p.GetValue(issue))))
                    .Where(m => m.value != null && !m.Name.Contains("BackingField") && !(m.value is Delegate))
                    .Select(m => $"{m.Name}={(m.value is UnityEngine.Object o ? o.name : m.value)}");
                report.AppendLine($"  [{(blocks ? "BLOCKS BUILD" : "issue")}] {string.Join(" | ", members)}");
            }
            return result;
        }

        static void Finish(StringBuilder report, string path = ReportPath)
        {
            Directory.CreateDirectory("Logs");
            File.WriteAllText(path, report.ToString());
        }

        [MenuItem("PortKit/Hub/Builder/Run Checklist")]
        public static void Check()
        {
            var report = new StringBuilder();
            try
            {
                var window = Builder(report);
                if (window != null)
                {
                    Describe(window, report);
                    RunChecklist(window, report, false);
                }
            }
            catch (Exception e)
            {
                report.AppendLine("FAILED: " + (e.InnerException ?? e));
            }
            Finish(report);
        }

        [MenuItem("PortKit/Hub/Builder/Build And Upload")]
        public static void BuildAndUpload()
        {
            var report = new StringBuilder();
            try
            {
                var window = Builder(report);
                if (window == null)
                {
                    Finish(report);
                    return;
                }
                Describe(window, report);
                string handle = SelectedHandle(window);
                const string goPath = PortKitRemote.Dir + "/upload_go.txt";
                string go = File.Exists(goPath) ? File.ReadAllText(goPath).Trim() : "";
                if (string.IsNullOrEmpty(handle) || go != handle)
                {
                    report.AppendLine($"NOT STARTED: no go-ahead. This would build the scene above and upload it to world '{handle}'; {goPath} must hold that handle.");
                    RunChecklist(window, report, true);
                    Finish(report);
                    return;
                }
                File.Delete(goPath);                                      // one go-ahead, one upload
                EditorSceneManager.SaveOpenScenes();                      // otherwise the Builder asks with a dialog
                window.GetType().GetMethod("BuildAssetBundles", Any).Invoke(window, null);
                var confirm = Field(window, "confirmCallback") as Action;
                if (confirm == null)
                {
                    report.AppendLine("NOT STARTED: the Builder did not reach its confirmation (blocked by the checklist, or nothing selected)");
                    RunChecklist(window, report, true);
                    Finish(report);
                    return;
                }
                report.AppendLine("STARTED: build confirmed; see the Builder log for progress");
                Finish(report);                                           // written before the long, blocking build
                var dialog = Field(window, "buildConfirm") as UnityEngine.UIElements.VisualElement;
                if (dialog != null) dialog.style.display = UnityEngine.UIElements.DisplayStyle.None;
                confirm();
            }
            catch (Exception e)
            {
                report.AppendLine("FAILED: " + (e.InnerException ?? e));
                Finish(report);
            }
        }

        // ------------------------------------------------------------------ making the world

        [MenuItem("PortKit/Hub/World/Create And Select")]
        public static void CreateWorld()
        {
            var report = new StringBuilder();
            try
            {
                const string createPath = PortKitRemote.Dir + "/world_create.txt", goPath = PortKitRemote.Dir + "/world_go.txt";
                if (!File.Exists(createPath)) throw new Exception($"{createPath} must hold the world's name (and, on a second line, the handle wanted)");
                var lines = File.ReadAllLines(createPath).Select(l => l.Trim()).Where(l => l.Length > 0).ToArray();
                string name = lines.Length > 0 ? lines[0] : "";
                string handle = lines.Length > 1 ? lines[1] : "";
                if (name.Length == 0) throw new Exception("no name");
                if (handle.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(handle, "^[a-z0-9-]{4,}$"))
                    throw new Exception($"handle '{handle}' must be four or more lower-case letters, digits and hyphens");
                var window = Builder(report);
                if (window == null) { Finish(report, WorldReportPath); return; }
                var api = Field(window, "sq");
                var user = api != null ? Property(api, "User") : null;
                report.AppendLine($"signed in: {user != null}{(user != null ? " as " + (Property(user, "Name") ?? Property(user, "Username") ?? "?") : "")}");
                string go = File.Exists(goPath) ? File.ReadAllText(goPath).Trim() : "";
                if (go != name || user == null)
                {
                    report.AppendLine($"NOT STARTED: {(user == null ? "the Builder is not signed in" : "no go-ahead")}. This would create a Private world named \"{name}\" " +
                                      $"(POST /v2/worlds), select it in the Builder{(handle.Length > 0 ? $", and give it the handle '{handle}' (PUT /v2/worlds/{{id}}/slug)" : "")}; " +
                                      $"{goPath} must hold the name.");
                    Finish(report, WorldReportPath);
                    return;
                }
                File.Delete(goPath);                                      // one go-ahead, one world
                report.AppendLine($"creating \"{name}\" ...");
                Finish(report, WorldReportPath);
                EditorCoroutineUtility.StartCoroutineOwnerless(Create(window, api, name, handle, report));
            }
            catch (Exception e)
            {
                report.AppendLine("FAILED: " + (e.InnerException ?? e).Message);
                Finish(report, WorldReportPath);
            }
        }

        static IEnumerator Create(EditorWindow window, object api, string name, string handle, StringBuilder report)
        {
            object world = null;
            Exception error = null;
            // SqEditorAppApi.CreateWorld(string name, Action<SqEditorWorld> OnCompleted, Action<Exception> OnError, int status = 100, int maxOccupancy = 20)
            var create = api.GetType().GetMethod("CreateWorld", Any) ?? throw new Exception("this SDK's SqEditorAppApi has no CreateWorld");
            var worldType = create.GetParameters()[1].ParameterType.GetGenericArguments()[0];
            var completed = Delegate.CreateDelegate(create.GetParameters()[1].ParameterType, new Box(w => world = w), typeof(Box).GetMethod("Take").MakeGenericMethod(worldType));
            yield return (IEnumerator)create.Invoke(api, new object[] { name, completed, (Action<Exception>)(e => error = e), 100, 20 });
            if (world == null)
            {
                report.AppendLine("FAILED: " + (error?.Message ?? "no answer"));
                Finish(report, WorldReportPath);
                yield break;
            }
            string id = Property(world, "WorldId") as string, slug = Property(world, "Slug") as string;
            report.AppendLine($"created: id {id}, handle {slug} (Private)");
            if (handle.Length > 0 && handle != slug)
            {
                JObject answer = null;
                var send = api.GetType().GetMethod("JsonPost", Any).MakeGenericMethod(typeof(JObject));
                yield return (IEnumerator)send.Invoke(api, new object[]
                {
                    $"/v2/worlds/{id}/slug", new JObject { ["space_slug"] = handle }, (Action<JObject>)(r => answer = r), (Action<Exception>)(e => error = e), true, false, "PUT",
                });
                if (answer == null && error != null) report.AppendLine($"FAILED to set the handle '{handle}': {error.Message}");
                else { slug = handle; report.AppendLine($"handle set: {handle}"); }
            }
            // the Builder reselects its last-used world: make it this one, then let it reload its list
            var prefs = GraphTypes.TryFind("ProjectPrefs") ?? AppDomain.CurrentDomain.GetAssemblies().SelectMany(a => { try { return a.GetTypes(); } catch (Exception) { return Type.EmptyTypes; } }).FirstOrDefault(t => t.Name == "ProjectPrefs");
            prefs?.GetMethod("SetString", Any)?.Invoke(null, new object[] { "BanterBuilder_selectedWorldId", id });
            var refresh = window.GetType().GetMethod("RefreshWorlds", Any);
            if (refresh != null) yield return (IEnumerator)refresh.Invoke(window, new object[] { id });
            report.AppendLine($"selected in the Builder: {SelectedHandle(window)}");
            report.AppendLine($"put into {PortKitHub.ConfigPath}: \"world\": {{ \"id\": \"{id}\", \"handle\": \"{slug}\" }}");
            report.AppendLine("DONE");
            Finish(report, WorldReportPath);
        }

        /// <summary>Carries a callback whose argument type is only known by reflection.</summary>
        sealed class Box
        {
            readonly Action<object> take;
            public Box(Action<object> take) { this.take = take; }
            public void Take<T>(T value) => take(value);
        }
    }
}
