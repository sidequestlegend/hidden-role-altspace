// Stand-ins for the parts of Unity, UdonSharp and the VRChat SDK that upstream gameplay code calls, so that the upstream
// C# compiles unchanged with dotnet (never in Unity) and its real methods can be driven to make golden vectors.
//
// What it is: plain objects with the shape the code expects. GameObjects with ordered children and an active flag;
// components found by type; VRCObjectPool handing out the first inactive object in array order; Networking with one
// local player who owns everything; every network request, event and log line written to Golden.Record so a harness
// can put them in its vectors. What it is not: physics, rendering, timing, or any network. A game adds what its code
// needs beyond this in its own harness (portkit README, "Golden vectors").
//
// Shadowing: a type the harness defines in the upstream's own namespace wins over a `using`'d one (C# looks in the
// enclosing namespace first). That is how a harness swaps in, say, the .NET Framework rounding of TimeSpan.FromSeconds
// that Unity's Mono has and modern .NET has not.
#pragma warning disable CS0108, CS0114, CS0169, CS0414, CS0649, CS0660, CS0661, CS8618, CS8625, CS8600, CS8602, CS8603, CS8604
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

namespace Golden
{
    /// <summary>What the upstream code asked the platform for, in order.</summary>
    public static class Record
    {
        public static readonly List<string> Events = new List<string>();
        public static int Serializations;
        public static bool Quiet = true;
        public static void Note(string what) { Events.Add(what); }
        public static void Clear() { Events.Clear(); Serializations = 0; }
    }
}

namespace UnityEngine
{
    public class Object
    {
        public string name = "";
        public override string ToString() => name;
        public static void Destroy(Object o) { }
    }

    public class Component : Object
    {
        public GameObject gameObject;
        public Transform transform => gameObject.transform;
        public T GetComponent<T>() where T : class => gameObject.GetComponent<T>();
        public Component GetComponent(Type type) => gameObject.GetComponent(type);
        public string tag = "";
    }

    public class Behaviour : Component { public bool enabled = true; }
    public class MonoBehaviour : Behaviour { }

    public sealed class GameObject : Object
    {
        public readonly Transform transform;
        public readonly List<Component> components = new List<Component>();
        bool active = true;
        public int layer;

        public GameObject(string name = "GameObject")
        {
            this.name = name;
            transform = new Transform { gameObject = this, name = name };
            components.Add(transform);
        }

        public bool activeSelf => active;
        public bool activeInHierarchy => active && (transform.parent == null || transform.parent.gameObject.activeInHierarchy);

        public void SetActive(bool value)
        {
            bool was = activeInHierarchy;
            active = value;
            if (!was && activeInHierarchy) Enable(this);
        }

        /// <summary>As Unity: everything that has just become active in the hierarchy gets OnEnable (Golden.Hooks.Enabled).</summary>
        static void Enable(GameObject go)
        {
            if (!go.activeInHierarchy) return;
            foreach (var c in go.components.ToList()) Golden.Hooks.Enabled?.Invoke(c);
            foreach (Transform child in go.transform) Enable(child.gameObject);
        }

        public T AddComponent<T>() where T : Component, new()
        {
            var c = new T { gameObject = this, name = name };
            components.Add(c);
            return c;
        }

        public T GetComponent<T>() where T : class => components.OfType<T>().FirstOrDefault();
        public Component GetComponent(Type type) => components.FirstOrDefault(c => type.IsInstanceOfType(c));
    }

    public class Transform : Component, IEnumerable
    {
        public Transform parent;
        readonly List<Transform> children = new List<Transform>();
        public Vector3 localPosition = Vector3.zero;
        public Quaternion localRotation = Quaternion.identity;
        public Vector3 localScale = Vector3.one;

        /// <summary>Like Unity: the child goes to the end of its new parent's children.</summary>
        public void SetParent(Transform p) { SetParent(p, true); }
        public void SetParent(Transform p, bool worldPositionStays)
        {
            parent?.children.Remove(this);
            parent = p;
            p?.children.Add(this);
        }
        public int childCount => children.Count;
        public Transform GetChild(int i) => children[i];
        public IEnumerator GetEnumerator() => children.ToList().GetEnumerator();

