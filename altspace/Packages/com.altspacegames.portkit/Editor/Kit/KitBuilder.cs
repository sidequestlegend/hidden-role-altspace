using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using Unity.VisualScripting;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace PortKit
{
    /// <summary>
    /// Base of a game's kit builder (generalised from FlightWorld's SnippetKits.cs). A kit is one prefab that needs
    /// nothing from the project it was built in: a snippet's script loads it from an asset bundle into anybody's world.
    ///
    /// A game derives from this, names its slug, and in Compose() puts the kit together on the stage: copies of
    /// upstream prefabs or scene objects, new objects, and what the script needs to know about them (the bindings).
    /// Build() then does the rest, the same way for every game:
    ///
    ///   1. references that pointed at an original point at its copy;
    ///   2. the settings of the upstream scripts (data-only stand-ins) are written into the bindings, then the
    ///      stand-ins, missing scripts and VRChat leftovers are stripped;
    ///   3. every object the script reaches (and each of its parents) gets a BS Object Id with an empty id, clickable
    ///      objects a collider on the UI layer, grabbable ones a collider, a body and BS Grababble on the Grabbable layer;
    ///   4. the relay graph is generated for the kit's refs and events and put on the root with its Refs list;
    ///   5. the kit is refused if anything in it still points outside it, is a project script, is a missing script,
    ///      is a BS Synced Object or BS Seat (the script adds those, after giving each instance its own network id),
    ///      or carries a fixed network id;
    ///   6. the prefab, bindings.json and bindings.lock.json are saved.
    /// </summary>
    public abstract class KitBuilder
    {
        /// <summary>The snippet's slug: lower-case letters, digits and hyphens. Also the prefab's and the bundles' name.</summary>
        public abstract string Slug { get; }
        public virtual string KitFolder => "Assets/Kit";
        public virtual string PrefabPath => $"{KitFolder}/{Slug}.prefab";
        public virtual string GraphPath => $"{KitFolder}/Graphs/{Slug}_relay.asset";
        /// <summary>Compiled into the script (README: ts/bindings.json).</summary>
        public virtual string BindingsPath => "ts/bindings.json";
        public virtual string LockPath => $"{KitFolder}/Editor/bindings.lock.json";
        /// <summary>The snippet's script as the TypeScript side builds it (npm run build); it goes into the artifact folder as pk-&lt;slug&gt;.js.</summary>
        public virtual string ScriptPath => $"Assets/WebRoot/pk-{Slug}.js";
        /// <summary>The licence notices that go into every bundle with the prefab (a text asset inside Assets), or null.</summary>
        public virtual string NoticesPath => File.Exists($"{KitFolder}/THIRD-PARTY-NOTICES.md") ? $"{KitFolder}/THIRD-PARTY-NOTICES.md" : null;
        /// <summary>
        /// Full licence texts packed into the bundles beside the notices (which only point to them): every .txt or .md file
        /// in {KitFolder}/Licenses/, and any file under {KitFolder} whose name holds LICENSE, LICENCE, OFL or COPYING. KitBundles
        /// adds TextMesh Pro's "LiberationSans - OFL.txt" by itself whenever the prefab uses that font (KitText.DefaultFont).
        /// </summary>
        public virtual IEnumerable<string> LicenseFiles
        {
            get
            {
                var found = new List<string>();
                if (!Directory.Exists(KitFolder)) return found;
                foreach (var file in Directory.GetFiles(KitFolder, "*", SearchOption.AllDirectories))
                {
                    string path = file.Replace('\\', '/');
                    if (path.EndsWith(".meta") || path.Contains("/Editor/")) continue;
                    string name = Path.GetFileName(path).ToUpperInvariant();
                    bool inFolder = path.StartsWith(KitFolder + "/Licenses/") && (name.EndsWith(".TXT") || name.EndsWith(".MD"));
                    bool named = (name.Contains("LICENSE") || name.Contains("LICENCE") || name.Contains("OFL") || name.Contains("COPYING")) && (name.EndsWith(".TXT") || name.EndsWith(".MD"));
                    if (inFolder || named) found.Add(path);
                }
                return found.OrderBy(p => p, StringComparer.Ordinal).ToList();
            }
        }
        /// <summary>Project folders whose scripts are upstream stand-ins: read for the bindings, then stripped.</summary>
        public virtual string[] StandInFolders => new[] { "Assets/Upstream/" };

        // ---- what the snippet's listing says (it goes into the artifact folder's manifest; the hub releases from there) ----
        /// <summary>The snippet's name as people see it.</summary>
        public virtual string Title => Slug;
        /// <summary>One line: the description attribute of the snippet's markup, shown in the Inspector of a world that adds it.</summary>
        public virtual string Summary => "";
        /// <summary>The listing's longer text (credits and licence of the upstream game belong here).</summary>
        public virtual string Description => Summary;
        /// <summary>single="true": only for a game that takes over a world.</summary>
        public virtual bool Single => false;
        /// <summary>The markup's position attribute: where the kit sits when somebody adds the snippet (a table-top game: on a table).</summary>
        public virtual string SnippetPosition => "0 0 0";
        /// <summary>The game's own settings, as attributes of the markup with their defaults (the snippet's Inspector shows them).</summary>
        public virtual IReadOnlyList<(string name, string value)> SnippetSettings => Array.Empty<(string, string)>();
        /// <summary>
        /// More gizmos for the snippet's markup, each one whole element (`&lt;bs-gizmo type="box" attribute="zone" size="4 0.2 4"/&gt;`),
        /// written after the position and box gizmos (a game's zones, a prize position: settings a host places by hand).
        /// </summary>
        public virtual IReadOnlyList<string> SnippetGizmos => Array.Empty<string>();
        /// <summary>The markup's box gizmo size ("x y z", metres). Null: as wide and deep as the kit's footprint either side of its position, 0.2 high.</summary>
        public virtual string GizmoSize => null;

        // ---- the kit's photo (PortKit/Kit/Take Photos) ----
        /// <summary>
        /// The part of the kit the photo shows and frames: a path under the kit root ("Table"). Null: the whole kit. The rest is
        /// hidden for the photo (a lounge 70 m below the table, objects kept for the page's sake).
        /// </summary>
        public virtual string PhotoRoot => null;
        /// <summary>The box the photo frames, in the kit's own axes. Null: the box around what PhotoRoot draws.</summary>
        public virtual Bounds? PhotoBounds => null;

        // ---- the kit's footprint (manifest.json, the markup's box gizmo, the hub's grid) ----
        /// <summary>
        /// The part of the kit the footprint measures: a path under the kit root ("Table"). Null: the whole kit. For a kit with
        /// parts far from where it is played (hidden-role's lounge 70 m below made its footprint 73.4 m tall).
        /// </summary>
        public virtual string FootprintRoot => null;
        /// <summary>The footprint itself, in the kit's own axes. Null: the box around what FootprintRoot draws.</summary>
        public virtual Bounds? FootprintBounds => null;

        /// <summary>Put the kit together under stage.Root and say what the script needs (stage.Object, Ref, Behaviour, Event, AddGraph).</summary>
        protected abstract void Compose(KitStage stage);

        /// <summary>
        /// Relay ops of this game's own, added to the README's table (keep the README's table current):
        /// ops.Add("lineWidth", () => ops.With(typeof(LineRenderer), line => ops.g.Set(typeof(LineRenderer), "widthMultiplier", line, ops.Number(0))));
        /// </summary>
        public virtual void RelayOps(RelayGraph.Ops ops) { }

        /// <summary>
        /// Runs after the bindings have read every stand-in's fields and before the stand-ins are stripped: the place to
        /// replace components the stand-ins pointed at, which the app cannot have (legacy UI Text to TextMeshPro, see
        /// KitText), since a field encoded as {"$comp": key} names the object, not the component.
        /// </summary>
        protected internal virtual void Finishing(KitStage stage) { }

        /// <summary>Builds the prefab and its bindings. Throws with the reason if the kit is refused; `report` gets the details either way.</summary>
        public void Build(StringBuilder report)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(Slug, "^[a-z0-9-]+$")) throw new Exception($"slug '{Slug}' must be lower-case letters, digits and hyphens");
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                var root = new GameObject(Slug);
                SceneManager.MoveGameObjectToScene(root, scene);
                var stage = new KitStage(this, root, scene, new BindingsLock(LockPath), report);
                Compose(stage);
                stage.Finish();
                Directory.CreateDirectory(Path.GetDirectoryName(PrefabPath));
                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath, out bool saved);
                if (!saved) throw new Exception("the prefab was not saved");
                stage.Bindings.Save(BindingsPath);
                stage.Lock.Save();
                AssetDatabase.SaveAssets();
                report.AppendLine($"ok {Slug}: {root.GetComponentsInChildren<Transform>(true).Length} objects, {stage.Bindings.Objects.Count} bound " +
                                  $"({stage.Bindings.Objects.Count(o => o.Value.Sync != "none")} synced, {stage.Bindings.Objects.Count(o => o.Value.Grab)} grabbable, " +
                                  $"{stage.Bindings.Objects.Count(o => o.Value.Click)} clickable), {stage.Bindings.Refs.Count} refs, {stage.Bindings.Behaviours.Count} behaviours, " +
                                  $"{stage.Bindings.Events.Count} events; bindings {stage.Bindings.Hash()} -> {BindingsPath}");
            }
            finally
            {
                EditorSceneManager.ClosePreviewScene(scene);
            }
        }

        // ------------------------------------------------------------------ every builder of the project

        /// <summary>One instance of every kit builder class in the project (any non-abstract KitBuilder with a parameterless constructor).</summary>
        public static List<KitBuilder> All() =>
            TypeCache.GetTypesDerivedFrom<KitBuilder>()
                .Where(t => !t.IsAbstract && t.GetConstructor(Type.EmptyTypes) != null)
                .Select(t => (KitBuilder)Activator.CreateInstance(t))
                .OrderBy(b => b.Slug, StringComparer.Ordinal).ToList();

        /// <summary>The builders named in Library/PortKit/kit_only.txt (slugs separated by commas, spaces or lines), or all of them.</summary>
        public static List<KitBuilder> Chosen()
        {
            const string onlyPath = PortKitRemote.Dir + "/kit_only.txt";
            string only = File.Exists(onlyPath) ? File.ReadAllText(onlyPath).Trim() : "";
            var all = All();
            if (only.Length == 0) return all;
            var names = only.Split(new[] { ',', ' ', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            return all.Where(b => names.Contains(b.Slug)).ToList();
        }

        const string LogPath = "Logs/portkit_kits.txt";

        [MenuItem("PortKit/Kit/Build Prefabs")]
        public static void BuildPrefabs()
        {
            var report = new StringBuilder();
            int failed = 0;
            var builders = Chosen();
            if (builders.Count == 0) report.AppendLine("no kit builder in this project (a class derived from PortKit.KitBuilder)");
            foreach (var builder in builders)
            {
                try { builder.Build(report); }
                catch (Exception e)
                {
                    failed++;
                    report.AppendLine($"FAILED {builder.Slug}: {e.Message}");
                    Debug.LogException(e);
                }
            }
            AssetDatabase.Refresh();
            report.AppendLine(failed == 0 && builders.Count > 0 ? "DONE" : "FAILED");
            Directory.CreateDirectory("Logs");
            File.WriteAllText(LogPath, report.ToString());
        }
    }

    /// <summary>The kit under construction, in a preview scene of its own.</summary>
    public sealed class KitStage
    {
        public readonly GameObject Root;
        public readonly Scene Scene;
        public readonly Bindings Bindings = new Bindings();
        public readonly BindingsLock Lock;
        public readonly StringBuilder Report;
        /// <summary>Original object or component -> its copy in the kit.</summary>
        public readonly Dictionary<UnityEngine.Object, UnityEngine.Object> Map = new Dictionary<UnityEngine.Object, UnityEngine.Object>();

        readonly KitBuilder builder;
        readonly Dictionary<GameObject, string> keys = new Dictionary<GameObject, string>();
        readonly Dictionary<GameObject, string> wantedKeys = new Dictionary<GameObject, string>();
        readonly Dictionary<GameObject, Bindings.ObjectEntry> entries = new Dictionary<GameObject, Bindings.ObjectEntry>();
        readonly List<GameObject> refs = new List<GameObject>();
        readonly List<(MonoBehaviour standIn, string type, JObject extra)> behaviours = new List<(MonoBehaviour, string, JObject)>();
        readonly Dictionary<MonoBehaviour, string> behaviourIds = new Dictionary<MonoBehaviour, string>();
        readonly List<(GameObject go, string type, JObject fields, string id)> plainBehaviours = new List<(GameObject, string, JObject, string)>();
        /// <summary>Ids the builder asked for, by plain behaviour index (Behaviour(go, type, fields, id: ...)).</summary>
        readonly Dictionary<int, string> wantedIds = new Dictionary<int, string>();
        /// <summary>Behaviours (stand-ins, plain tokens) marked per-player (README bindings "perPlayer").</summary>
        readonly HashSet<object> perPlayer = new HashSet<object>();
        readonly List<(string name, object behaviour, string method)> graphEvents = new List<(string, object, string)>();
        readonly List<(GameObject go, string kind, object behaviour, string method)> events = new List<(GameObject, string, object, string)>();

        internal KitStage(KitBuilder builder, GameObject root, Scene scene, BindingsLock bindingsLock, StringBuilder report)
        {
            this.builder = builder;
            Root = root;
            Scene = scene;
            Lock = bindingsLock;
            Report = report;
            Bindings.Slug = builder.Slug;
        }

        static Type T(string name) => GraphTypes.Find(name);

        // ------------------------------------------------------------------ putting objects on the stage

        /// <summary>
        /// A copy of a prefab asset or scene object under the kit's root (or `parent`), unpacked: the kit keeps no link
        /// to the original. Map learns original -> copy for every object and component of it.
        /// </summary>
        public GameObject Copy(GameObject original, Transform parent = null, string name = null)
        {
            if (original == null) throw new ArgumentNullException(nameof(original));
            var copy = UnityEngine.Object.Instantiate(original);
            copy.name = name ?? original.name;
            SceneManager.MoveGameObjectToScene(copy, Scene);
            copy.transform.SetParent(parent != null ? parent : Root.transform, false);
            var from = original.GetComponentsInChildren<Transform>(true);
            var to = copy.GetComponentsInChildren<Transform>(true);
            if (from.Length != to.Length) throw new Exception($"copy of {original.name} has {to.Length} objects, the original {from.Length}");
            for (int i = 0; i < from.Length; i++)
            {
                Map[from[i].gameObject] = to[i].gameObject;
                var a = from[i].GetComponents<Component>();
                var b = to[i].GetComponents<Component>();
                if (a.Length != b.Length) throw new Exception($"copy of {from[i].name} has {b.Length} components, the original {a.Length}");
                for (int c = 0; c < a.Length; c++)
                    if (a[c] != null && b[c] != null) Map[a[c]] = b[c];
            }
            return copy;
        }

        public GameObject Create(string name, Transform parent = null)
        {
            var go = new GameObject(name);
            SceneManager.MoveGameObjectToScene(go, Scene);
            go.transform.SetParent(parent != null ? parent : Root.transform, false);
            return go;
        }

        public GameObject Primitive(PrimitiveType type, string name, Transform parent = null)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            SceneManager.MoveGameObjectToScene(go, Scene);
            go.transform.SetParent(parent != null ? parent : Root.transform, false);
            return go;
        }

        /// <summary>The copy of an original (object or component), or the thing itself when it is already the kit's.</summary>
        public TObject Mine<TObject>(TObject original) where TObject : UnityEngine.Object =>
            original != null && Map.TryGetValue(original, out var mine) ? (TObject)mine : original;

        // ------------------------------------------------------------------ what the script needs to know

        /// <summary>
        /// The script reaches this object: it gets a key, a BS Object Id and an entry in bindings.objects. `sync`
        /// "transform": the script gives it a network id and a BS Synced Object. `grab`: collider, body and BS Grababble
        /// on the Grabbable layer. `click`: a collider on the UI layer. `seat`: the script adds a BS Seat (clickable too).
        /// `key` null: the key it had last time, or a new one made from its name.
        /// </summary>
        public GameObject Object(GameObject go, string key = null, string sync = null, bool? grab = null, bool? click = null, bool? seat = null)
        {
            if (go == null) throw new ArgumentNullException(nameof(go));
            go = Mine(go);
            if (!go.transform.IsChildOf(Root.transform)) throw new Exception($"'{go.name}' is not in the kit");
            if (!entries.TryGetValue(go, out var entry)) entries[go] = entry = new Bindings.ObjectEntry();
            if (key != null) wantedKeys[go] = key;
            if (sync != null) entry.Sync = sync;
            if (grab != null) entry.Grab = grab.Value;
            if (click != null) entry.Click = click.Value;
            if (seat != null) entry.Seat = seat.Value;
            return go;
        }

        /// <summary>
        /// The object starts switched off in every copy of the kit, as if the upstream prefab had it off: it is bound, saved on
        /// (so that the page can find it) and written "active": false, so the runtime switches it off as soon as it has found
        /// it, and the photo and the footprint leave it out. For what a game hides as it starts (blackjack's dealer card
        /// canvas, an empty dark-green panel in the photo until the game hides it).
        /// </summary>
        public GameObject StartOff(GameObject go)
        {
            go = Object(go);
            go.SetActive(false);
            return go;
        }

        /// <summary>
        /// The object is attached to players with autoSync (GameObject.AttachToHead(..., true): a label over each avatar): it
        /// is bound and written "attach": true, so every client gives it the same attachment id as the kit loads and the
        /// others re-parent their own copy when somebody attaches it (without it only the attaching page had the id, and the
        /// other players saw the label stay at the kit; found by rp-toolkit). Not for a synced object (the app says an
        /// attached object should not also sync its transform): each player attaches an object of their own.
        /// </summary>
        public GameObject Attachable(GameObject go)
        {
            go = Object(go);
            entries[go].Attach = true;
            return go;
        }

        /// <summary>The relay graph can act on this object (text, animator, particles, colour, active) and relay its events; returns its target index.</summary>
        public int Ref(GameObject go)
        {
            go = Object(go);
            int index = refs.IndexOf(go);
            if (index < 0) { refs.Add(go); index = refs.Count - 1; }
            return index;
        }

        /// <summary>
        /// An upstream script on a kit object, as the script will see it: its type name and every serialized field of the
        /// stand-in (README field values). `extra` adds or replaces fields. The stand-in itself is stripped when the kit is finished.
        /// </summary>
        public void Behaviour(MonoBehaviour standIn, string type = null, JObject extra = null)
        {
            standIn = Mine(standIn);
            if (standIn == null) throw new ArgumentNullException(nameof(standIn));
            int known = behaviours.FindIndex(b => b.standIn == standIn);
            if (known >= 0)
            {
                // named again (after BehavioursFromStandIns, say): its extra fields are added, a type given now wins
                var (s, t, e) = behaviours[known];
                if (extra != null)
                {
                    e = e ?? new JObject();
                    foreach (var p in extra.Properties()) e[p.Name] = p.Value;
                }
                behaviours[known] = (s, type ?? t, e);
                return;
            }
            Object(standIn.gameObject);
            behaviours.Add((standIn, type ?? standIn.GetType().Name, extra));
        }

        /// <summary>Every stand-in under `under` (default: the whole kit) becomes a behaviour.</summary>
        public void BehavioursFromStandIns(GameObject under = null)
        {
            foreach (var mb in (under != null ? Mine(under) : Root).GetComponentsInChildren<MonoBehaviour>(true))
                if (mb != null && IsStandIn(mb)) Behaviour(mb);
        }

        /// <summary>
        /// A behaviour with no stand-in behind it: the builder states its type and fields. Returns a token to name it in Event().
        /// `perPlayer`: one copy per player, owned by that player (README bindings "perPlayer"; the class can also say so with
        /// `static perPlayer = true`). `id`: the behaviour id to use instead of an automatic one (letters, digits, '_', '-';
        /// kept in the lock), for a behaviour that other code or saved data names.
        /// </summary>
        public object Behaviour(GameObject go, string type, JObject fields = null, bool perPlayer = false, string id = null)
        {
            go = Object(go);
            if (id != null && !System.Text.RegularExpressions.Regex.IsMatch(id, "^[A-Za-z0-9_-]+$"))
                throw new Exception($"behaviour id '{id}' must be letters, digits, underscore or hyphen");
            if (id != null && wantedIds.ContainsValue(id)) throw new Exception($"behaviour id '{id}' is asked for twice");
            var token = new object();
            plainBehaviours.Add((go, type, fields ?? new JObject(), null));
            plainTokens[token] = plainBehaviours.Count - 1;
            if (id != null) wantedIds[plainBehaviours.Count - 1] = id;
            if (perPlayer) this.perPlayer.Add(token);
            return token;
        }

        /// <summary>Marks a behaviour (a stand-in, or a Behaviour() token) per-player, or not (README bindings "perPlayer").</summary>
        public void PerPlayer(object behaviour, bool on = true)
        {
            if (behaviour is MonoBehaviour standIn) { Behaviour(standIn); behaviour = Mine(standIn); }
            else if (behaviour == null || !plainTokens.ContainsKey(behaviour)) throw new Exception("PerPlayer: not a behaviour of this kit");
            if (on) perPlayer.Add(behaviour); else perPlayer.Remove(behaviour);
        }

        /// <summary>
        /// A graph-to-page event (README "Graph to page") bound to a method: {"kind":"graph","name":...} in bindings. The
        /// game's own graph reports it with g.PageEvent(name, ...); the method gets the arguments as strings.
        /// </summary>
        public void GraphEvent(string name, object behaviour, string method)
        {
            if (behaviour is MonoBehaviour standIn) { Behaviour(standIn); behaviour = Mine(standIn); }
            graphEvents.Add((name, behaviour, method));
        }

        /// <summary>
        /// Gives `holder` (a kit object) a clip list the relay's audio op can play: an AudioSource and a BS Audio Source with
        /// these clips, mirrored into its "PkClips" variable, and the holder joins refs. Clips already on the list keep their
        /// index. Returns each clip's index. For a plain behaviour's audio, which no stand-in field brings in.
        /// </summary>
        public int[] Clips(GameObject holder, params AudioClip[] clips)
        {
            holder = Object(holder);
            return clips.Select(clip => ClipIndex(holder, clip)).ToArray();
        }

        /// <summary>{"$clip": n, "on": key} for one clip on `holder`'s list (added if it is not there), for a plain behaviour's field.</summary>
        public JObject ClipValue(GameObject holder, AudioClip clip)
        {
            holder = Object(holder);
            int index = ClipIndex(holder, clip);
            return new JObject { ["$clip"] = index, ["on"] = Pending(() => KeyOf(holder)) };
        }

        /// <summary>The clip's index in the holder's BS Audio Source list and PkClips mirror, adding it (and them) if needed.</summary>
        int ClipIndex(GameObject holder, AudioClip clip)
        {
            if (clip == null) throw new ArgumentNullException(nameof(clip));
            clip = Mine(clip);
            if (holder.GetComponent<AudioSource>() == null) holder.AddComponent<AudioSource>().playOnAwake = false;
            var audio = holder.GetComponent(T("BS.BSAudioSource")) ?? holder.AddComponent(T("BS.BSAudioSource"));
            var so = new SerializedObject(audio);
            var list = so.FindProperty("clips");
            // the relay's audio op finds the clip by the holder's refs index in the holder's "PkClips" list (the graph cannot read BS Audio Source)
            Ref(holder);
            for (int i = 0; i < list.arraySize; i++)
                if (list.GetArrayElementAtIndex(i).objectReferenceValue == clip) return i;
            list.arraySize++;
            list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = clip;
            var playOnAwake = so.FindProperty("playOnAwake");
            if (playOnAwake != null) playOnAwake.boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
            var variables = holder.GetComponent<Variables>() ?? holder.AddComponent<Variables>();
            var mirror = variables.declarations.IsDefined(RelayGraph.ClipsVariable) ? variables.declarations.Get(RelayGraph.ClipsVariable) as AotList : null;
            if (mirror == null) { mirror = new AotList(); variables.declarations.Set(RelayGraph.ClipsVariable, mirror); }
            mirror.Add(clip);
            return list.arraySize - 1;
        }
        readonly Dictionary<object, int> plainTokens = new Dictionary<object, int>();
        readonly Dictionary<object, string> groupOf = new Dictionary<object, string>();
        readonly Dictionary<string, string> groupOfType = new Dictionary<string, string>(StringComparer.Ordinal);

        /// <summary>
        /// Puts a behaviour (a stand-in, or a Behaviour() token) in a sync group (README, bindings "group"): every behaviour
        /// of one group shares one state leaf and one owner, and the runtime applies a whole group's change before it
        /// calls any member's OnDeserialization. For dozens of small behaviours (pieces), or several that must change together.
        /// </summary>
        public void Group(object behaviour, string group)
        {
            if (behaviour is MonoBehaviour standIn) { Behaviour(standIn); behaviour = Mine(standIn); }
            groupOf[behaviour] = group;
        }

        /// <summary>Every behaviour of `type` (stand-ins and Behaviour() alike) joins `group`, unless Group() named another for it.</summary>
        public void GroupType(string type, string group) => groupOfType[type] = group;

        string GroupFor(object behaviour, string type) =>
            groupOf.TryGetValue(behaviour, out var g) ? g : groupOfType.TryGetValue(type, out var t) ? t : null;

        // ---- field values whose key or id is only known when the kit is finished ----
        readonly List<Func<string>> pendingValues = new List<Func<string>>();
        const char PendingMark = '\u0001';

        string Pending(Func<string> resolve)
        {
            pendingValues.Add(resolve);
            return PendingMark + (pendingValues.Count - 1).ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// {"$beh": id} for a stand-in or a Behaviour() token, for the fields of a plain behaviour or an `extra`: ids are
        /// handed out when the kit is finished, so the value is filled in then.
        /// </summary>
        public JObject BehaviourValue(object behaviour)
        {
            if (behaviour is MonoBehaviour standIn) { Behaviour(standIn); behaviour = Mine(standIn); }
            var target = behaviour;
            return new JObject
            {
                ["$beh"] = Pending(() => target is MonoBehaviour s ? IdOf(s)
                    : plainTokens.TryGetValue(target, out int i) ? plainBehaviours[i].id : throw new Exception("BehaviourValue: not a behaviour of this kit")),
            };
        }

        /// <summary>{"$obj": key} for a kit object (it becomes a bound object), filled in when the kit is finished.</summary>
        public JObject ObjectValue(GameObject go)
        {
            go = Object(go);
            return new JObject { ["$obj"] = Pending(() => KeyOf(go)) };
        }

        /// <summary>{"$comp": key, "kind": kind} for a component of a kit object (README field values), filled in when the kit is finished.</summary>
        public JObject ComponentValue(GameObject go, string kind)
        {
            go = Object(go);
            return new JObject { ["$comp"] = Pending(() => KeyOf(go)), ["kind"] = kind };
        }

        void ResolvePending(JToken token)
        {
            if (token is JValue v && v.Type == JTokenType.String && ((string)v).Length > 1 && ((string)v)[0] == PendingMark)
                v.Value = pendingValues[int.Parse(((string)v).Substring(1), CultureInfo.InvariantCulture)]();
            else if (token is JContainer container)
                foreach (var child in container.Children().ToList()) ResolvePending(child is JProperty p ? p.Value : child);
        }

        /// <summary>
        /// An event of a kit object the script should hear: click, grab, drop, triggerEnter, triggerExit, collisionEnter
        /// (the page's own events) or uiButton, uiSlider, heldTrigger, heldPrimary, heldSecondary (relayed by the graph, so the
        /// object joins refs). `behaviour`: the stand-in or Behaviour() token it is for, or null; `method`: what to call.
        /// </summary>
        public void Event(GameObject go, string kind, object behaviour = null, string method = null)
        {
            if (!Bindings.EventKinds.Contains(kind)) throw new Exception($"event kind '{kind}' is not one of {string.Join(", ", Bindings.EventKinds)}");
            if (kind == "graph") throw new Exception("a graph event has a name and no object: use GraphEvent(name, behaviour, method)");
            go = Object(go);
            if (kind == "click") Object(go, click: true);
            if (kind == "grab" || kind == "drop" || kind.StartsWith("held")) Object(go, grab: true);
            if (RelayGraph.RelayedKinds.Contains(kind)) Ref(go);
            if (behaviour is MonoBehaviour standIn) { Behaviour(standIn); behaviour = Mine(standIn); }
            events.Add((go, kind, behaviour, method));
        }

        /// <summary>
        /// One of the game's own generated graphs, on a kit object: saved as Assets/Kit/Graphs/&lt;slug&gt;_&lt;name&gt;.asset (members
        /// checked against the allow list) and run by a Script Machine of its own, next to any other on that object. The
        /// object gets the "PkRoot" variable, so the graph can use GraphWriter's KitRoot, KitRef, Instance and PageEvent.
        /// </summary>
        public ScriptMachine AddGraph(GameObject go, string name, GraphWriter graph)
        {
            go = Mine(go);
            if (!go.transform.IsChildOf(Root.transform)) throw new Exception($"'{go.name}' is not in the kit");
            if (!System.Text.RegularExpressions.Regex.IsMatch(name ?? "", "^[A-Za-z0-9_-]+$") || name == "relay")
                throw new Exception($"graph name '{name}' must be letters, digits, underscore or hyphen, and not 'relay'");
            string path = $"{Path.GetDirectoryName(builder.GraphPath).Replace('\\', '/')}/{builder.Slug}_{name}.asset";
            var asset = graph.Save(path, Report);
            var variables = go.GetComponent<Variables>() ?? go.AddComponent<Variables>();
            variables.declarations.Set(GraphWriter.KitRootVariable, Root);
            var machine = go.AddComponent<ScriptMachine>();
            machine.nest.SwitchToMacro(asset);
            return machine;
        }

        public bool IsStandIn(MonoBehaviour behaviour)
        {
            if (behaviour == null) return false;
            var script = MonoScript.FromMonoBehaviour(behaviour);
            string path = script != null ? AssetDatabase.GetAssetPath(script).Replace('\\', '/') : "";
            return builder.StandInFolders.Any(folder => path.StartsWith(folder, StringComparison.OrdinalIgnoreCase));
        }

        // ------------------------------------------------------------------ finishing

        public static string KitPath(Transform t, Transform root)
        {
            var names = new List<string>();
            for (; t != null && t != root; t = t.parent) names.Add(t.name);
            names.Reverse();
            return string.Join("/", names);
        }

        /// <summary>
        /// SDK 4.0.29: BS Grababble adds BS Held Events, which adds a BSPlayerEvents at run time whose UnityEvents are all null
        /// (AddComponent does not make them), and BSScene.Click calls `onClick.Invoke` on it without a null check: every click
        /// on a grabbable throws a NullReferenceException before the page hears it (found by chess). BS Held Events takes a
        /// BSPlayerEvents that is already on the object, so the kit carries one with every UnityEvent made: saved in the
        /// prefab, they come back from the bundle as empty events, and the click goes on to the page. Remove once the SDK
        /// null-checks (or makes the events itself).
        /// </summary>
        public static Component ClickableGrab(GameObject go)
        {
            var type = GraphTypes.TryFind("BSPlayerEvents");
            if (type == null) return null;
            var events = go.GetComponent(type) ?? go.AddComponent(type);
            foreach (var field in type.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
            {
                if (!typeof(UnityEngine.Events.UnityEventBase).IsAssignableFrom(field.FieldType) || field.GetValue(events) != null) continue;
                field.SetValue(events, Activator.CreateInstance(field.FieldType));
            }
            EditorUtility.SetDirty(events);
            return events;
        }

        /// <summary>A path must lead to one object only: other objects of the same name under the same parent, anywhere up the chain, are renamed.</summary>
        void Untwin(GameObject go)
        {
            for (var t = go.transform; t != null && t != Root.transform; t = t.parent)
            {
                if (t.name.Contains("/")) { Report.AppendLine($"   renamed '{t.name}': a name with a slash cannot be in a path"); t.name = t.name.Replace('/', '-'); }
                var twins = t.parent.Cast<Transform>().Where(s => s != t && s.name == t.name).ToList();
                for (int n = 0; n < twins.Count; n++)
                {
                    string renamed = $"{t.name}~{n + 2}";
                    Report.AppendLine($"   renamed a second '{KitPath(twins[n], Root.transform)}' to '{renamed}': two objects of one name under one parent share a path");
                    twins[n].name = renamed;
                }
            }
        }

        string KeyOf(GameObject go)
        {
            if (keys.TryGetValue(go, out var key)) return key;
            if (!entries.ContainsKey(go)) Object(go);
            Untwin(go);
            wantedKeys.TryGetValue(go, out var wanted);
            key = Lock.ObjectKey(KitPath(go.transform, Root.transform), wanted, go.name);
            if (keys.Values.Contains(key)) throw new Exception($"object key '{key}' is given to two objects ('{go.name}' is the second)");
            return keys[go] = key;
        }

        readonly Dictionary<string, int> ordinals = new Dictionary<string, int>();

        /// <summary>The id of the next behaviour of `type` on `go`: the same one it had in the last export.</summary>
        string NextId(GameObject go, string type, string wanted = null)
        {
            string slot = KeyOf(go) + "#" + type;
            ordinals.TryGetValue(slot, out int n);
            ordinals[slot] = n + 1;
            return Lock.BehaviourId(KeyOf(go), type, n, wanted);
        }

        string IdOf(MonoBehaviour standIn)
        {
            if (behaviourIds.TryGetValue(standIn, out var id)) return id;
            Behaviour(standIn);                                              // (a stand-in the builder did not list, pointed at by one it did)
            string type = behaviours.First(b => b.standIn == standIn).type;
            return behaviourIds[standIn] = NextId(standIn.gameObject, type);
        }

        internal void Finish()
        {
            Repoint();
            foreach (var t in Root.GetComponentsInChildren<Transform>(true))        // in the order of the hierarchy, so the result never depends on the builder's order
                if (entries.ContainsKey(t.gameObject)) Untwin(t.gameObject);

            // ---- behaviours: ids first (they refer to each other), then their fields ----
            // ids the builder asked for first, so that no automatic id takes one of them
            foreach (var pair in wantedIds.OrderBy(w => w.Key))
            {
                var p = plainBehaviours[pair.Key];
                plainBehaviours[pair.Key] = (p.go, p.type, p.fields, NextId(p.go, p.type, pair.Value));
            }
            for (int i = 0; i < behaviours.Count; i++) IdOf(behaviours[i].standIn);
            for (int i = 0; i < plainBehaviours.Count; i++)
            {
                var p = plainBehaviours[i];
                if (p.id == null) plainBehaviours[i] = (p.go, p.type, p.fields, NextId(p.go, p.type));
            }
            for (int i = 0; i < behaviours.Count; i++)                      // (EncodeFields may append more: see IdOf)
            {
                var (standIn, type, extra) = behaviours[i];
                var fields = EncodeFields(standIn);
                if (extra != null) foreach (var p in extra.Properties()) fields[p.Name] = p.Value;
                Bindings.Behaviours.Add(new Bindings.BehaviourEntry { Id = behaviourIds[standIn], Type = type, Object = KeyOf(standIn.gameObject), Fields = fields, Group = GroupFor(standIn, type), PerPlayer = perPlayer.Contains(standIn) });
            }
            var tokenAt = plainTokens.ToDictionary(pair => pair.Value, pair => pair.Key);
            for (int i = 0; i < plainBehaviours.Count; i++)
            {
                var p = plainBehaviours[i];
                Bindings.Behaviours.Add(new Bindings.BehaviourEntry { Id = p.id, Type = p.type, Object = KeyOf(p.go), Fields = p.fields, Group = GroupFor(tokenAt[i], p.type), PerPlayer = perPlayer.Contains(tokenAt[i]) });
            }

            foreach (var b in Bindings.Behaviours) ResolvePending(b.Fields);

            // ---- the stand-ins have said what they know: the builder may now replace what they pointed at; then out they go,
            //      with whatever else the app does not have ----
            builder.Finishing(this);
            int stripped = Strip();

            // ---- text fields: every TMP_InputField reports its edits to the page (graph event "field", README); the relay
            //      graph compares its text with the PkField variable, which starts as the field's own text ----
            foreach (var field in Root.GetComponentsInChildren<TMPro.TMP_InputField>(true))
            {
                var go = field.gameObject;
                if (!events.Any(e => e.go == go && e.kind == "field")) Event(go, "field");
                var fieldVariables = go.GetComponent<Variables>() ?? go.AddComponent<Variables>();
                fieldVariables.declarations.Set(RelayGraph.FieldVariable, field.text ?? "");
            }

            // ---- objects switched off: a BS Object Id wakes (and the page learns of its object) only on an object that is on,
            //      so every bound object and each of its parents is saved on; the bound ones that were off are written
            //      "active": false, and the runtime switches them off as soon as it has found them ----
            for (bool more = true; more;)
            {
                more = false;
                foreach (var go in entries.Keys.ToList())
                    for (var t = go.transform; t != null && t != Root.transform; t = t.parent)
                    {
                        if (t.gameObject.activeSelf) continue;
                        if (!entries.ContainsKey(t.gameObject)) { Object(t.gameObject); more = true; }
                        entries[t.gameObject].Active = false;
                        t.gameObject.SetActive(true);
                    }
            }
            int off = entries.Count(e => !e.Value.Active);
            if (off > 0) Report.AppendLine($"   {off} bound objects were off in the prefab: saved on, written \"active\": false");

            // ---- objects: ids, layers, colliders ----
            Type idType = T("BS.BSObjectId");
            foreach (var pair in entries.ToList())
            {
                var go = pair.Key;
                var entry = pair.Value;
                if (entry.Grab && (entry.Click || entry.Seat)) throw new Exception($"'{go.name}' cannot be grabbable and clickable at once: an object is on one layer (give the click to a child)");
                if (entry.Seat) entry.Click = true;
                if (entry.Click)
                {
                    EnsureCollider(go);
                    go.layer = 5;                                                   // UI: the only layers that are clicked are 5 and 22
                }
                if (entry.Grab)
                {
                    EnsureCollider(go);
                    if (go.GetComponent<Rigidbody>() == null) go.AddComponent<Rigidbody>();
                    foreach (var mesh in go.GetComponents<MeshCollider>()) mesh.convex = true;      // a mesh collider on a moving body has to be convex
                    if (go.GetComponent(T("BS.BSGrababble")) == null) go.AddComponent(T("BS.BSGrababble"));
                    ClickableGrab(go);
                    go.layer = 20;                                                  // Grabbable
                }
                for (var t = go.transform; t != null; t = t.parent)                // the page builds a path from objects it knows: each has an id
                {
                    if (t.GetComponent(idType) == null) t.gameObject.AddComponent(idType);
                    if (t == Root.transform) break;
                }
            }
            foreach (var id in Root.GetComponentsInChildren(idType, true))         // no fixed ids: each instance gets its own when it wakes
            {
                var so = new SerializedObject(id);
                so.FindProperty("Id").stringValue = "";
                so.FindProperty("jsId").stringValue = "";
                so.ApplyModifiedPropertiesWithoutUndo();
            }

            // ---- the bindings ----
            foreach (var pair in entries)
            {
                string key = KeyOf(pair.Key);
                pair.Value.Path = KitPath(pair.Key.transform, Root.transform);
                Bindings.Objects[key] = pair.Value;
            }
            foreach (var go in refs) Bindings.Refs.Add(KeyOf(go));
            foreach (var (go, kind, behaviour, method) in events)
            {
                string id = behaviour is MonoBehaviour mb ? behaviourIds[mb]
                    : behaviour != null && plainTokens.TryGetValue(behaviour, out int index) ? plainBehaviours[index].id
                    : behaviour as string ?? "";
                Bindings.Events.Add(new Bindings.EventEntry { Object = KeyOf(go), Kind = kind, Behaviour = id, Method = method ?? "" });
            }
            foreach (var (name, behaviour, method) in graphEvents)
            {
                string id = behaviour is MonoBehaviour mb ? behaviourIds[mb]
                    : behaviour != null && plainTokens.TryGetValue(behaviour, out int index) ? plainBehaviours[index].id
                    : behaviour as string ?? "";
                Bindings.Events.Add(new Bindings.EventEntry { Kind = "graph", Name = name, Behaviour = id, Method = method ?? "" });
            }

            // ---- the relay graph, on the root, with the objects it acts on ----
            var relayed = events.Where(e => RelayGraph.RelayedKinds.Contains(e.kind))
                .Select(e => new RelayGraph.Event(refs.IndexOf(e.go), e.kind)).Distinct().ToList();
            var graph = RelayGraph.Build(relayed, builder.RelayOps).Save(builder.GraphPath, Report);
            Report.AppendLine($"   relay ops: {string.Join(", ", RelayGraph.OpNames(builder.RelayOps))}; relayed events: {relayed.Count}");
            var variables = Root.GetComponent<Variables>() ?? Root.AddComponent<Variables>();
            var list = new AotList();
            foreach (var go in refs) list.Add(go);
            variables.declarations.Set(GraphWriter.RefsVariable, list);
            variables.declarations.Set(GraphWriter.KitRootVariable, Root);
            Root.AddComponent<ScriptMachine>().nest.SwitchToMacro(graph);
            // every body the relay's rbLaunch may launch holds its own pending launch (RelayGraph.Launches)
            foreach (var body in Root.GetComponentsInChildren<Rigidbody>(true))
            {
                var own = body.GetComponent<Variables>() ?? body.gameObject.AddComponent<Variables>();
                if (!own.declarations.IsDefined(RelayGraph.LaunchSteps)) own.declarations.Set(RelayGraph.LaunchSteps, 0f);
                if (!own.declarations.IsDefined(RelayGraph.LaunchVelocity)) own.declarations.Set(RelayGraph.LaunchVelocity, Vector3.zero);
            }
            AssetDatabase.SaveAssets();

            var problems = Bindings.Problems();
            if (problems.Count > 0) throw new Exception("bindings: " + string.Join("; ", problems));
            Validate(stripped);
        }

        void EnsureCollider(GameObject go)
        {
            if (go.GetComponent<Collider>() != null) return;
            var box = go.AddComponent<BoxCollider>();
            var renderers = go.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return;
            // the box around what is drawn, in the object's own axes
            var toLocal = go.transform.worldToLocalMatrix;
            var bounds = new Bounds();
            bool any = false;
            foreach (var r in renderers)
                for (int i = 0; i < 8; i++)
                {
                    var corner = r.bounds.center + Vector3.Scale(r.bounds.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                    var p = toLocal.MultiplyPoint3x4(corner);
                    if (!any) { bounds = new Bounds(p, Vector3.zero); any = true; }
                    else bounds.Encapsulate(p);
                }
            box.center = bounds.center;
            box.size = bounds.size;
            Report.AppendLine($"   '{go.name}' had no collider: a box of {bounds.size:F3} added");
        }

        /// <summary>Every reference to an original, in any component or Variables list of the kit, is pointed at the original's copy.</summary>
        public void Repoint()
        {
            foreach (var t in Root.GetComponentsInChildren<Transform>(true))
                foreach (var c in t.GetComponents<Component>())
                {
                    if (c == null) continue;
                    var so = new SerializedObject(c);
                    var p = so.GetIterator();
                    bool changed = false;
                    while (p.Next(true))
                    {
                        if (p.propertyType != SerializedPropertyType.ObjectReference || p.objectReferenceValue == null) continue;
                        if (Map.TryGetValue(p.objectReferenceValue, out var mine) && mine != p.objectReferenceValue)
                        {
                            p.objectReferenceValue = mine;
                            changed = true;
                        }
                    }
                    if (changed) so.ApplyModifiedPropertiesWithoutUndo();
                }
            foreach (var holder in Root.GetComponentsInChildren<Variables>(true))
                foreach (var d in holder.declarations.ToList())
                {
                    if (d.value is UnityEngine.Object o && !ReferenceEquals(o, null) && Map.TryGetValue(o, out var mine)) holder.declarations.Set(d.name, mine);
                    else if (d.value is IList list && !(d.value is Array))
                        for (int i = 0; i < list.Count; i++)
                            if (list[i] is UnityEngine.Object item && !ReferenceEquals(item, null) && Map.TryGetValue(item, out var mineItem)) list[i] = mineItem;
                }
        }

        /// <summary>
        /// Removes what the app does not have: missing scripts (VRChat's and other packages' components arrive as these),
        /// the upstream stand-ins, and any other script compiled from this project. Returns how many went.
        /// </summary>
        public int Strip()
        {
            int removed = 0;
            foreach (var t in Root.GetComponentsInChildren<Transform>(true))
                removed += GameObjectUtility.RemoveMonoBehavioursWithMissingScript(t.gameObject);
            // a component another one requires cannot go first: keep passing until nothing more goes
            for (int pass = 0; pass < 8; pass++)
            {
                int before = removed;
                foreach (var mb in Root.GetComponentsInChildren<MonoBehaviour>(true))
                {
                    if (mb == null || !(IsStandIn(mb) || IsProjectScript(mb))) continue;
                    var go = mb.gameObject;
                    int count = go.GetComponents<Component>().Length;
                    UnityEngine.Object.DestroyImmediate(mb);
                    if (go.GetComponents<Component>().Length < count) removed++;
                }
                if (removed == before) break;
            }
            if (removed > 0) Report.AppendLine($"   stripped {removed} stand-in, project or missing scripts");
            return removed;
        }

        static bool IsProjectScript(Component c) => c.GetType().Assembly.GetName().Name.StartsWith("Assembly-CSharp", StringComparison.Ordinal);

        void Validate(int stripped)
        {
            int outside = 0, foreign = 0, missing = 0, networked = 0, fixedIds = 0;
            Type idType = T("BS.BSObjectId"), syncType = T("BS.BSSyncedObject"), seatType = T("BS.BSSeat");
            foreach (var holder in Root.GetComponentsInChildren<Variables>(true))
                foreach (var d in holder.declarations)
                {
                    IEnumerable<object> values = d.value is IList l && !(d.value is Array) ? l.Cast<object>() : new[] { d.value };
                    foreach (var value in values)
                    {
                        if (!(value is UnityEngine.Object o) || o == null || EditorUtility.IsPersistent(o)) continue;
                        var t = o is GameObject go ? go.transform : o is Component c ? c.transform : null;
                        if (t == null || t.IsChildOf(Root.transform)) continue;
                        outside++;
                        Report.AppendLine($"   OUTSIDE: {holder.name}.{d.name} -> {t.name}");
                    }
                }
            foreach (var t in Root.GetComponentsInChildren<Transform>(true))
            {
                if (PrefabUtility.IsPartOfPrefabInstance(t.gameObject))
                {
                    outside++;
                    Report.AppendLine($"   OUTSIDE: {t.name} is still linked to a prefab (use stage.Copy, which unpacks)");
                }
                foreach (var c in t.GetComponents<Component>())
                {
                    if (c == null) { missing++; Report.AppendLine($"   MISSING SCRIPT on {KitPath(t, Root.transform)}"); continue; }
                    var type = c.GetType();
                    if (IsProjectScript(c) || (c is MonoBehaviour mb && IsStandIn(mb)))
                    {
                        foreign++;
                        Report.AppendLine($"   PROJECT SCRIPT: {type.FullName} on {KitPath(t, Root.transform)}");
                    }
                    if (syncType.IsAssignableFrom(type) || seatType.IsAssignableFrom(type))
                    {
                        networked++;
                        Report.AppendLine($"   NETWORKED: {type.Name} on {KitPath(t, Root.transform)} (the script adds it, after setting the instance's network id)");
                    }
                    var so = new SerializedObject(c);
                    if (type == idType && so.FindProperty("Id").stringValue.Length > 0)
                    {
                        fixedIds++;
                        Report.AppendLine($"   FIXED ID on {KitPath(t, Root.transform)}");
                    }
                    var p = so.GetIterator();
                    while (p.Next(true))
                    {
                        if (p.propertyType != SerializedPropertyType.ObjectReference || p.objectReferenceValue == null) continue;
                        var target = p.objectReferenceValue;
                        if (EditorUtility.IsPersistent(target))
                        {
                            // an asset: fine, unless it is a script of this project (a stand-in's MonoScript)
                            if (target is MonoScript script && p.propertyPath != "m_Script")
                            {
                                foreign++;
                                Report.AppendLine($"   PROJECT SCRIPT: {KitPath(t, Root.transform)} {type.Name}.{p.propertyPath} -> script {script.name}");
                            }
                            continue;
                        }
                        var tt = target is GameObject go ? go.transform : target is Component tc ? tc.transform : null;
                        if (tt == null || tt.IsChildOf(Root.transform)) continue;
                        outside++;
                        Report.AppendLine($"   OUTSIDE: {KitPath(t, Root.transform)} {type.Name}.{p.propertyPath} -> {tt.name}");
                    }
                }
            }
            if (outside + foreign + missing + networked + fixedIds > 0)
                throw new Exception($"{outside} references outside the kit, {foreign} project scripts, {missing} missing scripts, " +
                                    $"{networked} networked components, {fixedIds} fixed network ids");
        }

        // ------------------------------------------------------------------ field values (README, "Field values")

        static readonly (Type type, string kind)[] ComponentKinds =
        {
            (typeof(UnityEngine.UI.Text), "Text"), (typeof(TMPro.TMP_Text), "TMP"), (typeof(AudioSource), "AudioSource"), (typeof(Animator), "Animator"),
            (typeof(Renderer), "Renderer"), (typeof(ParticleSystem), "ParticleSystem"), (typeof(Transform), "Transform"), (typeof(Collider), "Collider"),
            (typeof(Rigidbody), "Rigidbody"),
        };

        JObject EncodeFields(MonoBehaviour standIn)
        {
            var fields = new JObject();
            var so = new SerializedObject(standIn);
            var p = so.GetIterator();
            bool enter = true;
            while (p.NextVisible(enter))
            {
                enter = false;
                if (p.name == "m_Script") continue;
                fields[p.name] = Encode(p.Copy(), standIn);
            }
            return fields;
        }

        JToken Encode(SerializedProperty p, MonoBehaviour owner)
        {
            switch (p.propertyType)
            {
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.LayerMask:
                case SerializedPropertyType.ArraySize:
                case SerializedPropertyType.Character:
                    return new JValue(p.longValue);
                case SerializedPropertyType.Enum: return new JValue((long)p.intValue);
                case SerializedPropertyType.Boolean: return new JValue(p.boolValue);
                case SerializedPropertyType.Float: return new JValue(p.doubleValue);
                case SerializedPropertyType.String: return new JValue(p.stringValue);
                case SerializedPropertyType.Vector2: return Tagged("$v2", p.vector2Value.x, p.vector2Value.y);
                case SerializedPropertyType.Vector3: return Tagged("$v3", p.vector3Value.x, p.vector3Value.y, p.vector3Value.z);
                case SerializedPropertyType.Vector4: return Tagged("$v4", p.vector4Value.x, p.vector4Value.y, p.vector4Value.z, p.vector4Value.w);
                case SerializedPropertyType.Vector2Int: return Tagged("$v2", p.vector2IntValue.x, p.vector2IntValue.y);
                case SerializedPropertyType.Vector3Int: return Tagged("$v3", p.vector3IntValue.x, p.vector3IntValue.y, p.vector3IntValue.z);
                case SerializedPropertyType.Quaternion: return Tagged("$q", p.quaternionValue.x, p.quaternionValue.y, p.quaternionValue.z, p.quaternionValue.w);
                case SerializedPropertyType.Color: return Tagged("$color", p.colorValue.r, p.colorValue.g, p.colorValue.b, p.colorValue.a);
                case SerializedPropertyType.AnimationCurve: return Curve(p.animationCurveValue);
                case SerializedPropertyType.ObjectReference: return Reference(p.objectReferenceValue, owner, p.propertyPath);
                case SerializedPropertyType.Generic:
                    if (p.isArray)
                    {
                        var array = new JArray();
                        for (int i = 0; i < p.arraySize; i++) array.Add(Encode(p.GetArrayElementAtIndex(i), owner));
                        return array;
                    }
                    var nested = new JObject();
                    var child = p.Copy();
                    var end = p.GetEndProperty();
                    bool enter = true;
                    while (child.NextVisible(enter) && !SerializedProperty.EqualContents(child, end))
                    {
                        enter = false;
                        nested[child.name] = Encode(child.Copy(), owner);
                    }
                    return nested;
                default:
                    Report.AppendLine($"   field {owner.GetType().Name}.{p.propertyPath}: a {p.propertyType} has no place in the bindings (null written)");
                    return JValue.CreateNull();
            }
        }

        static JObject Tagged(string tag, params float[] values) => new JObject { [tag] = new JArray(values.Select(v => (object)(double)v).ToArray()) };

        /// <summary>A curve as 33 samples from its first key to its last (one sample for a curve of one key, none for an empty one).</summary>
        static JObject Curve(AnimationCurve curve)
        {
            var points = new JArray();
            if (curve != null && curve.length == 1) points.Add(new JArray((double)curve[0].time, (double)curve[0].value));
            else if (curve != null && curve.length > 1)
            {
                float from = curve[0].time, to = curve[curve.length - 1].time;
                const int steps = 32;
                for (int i = 0; i <= steps; i++)
                {
                    float t = Mathf.Lerp(from, to, i / (float)steps);
                    points.Add(new JArray((double)t, (double)curve.Evaluate(t)));
                }
            }
            return new JObject { ["$curve"] = points };
        }

        JToken Reference(UnityEngine.Object target, MonoBehaviour owner, string field)
        {
            if (target == null) return JValue.CreateNull();
            target = Mine(target);
            if (target is GameObject go) return InKit(go.transform, owner, field) ? new JObject { ["$obj"] = KeyOf(go) } : (JToken)JValue.CreateNull();
            if (target is MonoBehaviour mb && IsStandIn(mb))
            {
                if (!InKit(mb.transform, owner, field)) return JValue.CreateNull();
                return new JObject { ["$beh"] = IdOf(mb) };
            }
            if (target is Component component)
            {
                if (!InKit(component.transform, owner, field)) return JValue.CreateNull();
                string kind = ComponentKinds.FirstOrDefault(k => k.type.IsInstanceOfType(component)).kind ?? component.GetType().Name;
                return new JObject { ["$comp"] = KeyOf(component.gameObject), ["kind"] = kind };
            }
            if (target is AudioClip clip)
            {
                // README: the index into the clip list of the owner's object. "on" always names that holder: the behaviour may
                // hand the clip to another object's source to play (upstream often keeps clips on a manager and plays them
                // through each piece's own source); the relay's audio op finds it by the holder's refs index (ClipIndex)
                var holder = owner.gameObject;
                int index = ClipIndex(holder, clip);
                return new JObject { ["$clip"] = index, ["on"] = KeyOf(holder) };
            }
            Report.AppendLine($"   field {owner.GetType().Name}.{field}: a reference to a {target.GetType().Name} ('{target.name}') has no place in the bindings (null written)");
            return JValue.CreateNull();
        }

        bool InKit(Transform t, MonoBehaviour owner, string field)
        {
            if (t.IsChildOf(Root.transform)) return true;
            Report.AppendLine($"   field {owner.GetType().Name}.{field} points at '{t.name}', which is not in the kit (null written)");
            return false;
        }
    }
}
