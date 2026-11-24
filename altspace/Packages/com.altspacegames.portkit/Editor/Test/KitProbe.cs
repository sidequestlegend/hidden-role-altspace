using System;
using System.Collections;
using System.Globalization;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace PortKit
{
    /// <summary>
    /// Built-in Play-mode test commands that read what the page cannot: the state of a kit object in Unity, so a test can
    /// tell that a relay op really reached it (from the spike's own commands; every game's test needs them).
    ///
    ///   probe &lt;holder&gt; &lt;what&gt; &lt;path under the kit root, or .&gt; [property]
    ///       exists | pos | text | active | layer | netid | color &lt;property&gt; | matfloat &lt;property&gt; | uicolor | scale | ison | slider
    ///       | animenabled | audio | audioplaying | animstate [layer] [state name] | velocity | kinematic
    ///   probe - head                           where the local player's view is (the main camera)
    ///   hits                                   what the test server has served, per path
    ///
    /// Arguments are separated by spaces: write a space inside a path as %20. "pos" is the middle of what a pointer
    /// would hit (a collider's bounds, else a UI rectangle, else the object), ready for click / press.
    /// </summary>
    [InitializeOnLoad]
    public static class KitProbe
    {
        static KitProbe()
        {
            KitPlayTest.Commands["probe"] = Probe;
            KitPlayTest.Commands["hits"] = (a, reply) =>
            {
                reply(PlayPort.IsClone ? "(served by the main editor)" : string.Join(", ", TestServer.Hits.OrderBy(h => h.Key, StringComparer.Ordinal).Select(h => $"{h.Key} x{h.Value}")));
                return null;
            };
        }

        /// <summary>The object at `path` under the kit root of the holder object named `holder` ("." for the root).</summary>
        public static Transform Find(string holder, string path)
        {
            var go = GameObject.Find(holder);
            if (go == null || go.transform.childCount == 0) return null;
            var root = go.transform.GetChild(0);
            path = path.Replace("%20", " ");
            return path == "." ? root : root.Find(path);
        }

        static string F(float v) => v.ToString("F3", CultureInfo.InvariantCulture);

        /// <summary>A component, or a real null: GetComponent's "missing" object in the editor is not null to `?.` and `is`.</summary>
        static T C<T>(Transform t) where T : Component
        {
            var c = t.GetComponent<T>();
            return c != null ? c : null;
        }

        /// <summary>The kit's probe command: a game that registers a "probe" of its own can hand it every reader it does not have.</summary>
        public static IEnumerator Probe(string[] a, Action<string> reply)
        {
            string what = a.Length > 1 ? a[1] : "";
            if (what == "exists") { reply((GameObject.Find(a[0]) != null).ToString()); return null; }
            if (what == "head")
            {
                // probe - head: where the local player's view is (the main camera), for checking what the page thinks
                var cam = Camera.main;
                reply(cam == null ? "error: no main camera" : $"{F(cam.transform.position.x)} {F(cam.transform.position.y)} {F(cam.transform.position.z)}");
                return null;
            }
            var t = Find(a[0], a.Length > 2 ? a[2] : ".");
            if (t == null) { reply("error: not found"); return null; }
            switch (what)
            {
                case "pos":
                    var collider = t.GetComponent<Collider>();
                    Vector3 p = collider != null && collider.enabled && t.gameObject.activeInHierarchy ? collider.bounds.center
                        : t is RectTransform rect ? rect.TransformPoint(rect.rect.center) : t.position;
                    reply($"{F(p.x)} {F(p.y)} {F(p.z)}");
                    break;
                case "text":
                    var tmp = t.GetComponent<TMPro.TMP_Text>();
                    reply(tmp != null ? tmp.text : t.GetComponent<Text>()?.text ?? "error: no text");
                    break;
                case "active": reply(t.gameObject.activeInHierarchy.ToString()); break;
                case "layer": reply(t.gameObject.layer.ToString(CultureInfo.InvariantCulture)); break;
                case "netid":
                    var id = t.GetComponent<BS.BSObjectId>();
                    reply(id == null ? "error: no BS Object Id" : id.Id + (t.GetComponent<BS.BSSyncedObject>() != null ? "" : " (no synced object)"));
                    break;
                case "color":
                    var c = t.GetComponent<Renderer>().material.GetColor(a[3]);
                    reply($"{F(c.r)} {F(c.g)} {F(c.b)} {F(c.a)}");
                    break;
                case "matfloat": reply(F(t.GetComponent<Renderer>().material.GetFloat(a[3]))); break;
                case "uicolor":
                    var u = t.GetComponent<Graphic>().color;
                    reply($"{F(u.r)} {F(u.g)} {F(u.b)} {F(u.a)}");
                    break;
                case "scale": reply($"{F(t.localScale.x)} {F(t.localScale.y)} {F(t.localScale.z)}"); break;
                case "ison": reply(C<Toggle>(t)?.isOn.ToString() ?? "error: no toggle"); break;
                case "slider": reply(C<Slider>(t) is Slider sl ? F(sl.value) : "error: no slider"); break;
                case "animenabled": reply(C<Animator>(t)?.enabled.ToString() ?? "error: no animator"); break;
                case "audio": reply(C<AudioSource>(t) is AudioSource au ? $"{F(au.pitch)} {F(au.volume)}" : "error: no audio source"); break;
                case "audioplaying": reply(C<AudioSource>(t) is AudioSource ap ? ap.isPlaying.ToString() : "error: no audio source"); break;
                case "animstate":
                {
                    // animstate <holder> <path> [layer] [state name]: the current state of a layer (the next one while a
                    // transition runs is not it): its hashes and normalized time, and with a name whether it IsName that
                    var animator = C<Animator>(t);
                    if (animator == null) { reply("error: no animator"); break; }
                    int layer = a.Length > 3 && int.TryParse(a[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out int l) ? l : 0;
                    if (layer < 0 || layer >= animator.layerCount) { reply($"error: no layer {layer} ({animator.layerCount} layers)"); break; }
                    var state = animator.GetCurrentAnimatorStateInfo(layer);
                    string named = a.Length > 4 ? $" is {a[4].Replace("%20", " ")} {state.IsName(a[4].Replace("%20", " "))}" : "";
                    reply($"short {state.shortNameHash} full {state.fullPathHash} time {F(state.normalizedTime)} transition {animator.IsInTransition(layer)}{named}");
                    break;
                }
                case "velocity": reply(C<Rigidbody>(t) is Rigidbody rb ? $"{F(rb.linearVelocity.x)} {F(rb.linearVelocity.y)} {F(rb.linearVelocity.z)}" : "error: no rigidbody"); break;
                case "kinematic": reply(C<Rigidbody>(t)?.isKinematic.ToString() ?? "error: no rigidbody"); break;
                default: reply("error: no such probe"); break;
            }
            return null;
        }
    }
}