        public Vector3 localEulerAngles { get => localRotation.eulerAngles; set => localRotation = Quaternion.Euler(value.x, value.y, value.z); }
        /// <summary>No hierarchy maths: a world value is the local one (enough for code that reads back what it set).</summary>
        public Vector3 position { get => localPosition; set => localPosition = value; }
        public Quaternion rotation { get => localRotation; set => localRotation = value; }
        public Vector3 InverseTransformPoint(Vector3 p) => p;
        public void Rotate(Vector3 axis, float degrees) { }
    }

    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new Vector2(0, 0);
        public static Vector2 one => new Vector2(1, 1);
        public static Vector2 left => new Vector2(-1, 0);
        public static Vector2 right => new Vector2(1, 0);
        public static Vector2 up => new Vector2(0, 1);
        public static Vector2 down => new Vector2(0, -1);
        public float magnitude => (float)Math.Sqrt(x * x + y * y);
        public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.x + b.x, a.y + b.y);
        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
        public static Vector2 operator *(Vector2 a, float k) => new Vector2(a.x * k, a.y * k);
        public static Vector2 operator *(float k, Vector2 a) => new Vector2(a.x * k, a.y * k);
        // Unity compares within 1e-5; the code here only ever holds whole numbers
        public static bool operator ==(Vector2 a, Vector2 b) { float dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < 9.99999944E-11f; }
        public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);
        public override bool Equals(object o) => o is Vector2 v && this == v;
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static Vector3 one => new Vector3(1, 1, 1);
        public static Vector3 up => new Vector3(0, 1, 0);
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator *(Vector3 a, float k) => new Vector3(a.x * k, a.y * k, a.z * k);
        public static Vector3 operator *(float k, Vector3 a) => new Vector3(a.x * k, a.y * k, a.z * k);
        public static Vector3 operator /(Vector3 a, float k) => new Vector3(a.x / k, a.y / k, a.z / k);
        public static Vector3 operator -(Vector3 a) => new Vector3(-a.x, -a.y, -a.z);
        /// <summary>Unity's: equal when the difference's squared length is below 1e-10 (as 9.99999944E-11f).</summary>
        public static bool operator ==(Vector3 a, Vector3 b) { float dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz < 9.99999944E-11f; }
        public static bool operator !=(Vector3 a, Vector3 b) => !(a == b);
        public override bool Equals(object o) => o is Vector3 v && x.Equals(v.x) && y.Equals(v.y) && z.Equals(v.z);
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2) ^ (z.GetHashCode() >> 2);
        public float sqrMagnitude => x * x + y * y + z * z;
        public float magnitude => (float)Math.Sqrt(x * x + y * y + z * z);
        public Vector3 normalized { get { float m = magnitude; return m > 1E-05f ? this / m : zero; } }
        public static float Distance(Vector3 a, Vector3 b) => (a - b).magnitude;
        public static float Dot(Vector3 a, Vector3 b) => a.x * b.x + a.y * b.y + a.z * b.z;
        public override string ToString() => $"({x:F2}, {y:F2}, {z:F2})";
    }

    public struct Quaternion
    {
        public float x, y, z, w;
        public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public static Quaternion identity => new Quaternion(0, 0, 0, 1);
        /// <summary>Kept as its Euler angles (in x, y, z; w = 2 marks "Euler"): enough to read back what was set.</summary>
        public static Quaternion Euler(float x, float y, float z) => new Quaternion(x, y, z, 2);
        public Vector3 eulerAngles => w == 2 ? new Vector3(x, y, z) : Vector3.zero;
        public static Quaternion operator *(Quaternion a, Quaternion b) =>
            a.w == 1 && a.x == 0 && a.y == 0 && a.z == 0 ? b : b.w == 1 && b.x == 0 && b.y == 0 && b.z == 0 ? a : Euler(a.eulerAngles.x + b.eulerAngles.x, a.eulerAngles.y + b.eulerAngles.y, a.eulerAngles.z + b.eulerAngles.z);
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1) { this.r = r; this.g = g; this.b = b; this.a = a; }
    }

    public static class Mathf
    {
        public static float Abs(float v) => Math.Abs(v);
        public static int Abs(int v) => Math.Abs(v);
        public static int Min(int a, int b) => Math.Min(a, b);
        public static int Max(int a, int b) => Math.Max(a, b);
        public static float Min(float a, float b) => Math.Min(a, b);
        public static float Max(float a, float b) => Math.Max(a, b);
        public static int Clamp(int v, int lo, int hi) => v < lo ? lo : v > hi ? hi : v;
        public static float Clamp(float v, float lo, float hi) => v < lo ? lo : v > hi ? hi : v;
        /// <summary>Unity's: Math.Round, halves to the even neighbour.</summary>
        public static int RoundToInt(float v) => (int)Math.Round(v);
        public static float Round(float v) => (float)Math.Round(v);
        public static int FloorToInt(float v) => (int)Math.Floor(v);
        public static int CeilToInt(float v) => (int)Math.Ceiling(v);
        public static float Floor(float v) => (float)Math.Floor(v);
        public static float Sqrt(float v) => (float)Math.Sqrt(v);
        public static float Pow(float b, float e) => (float)Math.Pow(b, e);
        public static float Sin(float v) => (float)Math.Sin(v);
        public static float Cos(float v) => (float)Math.Cos(v);
        public static float Clamp01(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public const float PI = (float)Math.PI;
        public const float Deg2Rad = (float)(Math.PI / 180);
        public const float Rad2Deg = (float)(180 / Math.PI);
    }

    /// <summary>
    /// UnityEngine.Random: Xorshift128 seeded as Unity seeds it. Its outputs were checked against Unity 6000.3.21f1 for five
    /// seeds (portkit ts/test/values.test.ts holds them; ts/src/values.ts UnityRandom is the TypeScript twin).
    /// </summary>
    public static class Random
    {
        static uint x, y, z, w;
        static Random() { InitState(0); }
        public static void InitState(int seed)
        {
            x = (uint)seed;
            y = x * 1812433253u + 1u;
            z = y * 1812433253u + 1u;
            w = z * 1812433253u + 1u;
        }
        static uint Next()
        {
            uint t = x ^ (x << 11);
            x = y; y = z; z = w;
            w = w ^ (w >> 19) ^ t ^ (t >> 8);
            return w;
        }
        public static float value => (Next() & 0x7FFFFF) / 8388607f;
        public static float Range(float min, float max) { float t = value; return min * t + max * (1f - t); }
        public static int Range(int min, int max)
        {
            if (min == max) return min;
            if (min < max) return min + (int)(Next() % (uint)(max - min));
            return min - (int)(Next() % (uint)(min - max));
        }
    }

    public static class Debug
    {
        public static void Log(object m) { if (!Golden.Record.Quiet) Console.Error.WriteLine(m); }
        public static void Log(object m, Object context) => Log(m);
        public static void LogWarning(object m) => Log(m);
        public static void LogError(object m) => Log(m);
    }

    public static class Time
    {
        public static float time;
        public static float deltaTime = 0.02f;
    }

    public class Material : Object
    {
        public readonly Dictionary<string, float[]> floatArrays = new Dictionary<string, float[]>();
        public void SetFloatArray(string name, float[] values) { floatArrays[name] = (float[])values.Clone(); }
    }

    public class Renderer : Component { public Material material = new Material(); }
    public class MeshRenderer : Renderer { }
    public class AudioClip : Object { }

    public class AudioSource : Component
    {
        public void PlayOneShot(AudioClip clip) { Golden.Record.Note("sound " + gameObject.name + " " + (clip?.name ?? "null")); }
    }

    public class HideInInspector : Attribute { }
    public class TooltipAttribute : Attribute { public TooltipAttribute(string text) { } }
    public class HeaderAttribute : Attribute { public HeaderAttribute(string text) { } }
    public class SerializeField : Attribute { }
}

