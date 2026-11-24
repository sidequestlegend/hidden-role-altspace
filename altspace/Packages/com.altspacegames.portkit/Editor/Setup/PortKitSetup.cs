using System;
using System.IO;
using System.Linq;
using System.Text;
using BS.SDKEditor.Setup;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// The Creator SDK's Setup panel without clicking. Its checklist is public API (BS.SDKEditor.Setup.ProjectSetup):
    /// "Fix All" runs every Required and Recommended item, the Visual Scripting node generation among them.
    ///
    ///   PortKit/Setup/Run SDK Setup          Fix All, then wait for what finishes in the background (the TextMesh Pro
    ///                                        import); Logs/portkit_setup.txt ends with DONE or NEEDS ATTENTION
    ///   PortKit/Setup/Report                 the checklist as it stands, nothing changed
    ///   PortKit/Setup/Create Showcase Scene  Assets/Scenes/Showcase.unity (floor, sun), opened and saved
    ///
    /// The template already has Active Input Handling on Both (the one item whose fix needs a restart) and Run In
    /// Background on, and Multiplayer Play Mode 2.0.2 in its manifest (the one Optional item, which Fix All leaves out).
    /// </summary>
    public static class PortKitSetup
    {
        const string LogPath = "Logs/portkit_setup.txt";
        public const string ShowcasePath = "Assets/Scenes/Showcase.unity";
        static double waitUntil;

        static void Write(StringBuilder report)
        {
            Directory.CreateDirectory("Logs");
            File.WriteAllText(LogPath, report.ToString());
        }

        /// <summary>One line per checklist item; returns how many still need something.</summary>
        static int Describe(StringBuilder report, out bool working)
        {
            int open = 0;
            working = false;
            foreach (var check in ProjectSetup.Checks)
            {
                var status = ProjectSetup.Evaluate(check);
                if (status.State == SetupState.Working) working = true;
                bool counts = status.NeedsAttention && check.Importance != SetupImportance.Optional;
                if (counts) open++;
                report.AppendLine($"{status.State,-15} {check.Importance,-12} {check.Id}: {status.Summary}");
            }
            return open;
        }

        [MenuItem("PortKit/Setup/Report")]
        public static void Report()
        {
            var report = new StringBuilder();
            try
            {
                int open = Describe(report, out bool working);
                report.AppendLine(working ? "WORKING" : open == 0 ? "DONE" : $"NEEDS ATTENTION: {open} items");
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); }
            Write(report);
        }

        [MenuItem("PortKit/Setup/Run SDK Setup")]
        public static void Run()
        {
            var report = new StringBuilder();
            try
            {
                var before = ProjectSetup.FixAllCandidates().Select(c => c.Id).ToList();
                report.AppendLine("to fix: " + (before.Count == 0 ? "nothing" : string.Join(", ", before)));
                Write(report);
                var result = ProjectSetup.FixAll();
                report.AppendLine("fixed: " + string.Join(", ", result.Fixed.Select(c => c.Id)));
                if (result.Failed.Count > 0) report.AppendLine("failed: " + string.Join(", ", result.Failed.Select(c => c.Id)));
                if (result.RestartNeeded) report.AppendLine("a restart of Unity is needed for one of them");
                report.AppendLine("WORKING");
                Write(report);
                AssetDatabase.SaveAssets();
                SessionState.SetBool(WaitingKey, true);
                waitUntil = EditorApplication.timeSinceStartup + 600;
                EditorApplication.update -= WaitForBackground;
                EditorApplication.update += WaitForBackground;
            }
            catch (Exception e)
            {
                report.AppendLine("FAILED: " + e);
                Write(report);
            }
        }

        const string WaitingKey = "PortKit.Setup.Waiting";

        // A fix can end in a script reload (the first Visual Scripting set-up, the TextMesh Pro import), which forgets
        // the wait above: it is taken up again after the reload, so the report always gets its last line.
        [InitializeOnLoadMethod]
        static void ResumeWaiting()
        {
            if (!SessionState.GetBool(WaitingKey, false)) return;
            waitUntil = EditorApplication.timeSinceStartup + 600;
            EditorApplication.update -= WaitForBackground;
            EditorApplication.update += WaitForBackground;
        }

        static void WaitForBackground()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            var report = new StringBuilder();
            int open = Describe(report, out bool working);
            if (working && EditorApplication.timeSinceStartup < waitUntil) return;
            EditorApplication.update -= WaitForBackground;
            SessionState.SetBool(WaitingKey, false);
            report.AppendLine(working ? "NEEDS ATTENTION: still working after ten minutes" : open == 0 ? "DONE" : $"NEEDS ATTENTION: {open} items");
            Write(report);
        }

        [MenuItem("PortKit/Setup/Create Showcase Scene")]
        public static void CreateShowcase()
        {
            var report = new StringBuilder();
            try
            {
                if (File.Exists(ShowcasePath))
                {
                    EditorSceneManager.OpenScene(ShowcasePath, OpenSceneMode.Single);
                    report.AppendLine("opened " + ShowcasePath);
                }
                else
                {
                    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    var sun = new GameObject("Sun");
                    var light = sun.AddComponent<Light>();
                    light.type = LightType.Directional;
                    light.intensity = 1.2f;
                    light.shadows = LightShadows.Soft;
                    sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
                    var floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
                    floor.name = "Floor";
                    floor.transform.localScale = new Vector3(4f, 1f, 4f);        // 40 m square
                    Directory.CreateDirectory(Path.GetDirectoryName(ShowcasePath));
                    if (!EditorSceneManager.SaveScene(scene, ShowcasePath)) throw new Exception("the scene was not saved");
                    report.AppendLine("created " + ShowcasePath);
                }
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ShowcasePath, true) };
                report.AppendLine("DONE");
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); }
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/portkit_showcase.txt", report.ToString());
        }
    }
}
