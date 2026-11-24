// Editor tools of the hidden-role kit (never in the bundle):
//
//   HiddenRole/Check Walkable     the station's colliders against the rules' walkable test (Logs/hiddenrole_walkable.txt)
//   HiddenRole/Kit Stats          what the kit draws: renderers, materials, triangles, textures (Logs/hiddenrole_stats.txt)
//
// and one Play-mode test command (PKTEST CMD <id> ...), added to portkit's KitPlayTest (walking, where and place are
// portkit's own now, InputSim):
//
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
            KitPlayTest.Commands["stats"] = (a, reply) => { reply(Stats()); return null; };
        }

        static string F(float v) => v.ToString("F2", CultureInfo.InvariantCulture);

        static string Stats() =>
            $"triangles {UnityStats.triangles} vertices {UnityStats.vertices} batches {UnityStats.batches} drawcalls {UnityStats.drawCalls} " +
            $"setpass {UnityStats.setPassCalls} shadowcasters {UnityStats.shadowCasters} frame {UnityStats.frameTime * 1000:F1}ms render {UnityStats.renderTime * 1000:F1}ms";

        static void Capsule(Vector3 feet, out Vector3 a, out Vector3 b)
        {
            a = feet + Vector3.up * (StepUp + BodyRadius);
            b = feet + Vector3.up * (BodyHeight - BodyRadius);
        }

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