namespace UnityEngine.UI
{
    public class Text : Component { public string text = ""; }
    public class Button : Component { public bool interactable = true; }
    public class Image : Component { }
}

namespace JetBrains.Annotations
{
    public class PublicAPIAttribute : Attribute { }
}

namespace VRC.SDKBase
{
    public class VRCPlayerApi
    {
        public string displayName;
        public int playerId;
        public bool isLocal;
        public bool IsValid() => true;
    }

    public static class Networking
    {
        public static VRCPlayerApi LocalPlayer = new VRCPlayerApi { displayName = "local", playerId = 1, isLocal = true };
        public static bool IsMaster = true;
        static readonly Dictionary<UnityEngine.GameObject, VRCPlayerApi> owners = new Dictionary<UnityEngine.GameObject, VRCPlayerApi>();
        public static void SetOwner(VRCPlayerApi player, UnityEngine.GameObject obj) { owners[obj] = player; }
        public static VRCPlayerApi GetOwner(UnityEngine.GameObject obj) => owners.TryGetValue(obj, out var p) ? p : LocalPlayer;
        public static bool IsOwner(UnityEngine.GameObject obj) => GetOwner(obj) == LocalPlayer;
        public static bool IsOwner(VRCPlayerApi player, UnityEngine.GameObject obj) => GetOwner(obj) == player;
        public static void Reset() => owners.Clear();
    }

