using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Unity.VisualScripting;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>A value flowing through a graph under construction: an output port plus its static type.</summary>
    public sealed class Val
    {
        public readonly GraphWriter g;
        public readonly ValueOutput port;
        public readonly Type type;

        public Val(GraphWriter g, ValueOutput port, Type type)
        {
            this.g = g;
            this.port = port;
            this.type = type;
        }

        bool IsVector => type == typeof(Vector3);

        public static Val operator +(Val a, Val b) => a.IsVector ? a.g.Unit<Vector3Sum>("sum", typeof(Vector3), ("0", a), ("1", b)) : a.g.Unit<ScalarSum>("sum", typeof(float), ("0", a), ("1", b));
        public static Val operator +(Val a, float b) => a.g.Unit<ScalarSum>("sum", typeof(float), ("0", a), ("1", b));
        public static Val operator +(float a, Val b) => b + a;
        public static Val operator -(Val a, Val b) => a.IsVector ? a.g.Unit<Vector3Subtract>("difference", typeof(Vector3), ("minuend", a), ("subtrahend", b)) : a.g.Unit<ScalarSubtract>("difference", typeof(float), ("minuend", a), ("subtrahend", b));
        public static Val operator -(Val a, float b) => a.g.Unit<ScalarSubtract>("difference", typeof(float), ("minuend", a), ("subtrahend", b));
        public static Val operator -(float a, Val b) => b.g.Unit<ScalarSubtract>("difference", typeof(float), ("minuend", a), ("subtrahend", b));
        public static Val operator -(Val a) => a.IsVector ? a.g.Scale(a, -1f) : a.g.Unit<ScalarMultiply>("product", typeof(float), ("a", a), ("b", -1f));

        public static Val operator *(Val a, Val b)
        {
            if (a.IsVector && b.IsVector) return a.g.Unit<Vector3Multiply>("product", typeof(Vector3), ("a", a), ("b", b));
            if (a.IsVector) return a.g.Scale(a, b);
            if (b.IsVector) return a.g.Scale(b, a);
            return a.g.Unit<ScalarMultiply>("product", typeof(float), ("a", a), ("b", b));
        }

        public static Val operator *(Val a, float b) => a.IsVector ? a.g.Scale(a, b) : a.g.Unit<ScalarMultiply>("product", typeof(float), ("a", a), ("b", b));
        public static Val operator *(float a, Val b) => b * a;
        public static Val operator /(Val a, Val b) => a.g.Unit<ScalarDivide>("quotient", typeof(float), ("dividend", a), ("divisor", b));
        public static Val operator /(Val a, float b) => a.g.Unit<ScalarDivide>("quotient", typeof(float), ("dividend", a), ("divisor", b));
        public static Val operator /(float a, Val b) => b.g.Unit<ScalarDivide>("quotient", typeof(float), ("dividend", a), ("divisor", b));
    }

    /// <summary>
    /// Builds a Visual Scripting flow graph from C#, so game logic can be written, reviewed and diffed as
    /// code but shipped as a graph (worlds cannot carry custom scripts).
    ///
    /// Two rules of the runtime shape this API:
    ///  - Value nodes are re-evaluated every time something reads them. Anything read more than once
    ///    should go through <see cref="Keep"/>, which stores it once per event.
    ///  - Only members on the Creator SDK allow list run in the app; every member used is recorded in
    ///    <see cref="usedMembers"/> and checked when the graph is saved.
    /// </summary>
    public sealed partial class GraphWriter
    {
        public readonly FlowGraph graph = new FlowGraph();
        public readonly SortedSet<string> usedMembers = new SortedSet<string>(StringComparer.Ordinal);
        ControlOutput tail;
        int placed;

        // ---- plumbing ---------------------------------------------------------------------------
        public T Add<T>(T unit) where T : IUnit
        {
            unit.position = new Vector2((placed % 14) * 250f, (placed / 14) * 150f);
            placed++;
            graph.units.Add(unit);
            unit.EnsureDefined();
            return unit;
        }

        public void Feed(IUnit unit, string key, object arg)
        {
            if (!unit.valueInputs.Contains(key))
                throw new Exception($"{unit.GetType().Name} has no value input '{key}' (has: {string.Join(", ", unit.valueInputs.Select(p => p.key))})");
            var input = unit.valueInputs[key];
            if (arg is Val v)
            {
                if (!v.port.CanConnectToValid(input))
                    throw new Exception($"cannot connect {v.port.unit.GetType().Name}.{v.port.key} ({v.type?.Name}) to {unit.GetType().Name}.{key} ({input.type.Name})");
                v.port.ConnectToValid(input);
            }
            else if (arg != null)
            {
                // An inline default only survives save / load when the unit itself declares one for that
                // input (others are dropped when the unit is re-defined, and Object-typed inputs ignore
                // them outright). Everything else gets an explicit Literal node.
                if (input.hasDefaultValue && ValueInput.SupportsDefaultValue(input.type))
                {
                    input.SetDefaultValue(arg);
                }
                else
                {
                    var literal = Add(new Literal(arg.GetType(), arg));
                    literal.output.ConnectToValid(input);
                }
            }
        }

        Val Out(IUnit unit, string key, Type type)
        {
            if (!unit.valueOutputs.Contains(key))
                throw new Exception($"{unit.GetType().Name} has no value output '{key}' (has: {string.Join(", ", unit.valueOutputs.Select(p => p.key))})");
            return new Val(this, unit.valueOutputs[key], type);
        }

        /// <summary>Add a pure value unit, feed its inputs (Val = connection, anything else = literal) and return one output.</summary>
        public Val Unit<T>(string output, Type type, params (string key, object arg)[] inputs) where T : IUnit, new()
        {
            var unit = Add(new T());
            foreach (var (key, arg) in inputs) Feed(unit, key, arg);
            return Out(unit, output, type);
        }

        /// <summary>Append a unit to the current control chain.</summary>
        public void Chain(IUnit unit, string enter = null, string exit = null)
        {
            var input = enter != null ? unit.controlInputs[enter] : unit.controlInputs.First();
            if (tail == null) throw new Exception("no event started: call On(...) first");
            tail.ConnectToValid(input);
            tail = exit != null ? unit.controlOutputs[exit] : unit.controlOutputs.FirstOrDefault();
        }

        // ---- platform (Creator SDK) units, created by type name ------------------------------------------
        public IUnit Platform(string typeName, params (string key, object arg)[] inputs)
        {
            var unit = Add((IUnit)Activator.CreateInstance(GraphTypes.Find("BS.VisualScripting." + typeName)));
            foreach (var (key, arg) in inputs) Feed(unit, key, arg);
            return unit;
        }

        /// <summary>A platform unit used as a pure value (e.g. the local player's head position).</summary>
        public Val PlatformValue(string typeName, string output, Type type, params (string key, object arg)[] inputs) =>
            Out(Platform(typeName, inputs), output, type);

        /// <summary>A platform unit run as a step in the control chain.</summary>
        public void PlatformDo(string typeName, params (string key, object arg)[] inputs) => Chain(Platform(typeName, inputs));

        // ---- events and control flow ---------------------------------------------------------------
        /// <summary>Start a new event handler; `body` adds its steps. Returns the event unit for reading its outputs.</summary>
        public T On<T>(T eventUnit, Action<T> body, params (string key, object arg)[] inputs) where T : IUnit
        {
            if (eventUnit.graph == null) Add(eventUnit);      // platform events arrive already added
            foreach (var (key, arg) in inputs) Feed(eventUnit, key, arg);
            var saved = tail;
            tail = eventUnit.controlOutputs.First();
            body(eventUnit);
            tail = saved;
            return eventUnit;
        }

        public Val EventOut(IUnit eventUnit, string key, Type type) => Out(eventUnit, key, type);

        public void If(Val condition, Action then, Action otherwise = null)
        {
            // A Sequence keeps the main chain going after the branches finish.
            var sequence = Add(new Sequence { outputCount = 2 });
            sequence.EnsureDefined();
            Chain(sequence, "enter", "1");
            var after = tail;
            var branch = Add(new If());
            Feed(branch, "condition", condition);
            sequence.controlOutputs["0"].ConnectToValid(branch.controlInputs["enter"]);
            tail = branch.controlOutputs["ifTrue"];
            then();
            if (otherwise != null)
            {
                tail = branch.controlOutputs["ifFalse"];
                otherwise();
            }
            tail = after;
        }

        /// <summary>Run `body` once per item of a list; the main chain carries on afterwards.</summary>
        public void ForEach(Val collection, Type itemType, Action<Val> body)
        {
            var loop = Add(new Unity.VisualScripting.ForEach());
            Feed(loop, "collection", collection);
            Chain(loop, "enter", "exit");
            var after = tail;
            tail = loop.controlOutputs["body"];
            body(Out(loop, "currentItem", itemType));
            tail = after;
        }

        /// <summary>Evaluate once now and reuse the stored result for the rest of this event.</summary>
        public Val Keep(Val value)
        {
            var cache = Add(new Unity.VisualScripting.Cache());
            Feed(cache, "input", value);
            Chain(cache, "enter", "exit");
            return Out(cache, "output", value.type);
        }

        // ---- variables -------------------------------------------------------------------------------
        public void Declare(string name, object initial) => graph.variables.Set(name, initial);

        public Val GraphVar(string name, Type type)
        {
            if (!graph.variables.IsDefined(name)) throw new Exception($"graph variable '{name}' used before Declare()");
            var unit = Add(new GetVariable { kind = VariableKind.Graph });
            Feed(unit, "name", name);
            return Out(unit, "value", type);
        }

        public Val F(string name) => GraphVar(name, typeof(float));
        public Val B(string name) => GraphVar(name, typeof(bool));

        /// <summary>Assign a graph variable; the returned value is the stored result (no re-evaluation).</summary>
        public Val SetGraphVar(string name, object value, Type type = null)
        {
            if (!graph.variables.IsDefined(name)) throw new Exception($"graph variable '{name}' assigned before Declare()");
            var unit = Add(new SetVariable { kind = VariableKind.Graph });
            Feed(unit, "name", name);
            Feed(unit, "input", value);
            Chain(unit, "assign", "assigned");
            return Out(unit, "output", type ?? (value as Val)?.type ?? value?.GetType());
        }

        /// <summary>Read an Object variable from this GameObject's Variables component (per-aircraft tuning and references).</summary>
        public Val ObjVar(string name, Type type)
        {
            objectVariables.Add(name);
            var unit = Add(new GetVariable { kind = VariableKind.Object });
            Feed(unit, "name", name);
            return Out(unit, "value", type);
        }

        public Val P(string name) => ObjVar(name, typeof(float));

        /// <summary>Read an Object variable from another GameObject's Variables component.</summary>
        public Val ObjVarOf(Val owner, string name, Type type)
        {
            var unit = Add(new GetVariable { kind = VariableKind.Object });
            Feed(unit, "name", name);
            Feed(unit, "object", owner);
            return Out(unit, "value", type);
        }

        /// <summary>Assign an Object variable, on this GameObject or (with `owner`) on another one; returns the stored value.</summary>
        public Val SetObjVar(string name, object value, Val owner = null, Type type = null)
        {
            var unit = Add(new SetVariable { kind = VariableKind.Object });
            Feed(unit, "name", name);
            if (owner != null) Feed(unit, "object", owner);
            Feed(unit, "input", value);
            Chain(unit, "assign", "assigned");
            return Out(unit, "output", type ?? (value as Val)?.type ?? value?.GetType());
        }
        public readonly SortedSet<string> objectVariables = new SortedSet<string>(StringComparer.Ordinal);

        // ---- members ---------------------------------------------------------------------------------
        Member Use(Member member)
        {
            usedMembers.Add(member.targetType.FullName + "." + member.name);
            return member;
        }

        /// <summary>Read a property or field. `target` null means "the component on this GameObject" (or a static member).</summary>
        public Val Get(Type owner, string name, Val target = null)
        {
            var member = Use(new Member(owner, name));
            var unit = Add(new GetMember(member));
            if (target != null) Feed(unit, "target", target);
            return Out(unit, "value", unit.valueOutputs["value"].type);
        }

        /// <summary>Call a method with a return value as a pure value node.</summary>
        public Val Call(Type owner, string name, Type[] signature, Val target, params object[] args)
        {
            var unit = Add(new InvokeMember(Use(new Member(owner, name, signature))));
            if (target != null) Feed(unit, "target", target);
            for (int i = 0; i < args.Length; i++) Feed(unit, unit.inputParameters[i].key, args[i]);
            return Out(unit, "result", unit.result.type);
        }

        /// <summary>Call a method as a step in the control chain (for side effects).</summary>
        public InvokeMember Do(Type owner, string name, Type[] signature, Val target, params object[] args)
        {
            var unit = Add(new InvokeMember(Use(new Member(owner, name, signature))));
            if (target != null) Feed(unit, "target", target);
            for (int i = 0; i < args.Length; i++) Feed(unit, unit.inputParameters[i].key, args[i]);
            Chain(unit, "enter", "exit");
            return unit;
        }

        /// <summary>
        /// Call a method that has out parameters, as a step in the control chain. Pass null in `args` at each
        /// out parameter's place; read the results afterwards with Result() and OutParam().
        /// </summary>
        public InvokeMember DoOut(Type owner, string name, Type[] signature, Val target, params object[] args)
        {
            var unit = Add(new InvokeMember(Use(new Member(owner, name, signature))));
            if (target != null) Feed(unit, "target", target);
            for (int i = 0; i < args.Length; i++)
                if (unit.inputParameters.ContainsKey(i)) Feed(unit, unit.inputParameters[i].key, args[i]);
            Chain(unit, "enter", "exit");
            return unit;
        }

        public Val Result(InvokeMember unit) => Out(unit, "result", unit.result.type);
        public Val OutParam(InvokeMember unit, int index, Type type) => Out(unit, unit.outputParameters[index].key, type);

        /// <summary>Assign a property or field as a step in the control chain.</summary>
        public void Set(Type owner, string name, Val target, object value)
        {
            var unit = Add(new SetMember(Use(new Member(owner, name))));
            if (target != null) Feed(unit, "target", target);
            Feed(unit, "input", value);
            Chain(unit, "assign", "assigned");
        }

        // ---- maths -----------------------------------------------------------------------------------
        public Val Min(object a, object b) => Unit<ScalarMinimum>("minimum", typeof(float), ("0", a), ("1", b));
        public Val Max(object a, object b) => Unit<ScalarMaximum>("maximum", typeof(float), ("0", a), ("1", b));
        public Val Clamp(Val v, object lo, object hi) => Min(Max(v, lo), hi);
        public Val Clamp01(Val v) => Clamp(v, 0f, 1f);
        public Val Abs(Val v) => Unit<ScalarAbsolute>("output", typeof(float), ("input", v));
        public Val Pow(object b, object e) => Unit<ScalarExponentiate>("power", typeof(float), ("base", b), ("exponent", e));
        public Val Lerp(object a, object b, object t) => Unit<ScalarLerp>("interpolation", typeof(float), ("a", a), ("b", b), ("t", t));
        public Val MoveTowards(object current, object target, object maxDelta) => Unit<ScalarMoveTowards>("result", typeof(float), ("current", current), ("target", target), ("maxDelta", maxDelta));
        public Val Less(object a, object b) => Unit<Less>("comparison", typeof(bool), ("a", a), ("b", b));
        public Val Greater(object a, object b) => Unit<Greater>("comparison", typeof(bool), ("a", a), ("b", b));
        public Val And(Val a, Val b) => Unit<And>("result", typeof(bool), ("a", a), ("b", b));
        public Val Or(Val a, Val b) => Unit<Or>("result", typeof(bool), ("a", a), ("b", b));
        public Val Not(Val a) => Unit<Negate>("output", typeof(bool), ("input", a));
        public Val Same(object a, object b) => Unit<Equal>("equal", typeof(bool), ("a", a), ("b", b));

        /// <summary>condition ? a : b, evaluating only the chosen side.</summary>
        public Val Select(Val condition, object a, object b, Type type = null) =>
            Unit<SelectUnit>("selection", type ?? (a as Val)?.type ?? (b as Val)?.type ?? typeof(float), ("condition", condition), ("ifTrue", a), ("ifFalse", b));

        /// <summary>The smoothing factor Sacc uses everywhere: 1 - 0.5^(rate * dt), frame-rate independent.</summary>
        public Val Blend(object rate, Val dt) => 1f - Pow(0.5f, rate is Val r ? r * dt : dt * (float)rate);

        // ---- vectors -----------------------------------------------------------------------------------
        static readonly Type[] V3Ctor = { typeof(float), typeof(float), typeof(float) };

        public Val V3(object x, object y, object z)
        {
            var ctor = typeof(Vector3).GetConstructor(V3Ctor);
            var unit = Add(new InvokeMember(Use(new Member(typeof(Vector3), ctor))));
            Feed(unit, unit.inputParameters[0].key, x);
            Feed(unit, unit.inputParameters[1].key, y);
            Feed(unit, unit.inputParameters[2].key, z);
            return Out(unit, "result", typeof(Vector3));
        }

        public Val Scale(Val v, object s) => Unit<Vector3Multiply>("product", typeof(Vector3), ("a", v), ("b", V3(s, s, s)));
        public Val X(Val v) => Get(typeof(Vector3), "x", v);
        public Val Y(Val v) => Get(typeof(Vector3), "y", v);
        public Val Z(Val v) => Get(typeof(Vector3), "z", v);
        public Val Dot(Val a, Val b) => Unit<Vector3DotProduct>("dotProduct", typeof(float), ("a", a), ("b", b));
        public Val Magnitude(Val v) => Get(typeof(Vector3), "magnitude", v);
        public Val Distance(Val a, Val b) => Unit<Vector3Distance>("distance", typeof(float), ("a", a), ("b", b));
        public Val Lerp3(Val a, object b, Val t) => Unit<Vector3Lerp>("interpolation", typeof(Vector3), ("a", a), ("b", b), ("t", t));

        // ---- saving ------------------------------------------------------------------------------------
        /// <summary>Check every member against the SDK allow list, then write (or update in place) the graph asset.</summary>
        public ScriptGraphAsset Save(string path, System.Text.StringBuilder report)
        {
            // (AllowList.Refused throws when the SDK's list cannot be found: an unchecked graph is never saved)
            var refused = AllowList.Refused(usedMembers);
            report?.AppendLine($"{Path.GetFileNameWithoutExtension(path)}: {graph.units.Count} units, {graph.controlConnections.Count} control and " +
                              $"{graph.valueConnections.Count} value connections, {usedMembers.Count} distinct members, all on the allow list of {AllowList.Members().Count}");
            if (refused.Count > 0) throw new Exception("members not on the Creator SDK allow list: " + string.Join(", ", refused));
            int invalid = graph.elements.OfType<InvalidConnection>().Count();
            if (invalid > 0) throw new Exception($"{invalid} invalid connections in {path}");

            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var asset = AssetDatabase.LoadAssetAtPath<ScriptGraphAsset>(path);
            if (asset == null)
            {
                asset = ScriptableObject.CreateInstance<ScriptGraphAsset>();
                asset.graph = graph;
                AssetDatabase.CreateAsset(asset, path);
            }
            else
            {
                asset.graph = graph;
                EditorUtility.SetDirty(asset);
            }
            return asset;
        }
    }
}
