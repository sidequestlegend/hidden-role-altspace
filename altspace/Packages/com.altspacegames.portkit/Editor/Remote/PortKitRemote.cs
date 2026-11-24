using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// File-driven remote for an open editor (lifted from FlightWorld's FlightWorldRemote.cs). It is in an assembly of
    /// its own, with no references, so it keeps working while the rest of the port kit or a game's builder does not
    /// compile. Drop a one-line command into Library/PortKit/command.txt:
    ///
    ///     refresh                          re-scan assets and recompile scripts (log.txt is emptied first)
    ///     recompile                        re-scan assets and ask the compiler to compile again whatever is not up to date (a
    ///                                      failed assembly always is), so its messages come fresh into compile.txt
    ///     compilefailed                    "true" or "false": EditorUtility.scriptCompilationFailed (the last compile failed)
    ///     menu:Some/Menu                   run a menu item
    ///     play / stop                      enter or leave Play mode
    ///     state                            "editing", "playing", "compiling" or "changing"
    ///     shot:name;x,y,z;tx,ty,tz;fov     render the open scene into Library/PortKit/shots/name.jpg
    ///     quit                             save nothing and close this editor (only ever sent to an editor we started)
    ///
    /// The outcome goes to Library/PortKit/result.txt; compiler errors and console errors are appended to
    /// Library/PortKit/log.txt; compile.txt holds the errors of each assembly's last compile (rewritten whenever an
    /// assembly finishes compiling, kept across refreshes); ready.txt is rewritten after every script reload. tools/remote.sh wraps all of this.
    /// A Multiplayer Play Mode player is a clone of the project with a Library of its own
    /// (Library/VP/&lt;id&gt;/Library/PortKit), so each player has its own remote.
    /// </summary>
    [InitializeOnLoad]
    public static class PortKitRemote
    {
        public const string Dir = "Library/PortKit";
        static readonly string CommandPath = Dir + "/command.txt";
        static readonly string ResultPath = Dir + "/result.txt";
        static readonly string LogPath = Dir + "/log.txt";
        static readonly string CompilePath = Dir + "/compile.txt";
        /// <summary>The errors of each assembly's last compile (none: it compiled). A domain reload means every assembly compiled.</summary>
        static readonly System.Collections.Generic.SortedDictionary<string, string[]> lastErrors =
            new System.Collections.Generic.SortedDictionary<string, string[]>(StringComparer.Ordinal);
        static double nextPoll;

        static PortKitRemote()
        {
            Directory.CreateDirectory(Dir);
            EditorApplication.update += Poll;
            Application.logMessageReceived += OnLog;
            CompilationPipeline.assemblyCompilationFinished += OnCompiled;
            File.WriteAllText(Dir + "/ready.txt", DateTime.Now.ToString("o") + " pid " + System.Diagnostics.Process.GetCurrentProcess().Id + "\n");
        }

        static void Append(string text)
        {
            try { File.AppendAllText(LogPath, text); }
            catch (IOException) { /* being read from outside; the line is still in the Editor log */ }
        }

        static void OnCompiled(string assembly, CompilerMessage[] messages)
        {
            var errors = messages.Where(m => m.type == CompilerMessageType.Error).Select(e => $"[compile] {e.file}({e.line}): {e.message}").ToArray();
            lastErrors[Path.GetFileNameWithoutExtension(assembly)] = errors;
            try { File.WriteAllText(CompilePath, string.Concat(lastErrors.Values.SelectMany(lines => lines).Select(line => line + "\n"))); }
            catch (IOException) { /* being read; the next assembly rewrites it */ }
            if (errors.Length == 0) return;
            Append(string.Concat(errors.Select(line => line + "\n")));
        }

        static void OnLog(string condition, string stackTrace, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
                Append($"[{type}] {condition.Split('\n')[0]}\n");
        }

        static string State()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return "compiling";
            if (EditorApplication.isPlaying) return EditorApplication.isPaused ? "paused" : "playing";
            if (EditorApplication.isPlayingOrWillChangePlaymode) return "changing";
            return "editing";
        }

        static void Poll()
        {
            if (EditorApplication.timeSinceStartup < nextPoll) return;
            nextPoll = EditorApplication.timeSinceStartup + 0.5;
            if (!File.Exists(CommandPath)) return;
            string command;
            try
            {
                command = File.ReadAllText(CommandPath).Trim();
                File.Delete(CommandPath);
            }
            catch (IOException)
            {
                return; // still being written; try again next tick
            }
            if (command.Length == 0) return;

            string result;
            try
            {
                if (command == "refresh")
                {
                    File.WriteAllText(LogPath, "");
                    AssetDatabase.Refresh();
                    result = "refresh requested";
                }
                else if (command == "recompile")
                {
                    File.WriteAllText(LogPath, "");
                    AssetDatabase.Refresh();
                    CompilationPipeline.RequestScriptCompilation();
                    result = "recompile requested";
                }
                else if (command == "compilefailed")
                {
                    result = EditorUtility.scriptCompilationFailed ? "true" : "false";
                }
                else if (command.StartsWith("menu:"))
                {
                    result = EditorApplication.ExecuteMenuItem(command.Substring(5)) ? "menu ok" : "menu not found";
                }
                else if (command == "play")
                {
                    EditorApplication.isPlaying = true;
                    result = "entering play mode";
                }
                else if (command == "stop")
                {
                    EditorApplication.isPlaying = false;
                    result = "leaving play mode";
                }
                else if (command == "state")
                {
                    result = State();
                }
                else if (command.StartsWith("shot:"))
                {
                    result = Shot(command.Substring(5));
                }
                else if (command == "quit")
                {
                    File.WriteAllText(ResultPath, $"{DateTime.Now:o} quit -> closing\n");
                    EditorApplication.Exit(0);
                    return;
                }
                else
                {
                    result = "unknown command";
                }
            }
            catch (Exception e)
            {
                result = "error: " + e.Message;
            }
            File.WriteAllText(ResultPath, $"{DateTime.Now:o} {command} -> {result}\n");
        }

        static Vector3 ParseVector(string text)
        {
            var v = text.Split(',').Select(t => float.Parse(t, CultureInfo.InvariantCulture)).ToArray();
            return new Vector3(v[0], v[1], v[2]);
        }

        /// <summary>shot:name;x,y,z;tx,ty,tz;fov - render the open scene from a point, looking at a target.</summary>
        public static string Shot(string args)
        {
            var parts = args.Split(';');
            float fov = parts.Length > 3 ? float.Parse(parts[3], CultureInfo.InvariantCulture) : 60f;
            const int width = 1600, height = 900;
            var go = new GameObject("__PortKitShotCamera") { hideFlags = HideFlags.HideAndDontSave };
            var rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
            try
            {
                var cam = go.AddComponent<Camera>();
                cam.transform.position = ParseVector(parts[1]);
                cam.transform.LookAt(ParseVector(parts[2]));
                cam.fieldOfView = fov;
                cam.nearClipPlane = 0.05f;
                cam.farClipPlane = 5000f;
                cam.clearFlags = CameraClearFlags.Skybox;
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();
                RenderTexture.active = null;
                cam.targetTexture = null;
                Directory.CreateDirectory(Dir + "/shots");
                File.WriteAllBytes($"{Dir}/shots/{parts[0]}.jpg", tex.EncodeToJPG(88));
                return "shot saved";
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                rt.Release();
                UnityEngine.Object.DestroyImmediate(rt);
                UnityEngine.Object.DestroyImmediate(tex);
            }
        }
    }
}