    public class VRC_Pickup : UnityEngine.Component
    {
        public bool pickupable = true;
        public bool IsHeld;
        public void Drop() { IsHeld = false; Golden.Record.Note("drop " + gameObject.name); }
    }

    public class VRC_Interactable : UnityEngine.MonoBehaviour { }
}

namespace VRC.Udon
{
    public class UdonBehaviour : UnityEngine.MonoBehaviour
    {
        public bool DisableInteractive { get; set; }
        public virtual void SendCustomEvent(string name)
        {
            var method = GetType().GetMethod(name, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
            if (method == null) Golden.Record.Note($"missing method {GetType().Name}.{name}");
            else method.Invoke(this, null);
        }
    }
}

namespace VRC.Udon.Common
{
    public struct SerializationResult { public bool success; public int byteCount; }
}

namespace VRC.Udon.Common.Interfaces
{
    public enum NetworkEventTarget { All, Owner }
}

namespace VRC.SDK3.Components
{
    public class VRCObjectPool : UnityEngine.Component
    {
        public UnityEngine.GameObject[] Pool = new UnityEngine.GameObject[0];

        /// <summary>The first object that is off, in array order (VRChat's documented behaviour).</summary>
        public UnityEngine.GameObject TryToSpawn()
        {
            foreach (var o in Pool)
                if (!o.activeSelf) { o.SetActive(true); return o; }
            return null;
        }

        public void Return(UnityEngine.GameObject o) { o.SetActive(false); }
    }
}

namespace UdonSharp
{
    public enum BehaviourSyncMode { Any, None, Continuous, Manual, NoVariableSync }
    public enum UdonSyncMode { NotSynced, None, Linear, Smooth }

    public class UdonBehaviourSyncModeAttribute : Attribute { public UdonBehaviourSyncModeAttribute(BehaviourSyncMode mode) { } }
    public class UdonSyncedAttribute : Attribute { public UdonSyncedAttribute(UdonSyncMode mode = UdonSyncMode.None) { } }
    public class FieldChangeCallbackAttribute : Attribute { public FieldChangeCallbackAttribute(string property) { } }

    public class UdonSharpBehaviour : VRC.Udon.UdonBehaviour
    {
        public virtual void OnDeserialization() { }
        public virtual void OnPreSerialization() { }
        public virtual void OnPickup() { }
        public virtual void OnDrop() { }
        public virtual void Interact() { }
        public virtual void OnPlayerJoined(VRC.SDKBase.VRCPlayerApi player) { }
        public virtual void OnPlayerLeft(VRC.SDKBase.VRCPlayerApi player) { }

        public void RequestSerialization() { Golden.Record.Serializations++; }

        public void SendCustomNetworkEvent(VRC.Udon.Common.Interfaces.NetworkEventTarget target, string name)
        {
            Golden.Record.Note($"event {target} {gameObject.name}.{name}");
            if (target == VRC.Udon.Common.Interfaces.NetworkEventTarget.All) SendCustomEvent(name);
        }

        public void SendCustomEventDelayedFrames(string name, int frames, int timing = 0) { Golden.Record.Note($"delayed {gameObject.name}.{name} {frames} frames"); }
        public void SendCustomEventDelayedSeconds(string name, float seconds, int timing = 0) { Golden.Record.Note($"delayed {gameObject.name}.{name} {seconds} s"); }
    }
}

namespace Golden
{
    /// <summary>What the stand-ins cannot know by themselves: what OnEnable means for a component (set by the harness).</summary>
    public static class Hooks
    {
        public static Action<UnityEngine.Component> Enabled;
    }
}
