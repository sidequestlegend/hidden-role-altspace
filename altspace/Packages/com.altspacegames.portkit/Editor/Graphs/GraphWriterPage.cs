using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Unity.VisualScripting;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// What any generated graph of a kit needs to talk to the page (README, "Relay graph" and "Graph to page"): the
    /// kit's root and refs, the instance it belongs to, percent-coding of arguments, and window.__pk1.event(...).
    ///
    /// Every machine the kit builder adds gets an Object variable "PkRoot" (the kit's root), so a graph on any object
    /// of the kit finds the holder the snippet script made ("pk1:&lt;slug&gt;:&lt;inst&gt;", the root's parent) the same way.
    /// </summary>
    public sealed partial class GraphWriter
    {
        public const string KitRootVariable = "PkRoot";
        public const string RefsVariable = "Refs";
        /// <summary>The Return ID given to injected script: nothing listens for it.</summary>
        public const string NoReply = "pk1:noreply";

        static readonly Type[] ReplaceSignature = { typeof(string), typeof(string) };
        static readonly Type[] SubstringRange = { typeof(int), typeof(int) };

        /// <summary>The kit's root object (this graph's "PkRoot" variable, set by the kit builder).</summary>
        public Val KitRoot() => ObjVar(KitRootVariable, typeof(GameObject));

        /// <summary>"pk1:&lt;slug&gt;:&lt;inst&gt;": the name of the object the snippet script loaded this kit into.</summary>
        public Val HolderName() =>
            Get(typeof(Transform), "name", Get(typeof(Transform), "parent", Get(typeof(GameObject), "transform", KitRoot())));

        /// <summary>"&lt;slug&gt;:&lt;inst&gt;": what the page calls this copy of the kit.</summary>
        public Val Instance() => Substring(HolderName(), 4);

        /// <summary>The object at `index` of the kit's refs (bindings.refs order), from the root's "Refs" list.</summary>
        public Val KitRef(object index) => ListItem(ObjVarOf(KitRoot(), RefsVariable, typeof(IList)), index, typeof(GameObject));

        /// <summary>text.Substring(start, length).</summary>
        public Val Substring(Val text, object start, object length) => Call(typeof(string), "Substring", SubstringRange, text, start, length);

        public Val Replace(Val text, string what, string with) => Call(typeof(string), "Replace", ReplaceSignature, text, what, with);

        /// <summary>A number as text with a dot, whatever the device's language (the SDK's own unit; a float's precision).</summary>
        public Val InvariantText(object number) => PlatformValue("ToStringInvariant", "string", typeof(string), ("float", number));

        // The README's percent-coding of one argument: enough that it can sit between bars, inside a JSON string and
        // inside a script's string literal without any escape.
        static readonly (string plain, string coded)[] ArgCoding =
        {
            ("|", "%7C"), ("^", "%5E"), ("\"", "%22"), ("\\", "%5C"), ("\n", "%0A"), ("\r", "%0D"), ("\t", "%09"),
        };

        /// <summary>A text value made safe to send as one argument ("%" first, so nothing is coded twice).</summary>
        public Val EncodeArg(Val text)
        {
            var value = Replace(text, "%", "%25");
            foreach (var (plain, coded) in ArgCoding) value = Replace(value, plain, coded);
            return value;
        }

        /// <summary>The text an argument stood for ("%25" last).</summary>
        public Val DecodeArg(Val argument)
        {
            var value = argument;
            foreach (var (plain, coded) in ArgCoding) value = Replace(value, coded, plain);
            return Replace(value, "%25", "%");
        }

        /// <summary>The same coding for a value known when the graph is generated.</summary>
        public static string EncodeArg(string text)
        {
            var coded = new StringBuilder();
            foreach (char c in text ?? "")
            {
                if (c == '%' || c == '|' || c == '^' || c == '"' || c == '\\' || c < 0x20) coded.Append('%').Append(((int)c).ToString("X2", CultureInfo.InvariantCulture));
                else coded.Append(c);
            }
            return coded.ToString();
        }

        /// <summary>The parts joined into one text value; neighbouring literals are joined when the graph is generated.</summary>
        public Val Join(params object[] parts)
        {
            var merged = new List<object>();
            foreach (var part in parts)
            {
                if (part is Val) merged.Add(part);
                else
                {
                    string text = Convert.ToString(part, CultureInfo.InvariantCulture);
                    if (merged.Count > 0 && merged[merged.Count - 1] is string before) merged[merged.Count - 1] = before + text;
                    else merged.Add(text);
                }
            }
            if (merged.Count == 0) merged.Add("");
            object result = merged[0];
            for (int i = 1; i < merged.Count; i++) result = Concat(result, merged[i]);
            return result as Val ?? Out(Add(new Literal(typeof(string), (string)result)), "output", typeof(string));
        }

        /// <summary>Run script in the world's page, as a step (the SDK's "Inject BullSchript" unit).</summary>
        public void InjectScript(Val script) => PlatformDo("InjectJS", ("BullSchript", script), ("Return ID", NoReply));

        /// <summary>
        /// Tell the page something happened, as a step: window.__pk1.event("&lt;slug&gt;:&lt;inst&gt;", "&lt;name&gt;", "&lt;arg&gt;|&lt;arg&gt;...").
        /// An argument that is a Val goes as it is: wrap free text in EncodeArg, numbers in InvariantText. Anything else
        /// is a literal, coded here.
        /// </summary>
        public void PageEvent(string name, params object[] args)
        {
            if (string.IsNullOrEmpty(name) || !System.Text.RegularExpressions.Regex.IsMatch(name, "^[A-Za-z0-9_.-]+$"))
                throw new Exception($"page event name '{name}' must be letters, digits, dot, underscore or hyphen");
            var parts = new List<object> { "window.__pk1&&window.__pk1.event(\"", Instance(), "\",\"" + name + "\",\"" };
            for (int i = 0; i < args.Length; i++)
            {
                if (i > 0) parts.Add("|");
                parts.Add(args[i] is Val ? args[i] : EncodeArg(Convert.ToString(args[i], CultureInfo.InvariantCulture)));
            }
            parts.Add("\")");
            InjectScript(Join(parts.ToArray()));
        }
    }
}
