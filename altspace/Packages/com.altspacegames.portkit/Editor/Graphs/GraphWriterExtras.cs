using System;
using Unity.VisualScripting;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// Graph-writer helpers beyond the core (lifted from FlightWorld's GraphWriterGround.cs and GraphWriterWeapons.cs,
    /// plus what the relay graph needs: null checks, type literals, whole numbers and text).
    /// </summary>
    public sealed partial class GraphWriter
    {
        // ---- lists ---------------------------------------------------------------------------------------
        /// <summary>list[index] (a stock "Get List Item" unit; arrays are lists too).</summary>
        public Val ListItem(Val list, object index, Type type)
        {
            var unit = Add(new GetListItem());
            Feed(unit, "list", list);
            Feed(unit, "index", index);
            return Out(unit, "item", type);
        }

        /// <summary>list.Add(item), as a step (a stock "Add List Item" unit).</summary>
        public void ListAdd(Val list, Val item)
        {
            var unit = Add(new AddListItem());
            Feed(unit, "listInput", list);
            Feed(unit, "item", item);
            Chain(unit, "enter", "exit");
        }

        /// <summary>list.Clear(), as a step.</summary>
        public void ListClear(Val list)
        {
            var unit = Add(new ClearList());
            Feed(unit, "listInput", list);
            Chain(unit, "enter", "exit");
        }

        /// <summary>How many items a list or array holds (a stock "Count Items" unit).</summary>
        public Val Count(Val collection) => Unit<CountItems>("count", typeof(int), ("collection", collection));

        // ---- vectors -------------------------------------------------------------------------------------
        static readonly Type V3Type = typeof(Vector3);
        static readonly Type[] TwoVectors = { typeof(Vector3), typeof(Vector3) };

        public Val ProjectOnPlane(object vector, object planeNormal) => Call(V3Type, "ProjectOnPlane", TwoVectors, null, vector, planeNormal);
        public Val Project(object vector, object onNormal) => Call(V3Type, "Project", TwoVectors, null, vector, onNormal);
        public Val Normalized(Val vector) => Get(V3Type, "normalized", vector);
        public Val Angle(object from, object to) => Call(V3Type, "Angle", TwoVectors, null, from, to);
        public Val ClampMagnitude(Val vector, object maxLength) =>
            Call(V3Type, "ClampMagnitude", new[] { typeof(Vector3), typeof(float) }, null, vector, maxLength);

        /// <summary>Vector3.Lerp with literal or computed ends (t is clamped to 0..1).</summary>
        public Val LerpVector(object a, object b, object t) =>
            Call(V3Type, "Lerp", new[] { typeof(Vector3), typeof(Vector3), typeof(float) }, null, a, b, t);

        /// <summary>new Vector2(x, y).</summary>
        public Val V2(object x, object y)
        {
            var ctor = typeof(Vector2).GetConstructor(new[] { typeof(float), typeof(float) });
            var unit = Add(new InvokeMember(Use(new Member(typeof(Vector2), ctor))));
            Feed(unit, unit.inputParameters[0].key, x);
            Feed(unit, unit.inputParameters[1].key, y);
            return Out(unit, "result", typeof(Vector2));
        }

        /// <summary>new Color(r, g, b, a).</summary>
        public Val Rgba(object r, object g, object b, object a)
        {
            var ctor = typeof(Color).GetConstructor(new[] { typeof(float), typeof(float), typeof(float), typeof(float) });
            var unit = Add(new InvokeMember(Use(new Member(typeof(Color), ctor))));
            Feed(unit, unit.inputParameters[0].key, r);
            Feed(unit, unit.inputParameters[1].key, g);
            Feed(unit, unit.inputParameters[2].key, b);
            Feed(unit, unit.inputParameters[3].key, a);
            return Out(unit, "result", typeof(Color));
        }

        // ---- numbers -------------------------------------------------------------------------------------
        public Val Sign(object value) => Call(typeof(Mathf), "Sign", new[] { typeof(float) }, null, value);
        public Val RoundToInt(object value) => Call(typeof(Mathf), "RoundToInt", new[] { typeof(float) }, null, value);
        public Val RandomValue() => Get(typeof(UnityEngine.Random), "value");

        /// <summary>A number sent in a one-shot: hundredths as a whole number, so no locale can put a comma in it.</summary>
        public Val NumberText(object value) =>
            Call(typeof(int), "ToString", Type.EmptyTypes, Call(typeof(Mathf), "RoundToInt", new[] { typeof(float) }, null, value is Val v ? v * 100f : (object)((float)value * 100f)));

        /// <summary>The number NumberText wrote.</summary>
        public Val ParseNumber(object text) =>
            PlatformValue("ParseStringInvariant", "float", typeof(float), ("string", text)) / 100f;

        /// <summary>A float written with a dot whatever the device's language (the SDK's own unit).</summary>
        public Val ParseFloat(object text) => PlatformValue("ParseStringInvariant", "float", typeof(float), ("string", text));

        /// <summary>A whole number written in digits (int.Parse: digits read the same in every language).</summary>
        public Val ParseInt(object text) => Call(typeof(int), "Parse", OneString, null, text);

        // ---- text ----------------------------------------------------------------------------------------
        static readonly Type[] OneString = { typeof(string) };
        static readonly Type[] TwoStrings = { typeof(string), typeof(string) };
        static readonly Type[] ThreeStrings = { typeof(string), typeof(string), typeof(string) };
        static readonly Type[] FourStrings = { typeof(string), typeof(string), typeof(string), typeof(string) };
        static readonly Type[] OneInt = { typeof(int) };

        public Val StartsWith(object text, object prefix) => Call(typeof(string), "StartsWith", OneString, text as Val ?? throw new ArgumentException("text must be a value"), prefix);
        public Val Concat(object a, object b) => Call(typeof(string), "Concat", TwoStrings, null, a, b);
        public Val Concat(object a, object b, object c) => Call(typeof(string), "Concat", ThreeStrings, null, a, b, c);
        public Val Concat(object a, object b, object c, object d) => Call(typeof(string), "Concat", FourStrings, null, a, b, c, d);
        public Val Length(Val text) => Get(typeof(string), "Length", text);
        /// <summary>text.Substring(start): from `start` to the end.</summary>
        public Val Substring(Val text, object start) => Call(typeof(string), "Substring", OneInt, text, start);
        /// <summary>text.Remove(start): everything before `start`.</summary>
        public Val Before(Val text, object start) => Call(typeof(string), "Remove", OneInt, text, start);

        /// <summary>text.Split(separator) as a string array.</summary>
        public Val Split(Val text, string separator) =>
            Call(typeof(string), "Split", new[] { typeof(string), typeof(StringSplitOptions) }, text, separator, StringSplitOptions.None);

        // ---- variables, nulls and types ------------------------------------------------------------------
        /// <summary>Whether `owner` has an Object variable called `name` (a stock "Is Variable Defined" unit).</summary>
        public Val IsDefined(Val owner, string name)
        {
            var unit = Add(new IsVariableDefined { kind = VariableKind.Object });
            Feed(unit, "name", name);
            Feed(unit, "object", owner);
            return Out(unit, "isDefined", typeof(bool));
        }

        /// <summary>An explicit null of a type (a call input left unconnected has no value at all).</summary>
        public Val Null(Type type) => Out(Add(new Literal(type, null)), "output", type);

        /// <summary>A System.Type as a value, e.g. for GameObject.GetComponent(Type).</summary>
        public Val TypeOf(Type type) => Out(Add(new Literal(typeof(Type), type)), "output", typeof(Type));

        /// <summary>
        /// gameObject.GetComponent(type): the component, or null when the object has none (which a typed input fed
        /// straight from a GameObject cannot say: it would throw). Follow with IfNotNull.
        /// </summary>
        public Val ComponentOf(Val gameObject, Type type) =>
            new Val(this, Call(typeof(GameObject), "GetComponent", new[] { typeof(Type) }, gameObject, TypeOf(type)).port, type);

        /// <summary>Run `then` when the value is there, `otherwise` when it is null or a destroyed Unity object; the main chain carries on afterwards.</summary>
        public void IfNotNull(Val value, Action then, Action otherwise = null)
        {
            var sequence = Add(new Sequence { outputCount = 2 });
            sequence.EnsureDefined();
            Chain(sequence, "enter", "1");
            var after = tail;
            var check = Add(new NullCheck());
            Feed(check, "input", value);
            sequence.controlOutputs["0"].ConnectToValid(check.controlInputs["enter"]);
            tail = check.controlOutputs["ifNotNull"];
            then();
            if (otherwise != null)
            {
                tail = check.controlOutputs["ifNull"];
                otherwise();
            }
            tail = after;
        }

        /// <summary>if / else-if chain on a text value: the first case equal to `value` runs, then the main chain carries on.</summary>
        public void Switch(Val value, params (string text, Action body)[] cases)
        {
            void From(int i)
            {
                if (i >= cases.Length) return;
                If(Same(value, cases[i].text), cases[i].body, i + 1 < cases.Length ? () => From(i + 1) : (Action)null);
            }
            From(0);
        }
    }
}
