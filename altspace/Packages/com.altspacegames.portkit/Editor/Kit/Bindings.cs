using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace PortKit
{
    /// <summary>
    /// JSON written the one way both sides can reproduce: object keys sorted by UTF-16 code unit at every level,
    /// arrays in order, no white space, whole numbers without a fraction, other numbers rounded to six decimals and
    /// written without an exponent, strings escaped as JavaScript's JSON.stringify escapes them. In JavaScript:
    ///
    ///   const canon = v => v === null || typeof v !== "object" ? JSON.stringify(v)
    ///     : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
    ///     : "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    ///
    /// (Numbers beyond 15 significant digits are outside what the two sides are promised to agree on.)
    /// </summary>
    public static class CanonicalJson
    {
        public static string Write(JToken token)
        {
            var text = new StringBuilder();
            Write(token, text, -1, 0);
            return text.ToString();
        }

        /// <summary>The same values, keys in the same order, laid out for reading and for diffs.</summary>
        public static string WriteIndented(JToken token)
        {
            var text = new StringBuilder();
            Write(token, text, 2, 0);
            return text.Append('\n').ToString();
        }

        public static string Number(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return "null";
            double rounded = Math.Round(value, 6, MidpointRounding.AwayFromZero);
            if (rounded == 0) return "0";                                    // also -0
            if (Math.Abs(rounded) < 9.007199254740992e15 && Math.Floor(rounded) == rounded)
                return ((long)rounded).ToString(CultureInfo.InvariantCulture);
            return rounded.ToString("0.######", CultureInfo.InvariantCulture);
        }

        public static string String(string value)
        {
            var text = new StringBuilder(value.Length + 2).Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': text.Append("\\\""); break;
                    case '\\': text.Append("\\\\"); break;
                    case '\b': text.Append("\\b"); break;
                    case '\f': text.Append("\\f"); break;
                    case '\n': text.Append("\\n"); break;
                    case '\r': text.Append("\\r"); break;
                    case '\t': text.Append("\\t"); break;
                    default:
                        if (c < 0x20) text.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else text.Append(c);
                        break;
                }
            }
            return text.Append('"').ToString();
        }

        static void Write(JToken token, StringBuilder text, int indent, int depth)
        {
            void Line(int d)
            {
                if (indent < 0) return;
                text.Append('\n').Append(' ', indent * d);
            }
            switch (token?.Type ?? JTokenType.Null)
            {
                case JTokenType.Object:
                    var properties = ((JObject)token).Properties().OrderBy(p => p.Name, StringComparer.Ordinal).ToList();
                    if (properties.Count == 0) { text.Append("{}"); break; }
                    text.Append('{');
                    for (int i = 0; i < properties.Count; i++)
                    {
                        if (i > 0) text.Append(',');
                        Line(depth + 1);
                        text.Append(String(properties[i].Name)).Append(indent < 0 ? ":" : ": ");
                        Write(properties[i].Value, text, indent, depth + 1);
                    }
                    Line(depth);
                    text.Append('}');
                    break;
                case JTokenType.Array:
                    var items = (JArray)token;
                    if (items.Count == 0) { text.Append("[]"); break; }
                    // short rows of plain values (vectors, curve points) stay on one line
                    bool flat = indent < 0 || items.All(i => i.Type != JTokenType.Object && i.Type != JTokenType.Array) && items.Count <= 8;
                    text.Append('[');
                    for (int i = 0; i < items.Count; i++)
                    {
                        if (i > 0) text.Append(indent < 0 ? "," : flat ? ", " : ",");
                        if (!flat) Line(depth + 1);
                        Write(items[i], text, flat ? -1 : indent, depth + 1);
                    }
                    if (!flat) Line(depth);
                    text.Append(']');
                    break;
                case JTokenType.Integer: text.Append(((long)token).ToString(CultureInfo.InvariantCulture)); break;
                case JTokenType.Float: text.Append(Number((double)token)); break;
                case JTokenType.Boolean: text.Append((bool)token ? "true" : "false"); break;
                case JTokenType.String: text.Append(String((string)token)); break;
                case JTokenType.Null:
                case JTokenType.Undefined: text.Append("null"); break;
                default: text.Append(String(token.ToString())); break;
            }
        }

        public static string Sha1(string text)
        {
            using (var sha = SHA1.Create())
                return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(text)).Select(b => b.ToString("x2")));
        }
    }

    /// <summary>What a kit's script needs to know about its prefab: README, "bindings.json (schema 1)".</summary>
    public sealed class Bindings
    {
        public const int Schema = 1;
        public static readonly string[] EventKinds =
            { "click", "grab", "drop", "triggerEnter", "triggerExit", "collisionEnter", "uiButton", "uiSlider", "uiToggle", "heldTrigger", "heldPrimary", "heldSecondary", "field", "graph" };
        public static readonly string[] SyncKinds = { "none", "transform" };

        public sealed class ObjectEntry
        {
            public string Path;
            public string Sync = "none";
            public bool Grab, Click, Seat;
            /// <summary>False: the upstream prefab had it switched off; the kit holds it on and the runtime switches it off (README).</summary>
            public bool Active = true;
            /// <summary>
            /// True: attached to players with autoSync (AttachToHead): every client gives it its attachment id as the kit loads,
            /// so the others can reproduce the attachment (README). Written only when true: a kit with none keeps its hash.
            /// </summary>
            public bool Attach;
        }

        public sealed class BehaviourEntry
        {
            public string Id, Type, Object;
            public JObject Fields = new JObject();
            /// <summary>Optional (README): a sync group; every behaviour naming it shares one state leaf and one owner. Null: not written.</summary>
            public string Group;
            /// <summary>Optional (README): one copy per player. False: not written.</summary>
            public bool PerPlayer;
        }

        public sealed class EventEntry
        {
            public string Object, Kind, Behaviour, Method;
            /// <summary>Kind "graph" only (README): the name a graph reports through window.__pk1.event; such an event has no object.</summary>
            public string Name;
        }

        public string Slug = "";
        /// <summary>Optional (README): the prefab's name when it is not the slug (the kit root is looked for as "&lt;Root&gt;(Clone)"). Null: not written.</summary>
        public string Root;
        public string WindowsBundle = "", AndroidBundle = "";
        public readonly SortedDictionary<string, ObjectEntry> Objects = new SortedDictionary<string, ObjectEntry>(StringComparer.Ordinal);
        public readonly List<string> Refs = new List<string>();
        public readonly List<BehaviourEntry> Behaviours = new List<BehaviourEntry>();
        public readonly List<EventEntry> Events = new List<EventEntry>();

        /// <summary>The document without its hash.</summary>
        JObject Body()
        {
            var objects = new JObject();
            foreach (var pair in Objects)
            {
                objects[pair.Key] = new JObject
                {
                    ["path"] = pair.Value.Path, ["sync"] = pair.Value.Sync, ["grab"] = pair.Value.Grab, ["click"] = pair.Value.Click, ["seat"] = pair.Value.Seat,
                };
                if (!pair.Value.Active) objects[pair.Key]["active"] = false;       // written only when off: a kit with none keeps its hash
                if (pair.Value.Attach) objects[pair.Key]["attach"] = true;         // written only when set, likewise
            }
            var body = new JObject
            {
                ["schema"] = Schema,
                ["slug"] = Slug,
                ["bundles"] = new JObject { ["windows"] = WindowsBundle, ["android"] = AndroidBundle },
                ["objects"] = objects,
                ["refs"] = new JArray(Refs),
                ["behaviours"] = new JArray(Behaviours.Select(BehaviourJson)),
                ["events"] = new JArray(Events.Select(EventJson)),
            };
            if (!string.IsNullOrEmpty(Root)) body["root"] = Root;
            return body;
        }

        static JObject EventJson(EventEntry e)
        {
            // a graph event has a name and no object; every other kind is written as before, so its hash is unchanged
            if (e.Kind == "graph") return new JObject { ["kind"] = e.Kind, ["name"] = e.Name, ["behaviour"] = e.Behaviour, ["method"] = e.Method };
            return new JObject { ["object"] = e.Object, ["kind"] = e.Kind, ["behaviour"] = e.Behaviour, ["method"] = e.Method };
        }

        static JObject BehaviourJson(BehaviourEntry b)
        {
            var json = new JObject { ["id"] = b.Id, ["type"] = b.Type, ["object"] = b.Object, ["fields"] = b.Fields };
            // optional members are written only when used, so a kit that uses none keeps the hash it had
            if (!string.IsNullOrEmpty(b.Group)) json["group"] = b.Group;
            if (b.PerPlayer) json["perPlayer"] = true;
            return json;
        }

        /// <summary>sha1 (hex) of the canonical JSON of the document without its "hash" field.</summary>
        public string Hash() => CanonicalJson.Sha1(CanonicalJson.Write(Body()));

        public JObject ToJson()
        {
            var body = Body();
            body["hash"] = Hash();
            return body;
        }

        /// <summary>What is wrong with the document (empty: nothing): every key an entry names exists, kinds are known, paths are unique.</summary>
        public List<string> Problems()
        {
            var problems = new List<string>();
            if (!System.Text.RegularExpressions.Regex.IsMatch(Slug, "^[a-z0-9-]+$")) problems.Add($"slug '{Slug}' is not lower-case letters, digits and hyphens");
            foreach (var group in Objects.GroupBy(o => o.Value.Path).Where(g => g.Count() > 1))
                problems.Add($"path '{group.Key}' is given to several object keys: {string.Join(", ", group.Select(o => o.Key))}");
            foreach (var pair in Objects)
                if (!SyncKinds.Contains(pair.Value.Sync)) problems.Add($"object '{pair.Key}': sync '{pair.Value.Sync}' is not one of {string.Join(", ", SyncKinds)}");
            foreach (var key in Refs)
                if (!Objects.ContainsKey(key)) problems.Add($"refs names '{key}', which is not an object key");
            if (Refs.Distinct().Count() != Refs.Count) problems.Add("refs holds a key twice");
            var ids = new HashSet<string>();
            foreach (var b in Behaviours)
            {
                if (!ids.Add(b.Id)) problems.Add($"behaviour id '{b.Id}' is used twice");
                if (!Objects.ContainsKey(b.Object)) problems.Add($"behaviour '{b.Id}' is on '{b.Object}', which is not an object key");
                if (!string.IsNullOrEmpty(b.Group) && !System.Text.RegularExpressions.Regex.IsMatch(b.Group, "^[A-Za-z0-9_-]+$"))
                    problems.Add($"behaviour '{b.Id}': group '{b.Group}' must be letters, digits, underscore or hyphen");
                if (!string.IsNullOrEmpty(b.Group) && b.PerPlayer) problems.Add($"behaviour '{b.Id}' cannot be per-player and in a sync group at once");
            }
            foreach (var b in Behaviours) CheckValue(b.Fields, $"behaviour '{b.Id}'", ids, problems);
            foreach (var e in Events)
            {
                if (!EventKinds.Contains(e.Kind)) problems.Add($"event kind '{e.Kind}' is not one of {string.Join(", ", EventKinds)}");
                if (e.Kind == "graph")
                {
                    if (string.IsNullOrEmpty(e.Name) || !System.Text.RegularExpressions.Regex.IsMatch(e.Name, "^[A-Za-z0-9_.-]+$"))
                        problems.Add($"a graph event needs a name of letters, digits, '_', '.' or '-' (got '{e.Name}')");
                    else if (RelayGraph.RelayedKinds.Contains(e.Name) || new[] { "click", "grab", "drop", "triggerEnter", "triggerExit", "collisionEnter", "collisionExit", "clock", RelayGraph.HeadOp }.Contains(e.Name))
                        problems.Add($"graph event name '{e.Name}' is reserved for an object's own events (README, Graph to page)");
                    if (string.IsNullOrEmpty(e.Behaviour) || string.IsNullOrEmpty(e.Method)) problems.Add($"graph event '{e.Name}' needs a behaviour and a method");
                }
                else if (!Objects.ContainsKey(e.Object ?? "")) problems.Add($"an event is on '{e.Object}', which is not an object key");
                if (!string.IsNullOrEmpty(e.Behaviour) && !ids.Contains(e.Behaviour)) problems.Add($"an event names behaviour '{e.Behaviour}', which does not exist");
                if (RelayGraph.RelayedKinds.Contains(e.Kind) && !Refs.Contains(e.Object)) problems.Add($"event '{e.Kind}' on '{e.Object}' needs the relay graph, but '{e.Object}' is not in refs");
            }
            return problems;
        }

        void CheckValue(JToken value, string where, HashSet<string> ids, List<string> problems)
        {
            if (value is JObject o)
            {
                if (o["$obj"] != null && !Objects.ContainsKey((string)o["$obj"])) problems.Add($"{where}: $obj '{o["$obj"]}' is not an object key");
                if (o["$comp"] != null && !Objects.ContainsKey((string)o["$comp"])) problems.Add($"{where}: $comp '{o["$comp"]}' is not an object key");
                if (o["$beh"] != null && !ids.Contains((string)o["$beh"])) problems.Add($"{where}: $beh '{o["$beh"]}' is not a behaviour id");
                foreach (var p in o.Properties()) CheckValue(p.Value, where, ids, problems);
            }
            else if (value is JArray a)
                foreach (var item in a) CheckValue(item, where, ids, problems);
        }

        public void Save(string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            File.WriteAllText(path, CanonicalJson.WriteIndented(ToJson()), new UTF8Encoding(false));
        }
    }

    /// <summary>
    /// bindings.lock.json, checked in beside the builder: which object key and which behaviour id each thing was given,
    /// so a re-export gives the same ones (saved state, user data and the script are keyed by them). A key whose
    /// object has gone stays reserved and is never handed to another object.
    /// </summary>
    public sealed class BindingsLock
    {
        readonly string path;
        readonly SortedDictionary<string, string> objects = new SortedDictionary<string, string>(StringComparer.Ordinal);      // kit path -> object key
        readonly SortedDictionary<string, string> behaviours = new SortedDictionary<string, string>(StringComparer.Ordinal);   // "<object key>#<type>#<n>" -> id
        readonly HashSet<string> usedKeys = new HashSet<string>(StringComparer.Ordinal);
        readonly HashSet<string> usedIds = new HashSet<string>(StringComparer.Ordinal);
        int nextBehaviour = 1;

        public BindingsLock(string path)
        {
            this.path = path;
            if (!File.Exists(path)) return;
            var json = JObject.Parse(File.ReadAllText(path));
            foreach (var p in (json["objects"] as JObject ?? new JObject()).Properties()) { objects[p.Name] = (string)p.Value; usedKeys.Add((string)p.Value); }
            foreach (var p in (json["behaviours"] as JObject ?? new JObject()).Properties()) { behaviours[p.Name] = (string)p.Value; usedIds.Add((string)p.Value); }
            nextBehaviour = (int?)json["nextBehaviour"] ?? 1;
        }

        /// <summary>The key for the object at `kitPath`: `wanted` if the builder names one, else the one it had before, else a new one made from `nameHint`.</summary>
        public string ObjectKey(string kitPath, string wanted, string nameHint)
        {
            if (!string.IsNullOrEmpty(wanted))
            {
                foreach (var pair in objects.Where(o => o.Value == wanted && o.Key != kitPath).ToList()) objects.Remove(pair.Key);   // the builder moved it
                objects[kitPath] = wanted;
                usedKeys.Add(wanted);
                return wanted;
            }
            if (objects.TryGetValue(kitPath, out var known)) return known;
            string stem = Camel(nameHint);
            string key = stem;
            for (int n = 2; usedKeys.Contains(key); n++) key = stem + n.ToString(CultureInfo.InvariantCulture);
            usedKeys.Add(key);
            objects[kitPath] = key;
            return key;
        }

        /// <summary>
        /// The id of the n-th behaviour of a type on an object ("b1", "b2", ... in the order first seen, for ever), or `wanted`
        /// when the builder asks for one (KitStage.Behaviour(..., id: "board")): that slot keeps it, and it is never handed out
        /// as an automatic id.
        /// </summary>
        public string BehaviourId(string objectKey, string type, int ordinal, string wanted = null)
        {
            string slot = objectKey + "#" + type + "#" + ordinal.ToString(CultureInfo.InvariantCulture);
            if (!string.IsNullOrEmpty(wanted))
            {
                foreach (var pair in behaviours.Where(b => b.Value == wanted && b.Key != slot).ToList()) behaviours.Remove(pair.Key);   // the builder moved it
                behaviours[slot] = wanted;
                usedIds.Add(wanted);
                return wanted;
            }
            if (behaviours.TryGetValue(slot, out var known)) return known;
            string id;
            do id = "b" + (nextBehaviour++).ToString(CultureInfo.InvariantCulture); while (usedIds.Contains(id));
            usedIds.Add(id);
            behaviours[slot] = id;
            return id;
        }

        static string Camel(string name)
        {
            var text = new StringBuilder();
            bool upper = false;
            foreach (char c in name ?? "")
            {
                if (c < 128 && char.IsLetterOrDigit(c))
                {
                    text.Append(text.Length == 0 ? char.ToLowerInvariant(c) : upper ? char.ToUpperInvariant(c) : c);
                    upper = false;
                }
                else upper = text.Length > 0;
            }
            if (text.Length == 0 || char.IsDigit(text[0])) text.Insert(0, "obj");
            return text.ToString();
        }

        public void Save()
        {
            var json = new JObject
            {
                ["schema"] = 1,
                ["nextBehaviour"] = nextBehaviour,
                ["objects"] = new JObject(objects.Select(o => new JProperty(o.Key, o.Value))),
                ["behaviours"] = new JObject(behaviours.Select(b => new JProperty(b.Key, b.Value))),
            };
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            string text = CanonicalJson.WriteIndented(json);
            if (!File.Exists(path) || File.ReadAllText(path) != text) File.WriteAllText(path, text, new UTF8Encoding(false));
        }
    }
}
