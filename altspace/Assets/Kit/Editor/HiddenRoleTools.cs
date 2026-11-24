// Editor tools of the hidden-role kit (never in the bundle):
//
//   HiddenRole/Check Walkable     the station's colliders against the rules' walkable test (Logs/hiddenrole_walkable.txt)
//   HiddenRole/Kit Stats          what the kit draws: renderers, materials, triangles, textures (Logs/hiddenrole_stats.txt)
//
// and three Play-mode test commands (PKTEST CMD <id> ...), added to portkit's KitPlayTest:
//
//   walk <x> <z> [speed]   the Play-mode player walks to a world point as a body would: a capsule (radius 0.25 m, 1.7 m
//                          tall) moved at walking speed (default 3 m/s) that slides along whatever solid it meets, and
//                          stands still while the page has movement locked. The SDK's desktop player is a fly camera
//                          that passes through walls, so this is the test's own walker; what it reports ("reached",
//                          "blocked by ...") is what the kit's colliders allow. Answers when it arrives or is stopped.
//   where                  the desktop player's feet and camera position
//   stats                  the Game view's last frame: triangles, batches, SetPass calls (UnityStats)
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using PortKit;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace HiddenRole
{
    [InitializeOnLoad]
    public static class HiddenRoleTools
    {
        public const float BodyRadius = 0.25f, BodyHeight = 1.7f, StepUp = 0.3f;
        /// <summary>What a body meets: every layer but UI, Menu and the player's own (README of the SDK, "Layers").</summary>
        public const int SolidMask = ~((1 << 5) | (1 << 22) | (1 << 23) | (1 << 24));

        static HiddenRoleTools()
        {
            KitPlayTest.Commands["walk"] = Walk;
            KitPlayTest.Commands["where"] = (a, reply) => { reply(Where()); return null; };
            KitPlayTest.Commands["stats"] = (a, reply) => { reply(Stats()); return null; };
        }

        static string F(float v) => v.ToString("F2", CultureInfo.InvariantCulture);

        /// <summary>The SDK's desktop player (BS.BSDesktopController.Instance), found by name so this file needs no SDK reference.</summary>
        static Transform Player()
        {
            var type = GraphTypes.Find("BS.BSDesktopController");
            var instance = type?.GetProperty("Instance", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)?.GetValue(null) as Component;
            return instance != null ? instance.transform : null;
        }

        static string Where()
        {
            var p = Player();
            if (p == null) return "error: no desktop player";
            var cam = Camera.main;
            return $"{F(p.position.x)} {F(p.position.y)} {F(p.position.z)}" + (cam != null ? $" camera {F(cam.transform.position.x)} {F(cam.transform.position.y)} {F(cam.transform.position.z)}" : "");
        }

        static string Stats() =>
            $"triangles {UnityStats.triangles} vertices {UnityStats.vertices} batches {UnityStats.batches} drawcalls {UnityStats.drawCalls} " +
            $"setpass {UnityStats.setPassCalls} shadowcasters {UnityStats.shadowCasters} frame {UnityStats.frameTime * 1000:F1}ms render {UnityStats.renderTime * 1000:F1}ms";

        /// <summary>The client's movement lock (scene.SetCanMove), as the SDK's own player reads it.</summary>
        static bool CanMove()
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("SideQuest.FlexaBody.ActionsSystem", false)).FirstOrDefault(t => t != null);
            var field = type?.GetField("canMove", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
            return field == null || (bool)field.GetValue(null);
        }

        static void Capsule(Vector3 feet, out Vector3 a, out Vector3 b)
        {
            a = feet + Vector3.up * (StepUp + BodyRadius);
            b = feet + Vector3.up * (BodyHeight - BodyRadius);
        }

        static IEnumerator Walk(string[] args, Action<string> reply)
        {
            var player = Player();
            if (player == null) { reply("error: no desktop player"); yield break; }
            var target = new Vector3(float.Parse(args[0], CultureInfo.InvariantCulture), 0, float.Parse(args[1], CultureInfo.InvariantCulture));
            float speed = args.Length > 2 ? float.Parse(args[2], CultureInfo.InvariantCulture) : 3f;
            double last = EditorApplication.timeSinceStartup;
            double give = last + Vector3.Distance(Flat(player.position), target) / speed * 2 + 6;
            double lastProgress = last;
            float best = float.MaxValue;
            string blocker = "";
            while (true)
            {
                yield return null;
                if (!EditorApplication.isPlaying || player == null) { reply("error: Play mode ended"); yield break; }
                double now = EditorApplication.timeSinceStartup;
                float dt = Mathf.Min(0.1f, (float)(now - last));
                last = now;
                var here = player.position;
                var flat = target - Flat(here);
                flat.y = 0;
                float left = flat.magnitude;
                if (left < 0.12f) { reply($"ok reached {F(here.x)} {F(here.z)}"); yield break; }
                if (left < best - 0.02f) { best = left; lastProgress = now; }
                if (now - lastProgress > 1.5 || now > give)
                {
                    reply($"blocked at {F(here.x)} {F(here.z)}, {F(left)} m short" + (blocker.Length > 0 ? " by " + blocker : "") + (CanMove() ? "" : " (movement locked)"));
                    yield break;
                }
                if (!CanMove()) continue;
                var move = flat.normalized * Mathf.Min(left, speed * dt);
                // move and slide: up to three tries along what was hit
                for (int i = 0; i < 3 && move.sqrMagnitude > 1e-8f; i++)
                {
                    Capsule(here, out var a, out var b);
                    if (Physics.CapsuleCast(a, b, BodyRadius * 0.98f, move.normalized, out var hit, move.magnitude + 0.01f, SolidMask, QueryTriggerInteraction.Ignore))
                    {
                        blocker = hit.collider.name + " " + hit.collider.GetType().Name;
                        float go = Mathf.Max(0, hit.distance - 0.01f);
                        here += move.normalized * go;
                        var rest = move - move.normalized * go;
                        var normal = hit.normal;
                        normal.y = 0;
                        move = normal.sqrMagnitude > 1e-6f ? Vector3.ProjectOnPlane(rest, normal.normalized) : Vector3.zero;
                    }
                    else
                    {
                        here += move;
                        move = Vector3.zero;
                    }
                }
                player.position = here;
            }
        }

        static Vector3 Flat(Vector3 v) => new Vector3(v.x, 0, v.z);

        // ------------------------------------------------------------------ the collider check

        [MenuItem("HiddenRole/Check Walkable")]
        public static void CheckWalkable()
        {
            var report = new StringBuilder();
            bool ok = false;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            try
            {
                var builder = new HiddenRoleKitBuilder();
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(builder.PrefabPath) ?? throw new Exception("no kit prefab: PortKit/Kit/Build Prefabs first");
                var grid = JObject.Parse(File.ReadAllText("ts/vectors/walkable-grid.json"));
                var origin = new Vector3(0, 500, 0);                         // far from anything else loaded
                var kit = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                PrefabUtility.UnpackPrefabInstance(kit, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
                kit.transform.position = origin;
                // the bound objects the runtime switches off, and the panel and shell the page moves in front of the head:
                // switched off here as the page does (none of them is solid; this proves it stays so)
                Physics.SyncTransforms();
                float step = (float)grid["step"], x0 = (float)grid["x0"], y0 = (float)grid["y0"];
                int nx = (int)grid["nx"], ny = (int)grid["ny"];
                var rows = grid["rows"].Select(r => (string)r).ToArray();
                float r0 = (float)grid["radius"];
                if (Mathf.Abs(r0 - BodyRadius) > 1e-4f) report.AppendLine($"note: the grid was made for a body of {r0} m, the check uses {BodyRadius} m");
                var free = new bool[nx, ny];
                int openTwo = 0, blockedTwo = 0;
                var examples = new List<string>();
                for (int j = 0; j < ny; j++)
                    for (int i = 0; i < nx; i++)
                    {
                        var feet = origin + new Vector3(x0 + i * step, 0, y0 + j * step);
                        Capsule(feet, out var a, out var b);
                        free[i, j] = !Physics.CheckCapsule(a, b, BodyRadius, SolidMask, QueryTriggerInteraction.Ignore);
                        if (rows[j][i] != '2') continue;
                        openTwo++;
                        if (!free[i, j])
                        {
                            blockedTwo++;
                            if (examples.Count < 12)
                            {
                                var hits = Physics.OverlapCapsule(a, b, BodyRadius, SolidMask, QueryTriggerInteraction.Ignore);
                                examples.Add($"   solid where the rules are open: map {F(x0 + i * step)}, {F(y0 + j * step)}: {string.Join(", ", hits.Select(h => KitStage.KitPath(h.transform, kit.transform)))}");
                            }
                        }
                    }
                // what a body can reach from the Commons, a quarter metre at a time (each step checked half way too)
                var map = JObject.Parse(File.ReadAllText(HiddenRoleKitBuilder.MapPath));
                var spawn = map["spawns"][7];
                int si = Mathf.RoundToInt(((float)spawn[0] - x0) / step), sj = Mathf.RoundToInt(((float)spawn[1] - y0) / step);
                var reached = new bool[nx, ny];
                var queue = new Queue<(int, int)>();
                if (free[si, sj]) { reached[si, sj] = true; queue.Enqueue((si, sj)); }
                else report.AppendLine($"FAIL the start point (map {spawn}) is not free");
                int reachable = 0, outside = 0;
                var outsideExamples = new List<string>();
                while (queue.Count > 0)
                {
                    var (i, j) = queue.Dequeue();
                    reachable++;
                    if (rows[j][i] == '0')
                    {
                        outside++;
                        if (outsideExamples.Count < 12) outsideExamples.Add($"   reachable where the rules are blocked: map {F(x0 + i * step)}, {F(y0 + j * step)}");
                    }
                    foreach (var (di, dj) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) })
                    {
                        int a2 = i + di, b2 = j + dj;
                        if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= ny || reached[a2, b2] || !free[a2, b2]) continue;
                        var mid = origin + new Vector3(x0 + (i + a2) * step / 2, 0, y0 + (j + b2) * step / 2);
                        Capsule(mid, out var ma, out var mb);
                        if (Physics.CheckCapsule(ma, mb, BodyRadius, SolidMask, QueryTriggerInteraction.Ignore)) continue;
                        reached[a2, b2] = true;
                        queue.Enqueue((a2, b2));
                    }
                }
                // the rules' own connected open area from the same point, over '2' points: all of it should be reachable
                var rulesSeen = new bool[nx, ny];
                var q2 = new Queue<(int, int)>();
                int rulesConnected = 0, unreachable = 0;
                var unreachableExamples = new List<string>();
                if (rows[sj][si] == '2') { rulesSeen[si, sj] = true; q2.Enqueue((si, sj)); }
                while (q2.Count > 0)
                {
                    var (i, j) = q2.Dequeue();
                    rulesConnected++;
                    if (!reached[i, j])
                    {
                        unreachable++;
                        if (unreachableExamples.Count < 12) unreachableExamples.Add($"   open to the rules but out of a body's reach: map {F(x0 + i * step)}, {F(y0 + j * step)}");
                    }
                    foreach (var (di, dj) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) })
                    {
                        int a2 = i + di, b2 = j + dj;
                        if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= ny || rulesSeen[a2, b2] || rows[b2][a2] != '2') continue;
                        rulesSeen[a2, b2] = true;
                        q2.Enqueue((a2, b2));
                    }
                }
                report.AppendLine($"grid {nx} x {ny} at {F(step)} m, body radius {F(BodyRadius)} m, height {F(BodyHeight)} m (from {F(StepUp)} m)");
                report.AppendLine($"{(blockedTwo == 0 ? "PASS" : "FAIL")} nothing solid where the rules give a body room: {openTwo - blockedTwo} of {openTwo} clear points free, {blockedTwo} blocked");
                foreach (var e in examples) report.AppendLine(e);
                report.AppendLine($"{(outside == 0 ? "PASS" : "FAIL")} a body reaches nothing the rules call blocked: {reachable} points reachable from the Commons, {outside} of them blocked to the rules");
                foreach (var e in outsideExamples) report.AppendLine(e);
                report.AppendLine($"{(unreachable == 0 ? "PASS" : "FAIL")} everything the rules connect is reachable: {rulesConnected - unreachable} of {rulesConnected} connected clear points reached");
                foreach (var e in unreachableExamples) report.AppendLine(e);
                ok = blockedTwo == 0 && outside == 0 && unreachable == 0 && reachable > 0;
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); }
            finally { EditorSceneManager.CloseScene(scene, true); }
            report.AppendLine(ok ? "DONE" : "FAILED");
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/hiddenrole_walkable.txt", report.ToString());
        }

        /// <summary>Debugging aid: runs Library/PortKit/eval.js in the Play-mode page (its console.log lines reach Editor.log).</summary>
        [MenuItem("HiddenRole/Eval Page Script")]
        public static void EvalPage()
        {
            if (!EditorApplication.isPlaying) { Debug.LogWarning("[hidden-role] not in Play mode"); return; }
            KitPlayTest.Evaluate(File.ReadAllText(PortKitRemote.Dir + "/eval.js"));
        }

        // ------------------------------------------------------------------ what the kit draws

        [MenuItem("HiddenRole/Kit Stats")]
        public static void KitStats()
        {
            var report = new StringBuilder();
            try
            {
                var builder = new HiddenRoleKitBuilder();
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(builder.PrefabPath) ?? throw new Exception("no kit prefab");
                var renderers = prefab.GetComponentsInChildren<Renderer>(true);
                int tris = 0, text = 0;
                var meshes = new HashSet<Mesh>();
                foreach (var r in renderers)
                {
                    var mf = r.GetComponent<MeshFilter>();
                    if (mf != null && mf.sharedMesh != null) { tris += (int)(mf.sharedMesh.GetIndexCount(0) / 3); meshes.Add(mf.sharedMesh); }
                    if (r.GetComponent<TMPro.TMP_Text>() != null) text++;
                }
                var materials = renderers.SelectMany(r => r.sharedMaterials).Where(m => m != null).Distinct().ToList();
                var textures = materials.SelectMany(m => m.GetTexturePropertyNames().Select(m.GetTexture)).Where(t => t != null).Distinct().ToList();
                long texBytes = textures.Sum(t => UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(t));
                var station = prefab.transform.Find("Station/Regions");
                int shellRenderers = station != null ? station.GetComponentsInChildren<Renderer>(true).Length : 0;
                report.AppendLine($"renderers {renderers.Length} ({shellRenderers} in the station's regions, {text} texts), meshes {meshes.Count}, mesh triangles (text excluded) {tris}");
                report.AppendLine($"materials {materials.Count}: {string.Join(", ", materials.Select(m => m.name))}");
                report.AppendLine($"textures {textures.Count}: {string.Join(", ", textures.Select(t => $"{t.name} {t.width}x{t.height}"))}; {texBytes / 1024} KB in the editor");
                report.AppendLine($"colliders {prefab.GetComponentsInChildren<Collider>(true).Length}");
                report.AppendLine(HiddenRoleKitBuilder.LastStats);
                foreach (var folder in new[] { "android", "windows" })
                {
                    string file = KitBundles.BundlePath(folder, builder.Slug);
                    if (File.Exists(file)) report.AppendLine($"bundle {folder}: {new FileInfo(file).Length / 1024} KB");
                }
                report.AppendLine("DONE");
            }
            catch (Exception e) { report.AppendLine("FAILED: " + e); }
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/hiddenrole_stats.txt", report.ToString());
        }
    }
}
