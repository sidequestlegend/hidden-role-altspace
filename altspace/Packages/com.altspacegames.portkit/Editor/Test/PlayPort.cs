using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// A Play-mode page port of this project's own, so that two projects can be in Play at the same time.
    ///
    /// The SDK serves Assets/WebRoot on OraManager.staticPort, 42068 unless the component says otherwise, and the
    /// component is made in Play mode by BSStarterUpper, which the SDK itself spawns before the first scene loads.
    /// With a port in UserSettings/PortKitPort.txt (a number; the file is per machine and never checked in) this
    /// class takes over that one step: it tells the SDK not to spawn its starter and spawns the same prefab itself,
    /// with an OraManager whose port is already set. The page, the local multiplayer relay and its players all
    /// read the port from that component. The project's browser also gets a profile of its own and normal process
    /// priority: two browsers on one profile fight over its files, and two at real-time priority starve the editors.
    ///
    /// Without the file nothing here does anything, and Play mode is the SDK's own, on 42068.
    ///
    ///   PortKit/Play/Report Port        Logs/portkit_port.txt: the port in force and who listens on it
    /// </summary>
    [InitializeOnLoad]
    public static class PlayPort
    {
        public const int SdkDefault = 42068;
        const string SpawnKey = "PortKit.PlayPort.Spawn";

        /// <summary>The main project's folder: a Multiplayer Play Mode player runs from a clone under Library/VP.</summary>
        public static string MainRoot
        {
            get
            {
                string root = Path.GetDirectoryName(Application.dataPath).Replace('\\', '/');
                int clone = root.IndexOf("/Library/VP/", StringComparison.OrdinalIgnoreCase);
                return clone >= 0 ? root.Substring(0, clone) : root;
            }
        }

        public static bool IsClone => Application.dataPath.Replace('\\', '/').IndexOf("/Library/VP/", StringComparison.OrdinalIgnoreCase) >= 0;

        /// <summary>"main" for the main editor, "vp-&lt;id&gt;" for a Multiplayer Play Mode player.</summary>
        public static string PlayerTag
        {
            get
            {
                string path = Application.dataPath.Replace('\\', '/');
                int at = path.IndexOf("/Library/VP/", StringComparison.OrdinalIgnoreCase);
                if (at < 0) return "main";
                string rest = path.Substring(at + "/Library/VP/".Length);
                return "vp-" + rest.Split('/')[0];
            }
        }

        /// <summary>The port in UserSettings/PortKitPort.txt, or 0 when the project uses the SDK's own.</summary>
        public static int Configured
        {
            get
            {
                try
                {
                    string file = MainRoot + "/UserSettings/PortKitPort.txt";
                    if (File.Exists(file) && int.TryParse(File.ReadAllText(file).Trim(), out int port) && port > 1024 && port < 65536 && port != SdkDefault) return port;
                }
                catch (IOException) { }
                return 0;
            }
        }

        /// <summary>The port Play mode serves the page on.</summary>
        public static int Port => Configured > 0 ? Configured : SdkDefault;

        static PlayPort()
        {
            EditorApplication.playModeStateChanged -= OnPlayMode;
            EditorApplication.playModeStateChanged += OnPlayMode;
            // After the reload that starts Play, before any scene object wakes: the SDK decided, when edit mode ended,
            // whether to spawn its starter (BSStarterUpper.SpawnOnPlay). Take that over if this project has its own port.
            if (Configured > 0 && EditorApplication.isPlayingOrWillChangePlaymode && !EditorApplication.isPlaying && BS.BSStarterUpper.SpawnOnPlay)
            {
                BS.BSStarterUpper.SpawnOnPlay = false;
                SessionState.SetBool(SpawnKey, true);
            }
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredPlayMode && SessionState.GetBool(SpawnKey, false))
            {
                SessionState.SetBool(SpawnKey, false);
                try { Spawn(Configured > 0 ? Configured : SdkDefault); }
                catch (Exception e) { Debug.LogError("[PortKit] could not start the page on this project's port: " + e); }
            }
            if (change == PlayModeStateChange.EnteredEditMode) SessionState.SetBool(SpawnKey, false);
        }

        static void Spawn(int port)
        {
            var prefab = Resources.Load<GameObject>("Prefabs/BSStarterUpper");
            if (prefab == null) throw new Exception("the SDK's Prefabs/BSStarterUpper was not found");
            var oraType = GraphTypes.Find("SideQuest.Ora.OraManager");
            const BindingFlags statics = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;

            if (!IsClone)
            {
                // (a clone gets its own profile and priority from the SDK's local multiplayer)
                var extra = oraType.GetField("defaultExtraArguments", statics);
                string current = (extra?.GetValue(null) as string ?? "").Trim();
                if (extra != null && !current.Contains("--ora-profile"))
                    extra.SetValue(null, (current + " --ora-profile \"portkit-" + ProjectHash() + "\"").Trim());
                oraType.GetField("boostBrowserPriority", statics)?.SetValue(null, false);
            }

            // The order the SDK's own starter keeps: the browser manager wakes first (it launches the browser, on the port
            // it has by then), the starter after it (its Awake makes the space's view, which registers with a manager
            // that must already be awake: woken together, the starter goes first and the view's window is never made).
            // The SDK's prefab is one object with the starter on it and nothing set, so it is made here in two steps.
            if (prefab.GetComponents<Component>().Length != 2 || prefab.transform.childCount != 0)
                Debug.LogWarning("[PortKit] the SDK's BSStarterUpper prefab has grown: PlayPort.Spawn copies only the starter component");
            var starter = new GameObject(prefab.name);
            starter.SetActive(false);
            var ora = starter.AddComponent(oraType);
            (oraType.GetField("staticPort") ?? throw new Exception("OraManager has no staticPort in this SDK")).SetValue(ora, port);
            starter.SetActive(true);
            starter.AddComponent<BS.BSStarterUpper>();
            Debug.Log($"[PortKit] page on port {port} ({PlayerTag})");
        }

        static string ProjectHash()
        {
            using (var sha = SHA1.Create())
                return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(MainRoot.ToLowerInvariant())).Take(4).Select(b => b.ToString("x2")));
        }

        /// <summary>Whether something is listening on a local port right now.</summary>
        public static bool IsListening(int port)
        {
            try
            {
                return System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(e => e.Port == port);
            }
            catch (Exception) { return false; }
        }

        [MenuItem("PortKit/Play/Report Port")]
        public static void Report()
        {
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/portkit_port.txt",
                $"port {Port} ({(Configured > 0 ? "UserSettings/PortKitPort.txt" : "the SDK's default")}), {(IsListening(Port) ? "in use" : "free")}; " +
                $"playing {EditorApplication.isPlaying}; {PlayerTag}; main root {MainRoot}\n");
        }
    }
}
