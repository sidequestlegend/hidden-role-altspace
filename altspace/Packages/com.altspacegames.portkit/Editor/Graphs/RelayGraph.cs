using System;
using System.Collections.Generic;
using System.Linq;
using Unity.VisualScripting;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// The one generated graph on a kit's root for what the page cannot reach directly (README, "Relay graph").
    ///
    /// Page to graph: scene.SendToVisualScripting("pk1", "&lt;slug&gt;:&lt;inst&gt;|&lt;op&gt;|&lt;targetIndex&gt;|&lt;arg&gt;...^&lt;op&gt;|&lt;targetIndex&gt;|&lt;arg&gt;...").
    /// The text arrives as a JSON string (in double quotes), its arguments percent-coded; "^" separates the records of
    /// a batch. A graph acts only on payloads whose first part matches its holder's name ("pk1:&lt;slug&gt;:&lt;inst&gt;"); the
    /// target index picks an object from the root's "Refs" list.
    ///
    /// Graph to page: window.__pk1.clock("&lt;slug&gt;:&lt;inst&gt;", "&lt;request id&gt;", "&lt;seconds&gt;") in answer to the clock op, and
    /// window.__pk1.event("&lt;slug&gt;:&lt;inst&gt;", "&lt;kind&gt;", "&lt;targetIndex&gt;[|&lt;value&gt;]") for the bindings events only a graph hears:
    /// a uGUI button (uiButton), a uGUI slider (uiSlider, with its new value), and the buttons of the hand holding an
    /// object (heldTrigger, heldPrimary, heldSecondary, with "left" or "right": BS Held Events reports to graphs,
    /// never to the page).
    ///
    /// The op table is a list (Ops): a game's kit builder adds its own in KitBuilder.RelayOps. Every member used is on
    /// the SDK allow list (GraphWriter.Save throws otherwise).
    /// </summary>
    public static class RelayGraph
    {
        public const string Tag = "pk1";
        /// <summary>
        /// The Object variable (a list of AudioClips) on an object that holds clips: the same list as its BS Audio Source's, for
        /// the audio op (the allow list has no member of BS Audio Source). The kit builder writes it with every $clip it encodes.
        /// </summary>
        public const string ClipsVariable = "PkClips";
        /// <summary>
        /// The Object variable on a TMP_InputField's object: the text last reported to the page or set by it. The relay graph
        /// reports the field's text when it differs and the field is not being edited (TMP_InputField's own events are not on
        /// the allow list: they need a listener delegate). The kit builder declares it with the field's starting text.
        /// </summary>
        public const string FieldVariable = "PkField";

        /// <summary>
        /// The pending launches (rbLaunch), one per target: the graph variable PkLaunches lists the objects with one pending,
        /// and each object holds its own in the Object variables PkLaunchVelocity and PkLaunchSteps (the kit builder declares
        /// them on every object with a Rigidbody; a spawned copy carries them). It was one pending launch per kit in graph
        /// variables, so two launches in one physics step lost the first (found by beer pong).
        /// </summary>
        public const string Launches = "PkLaunches", LaunchVelocity = "PkLaunchVelocity", LaunchSteps = "PkLaunchSteps";

        /// <summary>The op (and the graph event that answers it) for where the app places a session's head: Networking.HeadOf.</summary>
        public const string HeadOp = "pkHead";

        /// <summary>The event kinds a graph has to relay, because the page has no event of its own for them.</summary>
        public static readonly string[] RelayedKinds = { "uiButton", "uiSlider", "uiToggle", "heldTrigger", "heldPrimary", "heldSecondary", "field" };

        public readonly struct Event
        {
            public readonly int RefIndex;
            public readonly string Kind;
            public Event(int refIndex, string kind) { RefIndex = refIndex; Kind = kind; }
        }

        /// <summary>
        /// The ops of one relay graph, in the order they are tested. An op's body adds its steps with `g`; it reads
        /// the target object (Target), its arguments as sent (Arg: numbers and names) or decoded (Text: free text).
        /// </summary>
        public sealed class Ops
        {
            public readonly GraphWriter g;
            readonly List<(string name, Action body)> list = new List<(string, Action)>();
            internal Func<int, Val> Part;
            /// <summary>The object the record's target index names (refs order); read inside an op's body.</summary>
            public Val Target { get; internal set; }

            internal Ops(GraphWriter g) { this.g = g; }

            /// <summary>Argument `i` (0 is the first after the target index), as it was sent.</summary>
            public Val Arg(int i) => Part(2 + i);
            /// <summary>Argument `i` as the text it stood for.</summary>
            public Val Text(int i) => g.DecodeArg(Arg(i));
            public Val Number(int i) => g.ParseFloat(Arg(i));
            public Val Whole(int i) => g.ParseInt(Arg(i));
            public Val Flag(int i) => g.Same(Arg(i), "1");
            /// <summary>new Color from four arguments starting at `i`.</summary>
            public Val Colour(int i) => g.Rgba(Number(i), Number(i + 1), Number(i + 2), Number(i + 3));

            /// <summary>
            /// The material of a renderer that property argument `i` names, and the property: "#2:_Color" is slot 2
            /// (one of renderer.materials), "_Color" alone slot 0 (renderer.material).
            /// </summary>
            public (Val material, Val property) Material(Val renderer, int i)
            {
                var argument = g.Keep(Arg(i));
                var slotted = g.Keep(g.StartsWith(argument, "#"));
                var colon = g.Keep(g.Call(typeof(string), "IndexOf", new[] { typeof(string) }, argument, ":"));
                var property = g.Keep(g.Select(slotted, g.Substring(argument, g.RoundToInt(colon + 1f)), argument, typeof(string)));
                var material = g.Keep(g.Select(slotted,
                    g.ListItem(g.Get(typeof(Renderer), "materials", renderer), g.ParseInt(g.Substring(argument, 1, g.RoundToInt(colon - 1f))), typeof(Material)),
                    g.Get(typeof(Renderer), "material", renderer), typeof(Material)));
                return (material, property);
            }

            /// <summary>Do `body` with the target's component of `type`, if it has one.</summary>
            public void With(Type type, Action<Val> body)
            {
                var component = g.Keep(g.ComponentOf(Target, type));
                g.IfNotNull(component, () => body(component));
            }

            public void Add(string name, Action body)
            {
                if (name == "clock" || name == HeadOp || list.Any(o => o.name == name)) throw new Exception($"relay op '{name}' is defined twice");
                list.Add((name, body));
            }

            public IEnumerable<string> Names => list.Select(o => o.name);
            internal (string, Action)[] Cases => list.ToArray();
        }

        /// <summary>The README's op table (but clock, which has no target).</summary>
        static void Standard(Ops ops)
        {
            var g = ops.g;
            ops.Add("text", () =>
            {
                var text = g.Keep(ops.Text(0));
                // an input field first (its text, without its events; and remembered, so the field event does not echo it),
                // then a TMP text, then a legacy text
                var field = g.Keep(g.ComponentOf(ops.Target, typeof(TMPro.TMP_InputField)));
                g.IfNotNull(field, () =>
                {
                    g.Do(typeof(TMPro.TMP_InputField), "SetTextWithoutNotify", new[] { typeof(string) }, field, text);
                    g.SetObjVar(FieldVariable, text, ops.Target, typeof(string));
                }, () =>
                {
                    var tmp = g.Keep(g.ComponentOf(ops.Target, typeof(TMPro.TMP_Text)));
                    g.IfNotNull(tmp, () => g.Set(typeof(TMPro.TMP_Text), "text", tmp, text),
                        () => ops.With(typeof(UnityEngine.UI.Text), legacy => g.Set(typeof(UnityEngine.UI.Text), "text", legacy, text)));
                });
            });
            ops.Add("active", () => g.Do(typeof(GameObject), "SetActive", new[] { typeof(bool) }, ops.Target, ops.Flag(0)));
            ops.Add("animBool", () => ops.With(typeof(Animator), a => g.Do(typeof(Animator), "SetBool", new[] { typeof(string), typeof(bool) }, a, ops.Arg(0), ops.Flag(1))));
            ops.Add("animFloat", () => ops.With(typeof(Animator), a => g.Do(typeof(Animator), "SetFloat", new[] { typeof(string), typeof(float) }, a, ops.Arg(0), ops.Number(1))));
            ops.Add("animInt", () => ops.With(typeof(Animator), a => g.Do(typeof(Animator), "SetInteger", new[] { typeof(string), typeof(int) }, a, ops.Arg(0), ops.Whole(1))));
            ops.Add("animTrigger", () => ops.With(typeof(Animator), a => g.Do(typeof(Animator), "SetTrigger", new[] { typeof(string) }, a, ops.Arg(0))));
            ops.Add("animResetTrigger", () => ops.With(typeof(Animator), a => g.Do(typeof(Animator), "ResetTrigger", new[] { typeof(string) }, a, ops.Arg(0))));
            ops.Add("animPlay", () => ops.With(typeof(Animator), a =>
            {
                // state name, cross-fade in seconds (0: cut)
                var fade = g.Keep(ops.Number(1));
                g.If(g.Greater(fade, 0f),
                    () => g.Do(typeof(Animator), "CrossFadeInFixedTime", new[] { typeof(string), typeof(float) }, a, ops.Arg(0), fade),
                    () => g.Do(typeof(Animator), "Play", new[] { typeof(string) }, a, ops.Arg(0)));
            }));
            ops.Add("particles", () => ops.With(typeof(ParticleSystem), p => g.If(g.Same(ops.Arg(0), "play"),
                () => g.Do(typeof(ParticleSystem), "Play", Type.EmptyTypes, p),
                () => g.Do(typeof(ParticleSystem), "Stop", Type.EmptyTypes, p))));
            ops.Add("color", () => ops.With(typeof(Renderer), r =>
            {
                var (material, property) = ops.Material(r, 0);
                g.Do(typeof(Material), "SetColor", new[] { typeof(string), typeof(Color) }, material, property, ops.Colour(1));
            }));
            ops.Add("matFloat", () => ops.With(typeof(Renderer), r =>
            {
                var (material, property) = ops.Material(r, 0);
                g.Do(typeof(Material), "SetFloat", new[] { typeof(string), typeof(float) }, material, property, ops.Number(1));
            }));
            ops.Add("uiColor", () => ops.With(typeof(UnityEngine.UI.Graphic), graphic => g.Set(typeof(UnityEngine.UI.Graphic), "color", graphic, ops.Colour(0))));
            // audio | <target> | <clip index> | <holder's refs index>: PlayOneShot of clip n of the holder's PkClips list
            // through the target's AudioSource (the holder is the target itself when it plays a clip of its own list)
            ops.Add("audio", () => ops.With(typeof(AudioSource), source =>
            {
                var holder = g.Keep(g.KitRef(ops.Whole(1)));
                g.IfNotNull(holder, () =>
                {
                    var clip = g.Keep(g.ListItem(g.ObjVarOf(holder, ClipsVariable, typeof(System.Collections.IList)), ops.Whole(0), typeof(AudioClip)));
                    g.IfNotNull(clip, () => g.Do(typeof(AudioSource), "PlayOneShot", new[] { typeof(AudioClip) }, source, clip));
                });
            }));
        }

        /// <summary>The ops the first game ports asked for (README op table).</summary>
        static void Added(Ops ops)
        {
            var g = ops.g;
            ops.Add("audioPitch", () => ops.With(typeof(AudioSource), s => g.Set(typeof(AudioSource), "pitch", s, ops.Number(0))));
            ops.Add("audioVolume", () => ops.With(typeof(AudioSource), s => g.Set(typeof(AudioSource), "volume", s, ops.Number(0))));
            // audioScaled | <target> | <clip index> | <holder's refs index> | <volume scale>: as audio, with PlayOneShot's volume scale
            ops.Add("audioScaled", () => ops.With(typeof(AudioSource), source =>
            {
                var holder = g.Keep(g.KitRef(ops.Whole(1)));
                g.IfNotNull(holder, () =>
                {
                    var clip = g.Keep(g.ListItem(g.ObjVarOf(holder, ClipsVariable, typeof(System.Collections.IList)), ops.Whole(0), typeof(AudioClip)));
                    g.IfNotNull(clip, () => g.Do(typeof(AudioSource), "PlayOneShot", new[] { typeof(AudioClip), typeof(float) }, source, clip, ops.Number(2)));
                });
            }));
            ops.Add("animEnabled", () => ops.With(typeof(Animator), a => g.Set(typeof(Animator), "enabled", a, ops.Flag(0))));
            ops.Add("uiSetToggle", () => ops.With(typeof(UnityEngine.UI.Toggle), t => g.Do(typeof(UnityEngine.UI.Toggle), "SetIsOnWithoutNotify", new[] { typeof(bool) }, t, ops.Flag(0))));
            ops.Add("uiSetSlider", () => ops.With(typeof(UnityEngine.UI.Slider), sl => g.Do(typeof(UnityEngine.UI.Slider), "SetValueWithoutNotify", new[] { typeof(float) }, sl, ops.Number(0))));
            ops.Add("scale", () => g.Set(typeof(Transform), "localScale", g.Get(typeof(GameObject), "transform", ops.Target), g.V3(ops.Number(0), ops.Number(1), ops.Number(2))));
            ops.Add("rbVelocity", () => ops.With(typeof(Rigidbody), rb => g.Set(typeof(Rigidbody), "linearVelocity", rb, g.V3(ops.Number(0), ops.Number(1), ops.Number(2)))));
            ops.Add("rbKinematic", () => ops.With(typeof(Rigidbody), rb => g.Set(typeof(Rigidbody), "isKinematic", rb, ops.Flag(0))));
            // rbLaunch | <target> | x | y | z: kinematic off now, the velocity on the second physics step after (the FixedUpdate
            // below). A synced body's SDK handoff (SyncedObjectPhysicsHandoff) sets the body's velocity to its tracked one,
            // zero at rest, in its first step once it is not kinematic, so a velocity set at once is lost (found by beer pong).
            ops.Add("rbLaunch", () => ops.With(typeof(Rigidbody), rb =>
            {
                g.Set(typeof(Rigidbody), "isKinematic", rb, false);
                // listed once: a second launch of the same object before the first has landed replaces it
                g.IfNotNull(g.GraphVar(Launches, typeof(System.Collections.IList)), () => { }, () => g.SetGraphVar(Launches, g.NewList(), typeof(System.Collections.IList)));
                g.If(g.Less(g.ObjVarOf(ops.Target, LaunchSteps, typeof(float)), 0.5f), () => g.ListAdd(g.GraphVar(Launches, typeof(System.Collections.IList)), ops.Target));
                g.SetObjVar(LaunchVelocity, g.V3(ops.Number(0), ops.Number(1), ops.Number(2)), ops.Target, typeof(Vector3));
                g.SetObjVar(LaunchSteps, 2f, ops.Target, typeof(float));
            }));
            // spawn | <template> | <name>: a copy under the template's parent, named, switched on; "@<parent path>/<name>" reaches it
            ops.Add("spawn", () =>
            {
                var parent = g.Keep(g.Get(typeof(Transform), "parent", g.Get(typeof(GameObject), "transform", ops.Target)));
                var copy = g.Keep(g.Call(typeof(GameObject), "Instantiate", new[] { typeof(UnityEngine.Object), typeof(Transform) }, null, ops.Target, parent));
                g.Set(typeof(GameObject), "name", copy, ops.Text(0));
                g.Do(typeof(GameObject), "SetActive", new[] { typeof(bool) }, copy, true);
            });
            ops.Add("despawn", () => g.Do(typeof(GameObject), "Destroy", new[] { typeof(UnityEngine.Object) }, null, ops.Target));
        }

        /// <summary>The names of the ops a graph built with `extra` answers to.</summary>
        public static List<string> OpNames(Action<Ops> extra = null)
        {
            var ops = new Ops(new GraphWriter());
            Standard(ops);
            Added(ops);
            extra?.Invoke(ops);
            return new[] { "clock", HeadOp }.Concat(ops.Names).ToList();
        }

        public static GraphWriter Build(IReadOnlyList<Event> events, Action<Ops> extra = null)
        {
            var g = new GraphWriter();
            Type clock = GraphTypes.Find("BS.SyncedClock");
            var ops = new Ops(g);
            Standard(ops);
            Added(ops);
            extra?.Invoke(ops);
            const string At = "PkAt", Next = "PkNext", TargetVariable = "PkTarget";
            g.Declare(At, null);
            g.Declare(Next, null);
            g.Declare(TargetVariable, null);
            g.Declare(Launches, null);

            // the pending launches: each one's velocity goes on in the second physics step after its op (see rbLaunch);
            // the list is made again with those still pending
            g.On(new FixedUpdate(), _ =>
            {
                var pending = g.Keep(g.GraphVar(Launches, typeof(System.Collections.IList)));
                g.IfNotNull(pending, () => g.If(g.Greater(g.Count(pending), 0f), () =>
                {
                    var keep = g.Keep(g.NewList());
                    g.ForEach(pending, typeof(GameObject), item => g.IfNotNull(item, () =>
                    {
                        var left = g.Keep(g.ObjVarOf(item, LaunchSteps, typeof(float)) - 1f);
                        g.SetObjVar(LaunchSteps, left, item, typeof(float));
                        g.If(g.Less(left, 0.5f), () =>
                        {
                            var body = g.Keep(g.ComponentOf(item, typeof(Rigidbody)));
                            g.IfNotNull(body, () => g.Set(typeof(Rigidbody), "linearVelocity", body, g.ObjVarOf(item, LaunchVelocity, typeof(Vector3))));
                            g.SetObjVar(LaunchSteps, 0f, item, typeof(float));
                        }, () => g.ListAdd(keep, item));
                    }));
                    g.SetGraphVar(Launches, keep, typeof(System.Collections.IList));
                }));
            });

            g.On(g.Platform("OnJsReturnValue", ("Return ID", Tag)), received =>
            {
                // SendToVisualScripting sends JSON: a text arrives inside double quotes
                var raw = g.Keep(g.EventOut(received, "Data", typeof(string)));
                var payload = g.Keep(g.Select(g.StartsWith(raw, "\""), g.Substring(raw, 1, g.RoundToInt(g.Length(raw) - 2f)), raw, typeof(string)));
                var instance = g.Keep(g.ListItem(g.Split(payload, "|"), 0, typeof(string)));
                g.If(g.Same(g.Concat("pk1:", instance), g.HolderName()), () =>
                {
                    // after "<slug>:<inst>|": one record, or several with "^" between them
                    var records = g.Split(g.Substring(payload, g.RoundToInt(g.Length(instance) + 1f)), "^");
                    g.ForEach(records, typeof(string), record =>
                    {
                        var parts = g.Keep(g.Split(record, "|"));
                        Val Part(int i) => g.ListItem(parts, i, typeof(string));
                        ops.Part = Part;
                        var op = g.Keep(Part(0));
                        g.If(g.Same(op, "clock"), () =>
                        {
                            // The shared clock is a double (Unix seconds): as a float it would be 128 s coarse. "F6" keeps microseconds;
                            // its decimal separator follows the device's language, so the text is cut around it and a dot put in.
                            var text = g.Keep(g.Call(typeof(double), "ToString", new[] { typeof(string) }, g.Get(clock, "NowSeconds"), "F6"));
                            var length = g.Keep(g.Length(text));
                            var seconds = g.Join(g.Before(text, g.RoundToInt(length - 7f)), ".", g.Substring(text, g.RoundToInt(length - 6f)));
                            g.InjectScript(g.Join("window.__pk1&&window.__pk1.clock(\"", g.Instance(), "\",\"", ops.Arg(0), "\",\"", seconds, "\")"));
                        }, () => g.If(g.Same(op, HeadOp), () =>
                        {
                            // pkHead | 0 | <request id> | <session id>: where the app places that session's head (the SDK's Get User State,
                            // which reads the user's Head transform; 0 0 0 for a user it does not know or has no body for yet), answered
                            // with the graph-to-page event pkHead (request id, x, y, z). No target, as the clock (from treasure hunt's op).
                            var head = g.Keep(g.PlatformValue("GetUserState", "Position", typeof(Vector3), ("id, uid, or name", ops.Text(1))));
                            g.PageEvent(HeadOp, ops.Arg(0), g.InvariantText(g.X(head)), g.InvariantText(g.Y(head)), g.InvariantText(g.Z(head)));
                        }, () =>
                        {
                            // the target: an index into Refs, or "@<path>" under the kit's root (walked child by child:
                            // neither Transform.Find nor GameObject.Find is on the allow list)
                            var field = g.Keep(Part(1));
                            g.If(g.StartsWith(field, "@"), () =>
                            {
                                g.SetGraphVar(At, g.Get(typeof(GameObject), "transform", g.KitRoot()), typeof(Transform));
                                g.ForEach(g.Split(g.DecodeArg(g.Substring(field, 1)), "/"), typeof(string), segment =>
                                {
                                    g.SetGraphVar(Next, g.Null(typeof(Transform)), typeof(Transform));
                                    g.IfNotNull(g.GraphVar(At, typeof(Transform)), () =>
                                        g.ForEach(g.GraphVar(At, typeof(Transform)), typeof(Transform), child =>
                                            g.If(g.Same(g.Get(typeof(Transform), "name", child), segment), () => g.SetGraphVar(Next, child, typeof(Transform)))));
                                    g.SetGraphVar(At, g.GraphVar(Next, typeof(Transform)), typeof(Transform));
                                });
                                // (a null fed to a member's target would mean "this object": the root must never stand in for a path that leads nowhere)
                                g.IfNotNull(g.GraphVar(At, typeof(Transform)),
                                    () => g.SetGraphVar(TargetVariable, g.Get(typeof(Transform), "gameObject", g.GraphVar(At, typeof(Transform))), typeof(GameObject)),
                                    () => g.SetGraphVar(TargetVariable, g.Null(typeof(GameObject)), typeof(GameObject)));
                            }, () => g.SetGraphVar(TargetVariable, g.KitRef(g.ParseInt(field)), typeof(GameObject)));
                            ops.Target = g.GraphVar(TargetVariable, typeof(GameObject));
                            g.IfNotNull(ops.Target, () => g.Switch(op, ops.Cases));
                        }));
                    });
                });
            });

            // ---- what only a graph hears, passed on to the page ----
            foreach (var e in events ?? Array.Empty<Event>())
            {
                int index = e.RefIndex;
                string kind = e.Kind;
                string unit = kind == "heldTrigger" ? "OnGunTrigger" : kind == "heldPrimary" ? "OnPrimaryDown" : kind == "heldSecondary" ? "OnSecondaryDown" : null;
                if (kind == "uiButton")
                    g.On(new OnButtonClick(), _ => g.PageEvent(kind, index), ("target", g.KitRef(index)));
                else if (kind == "uiSlider")
                    g.On(new OnSliderValueChanged(), slider => g.PageEvent(kind, index, g.InvariantText(g.EventOut(slider, "value", typeof(float)))), ("target", g.KitRef(index)));
                else if (kind == "uiToggle")
                    g.On(new OnToggleValueChanged(), toggle => g.PageEvent(kind, index, g.Select(g.EventOut(toggle, "value", typeof(bool)), "1", "0", typeof(string))), ("target", g.KitRef(index)));
                else if (kind == "field")
                    // TMP_InputField's events need a listener delegate (not on the allow list): the text is compared every
                    // frame instead, and reported once the field is no longer being edited
                    g.On(new Update(), _ =>
                    {
                        var target = g.Keep(g.KitRef(index));
                        var field = g.Keep(g.ComponentOf(target, typeof(TMPro.TMP_InputField)));
                        g.IfNotNull(field, () =>
                        {
                            var text = g.Keep(g.Get(typeof(TMPro.TMP_InputField), "text", field));
                            g.If(g.And(g.Not(g.Get(typeof(TMPro.TMP_InputField), "isFocused", field)),
                                       g.Not(g.Same(text, g.ObjVarOf(target, FieldVariable, typeof(string))))), () =>
                            {
                                g.SetObjVar(FieldVariable, text, target, typeof(string));
                                g.PageEvent(kind, index, g.EncodeArg(text));
                            });
                        });
                    });
                else if (unit != null)
                    g.On(g.Platform(unit, ("banterHeldEvents", g.KitRef(index))), held =>
                        g.PageEvent(kind, index, g.Select(g.EventOut(held, "Is Left", typeof(bool)), "left", "right", typeof(string))));
                else
                    throw new Exception($"the relay graph has no event kind '{kind}' (it relays: {string.Join(", ", RelayedKinds)})");
            }
            return g;
        }
    }
}
