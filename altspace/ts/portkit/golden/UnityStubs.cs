// Stand-ins for the parts of plain Unity (MonoBehaviour with coroutines, transforms with parent chains, Vector3,
// Quaternion, Mathf, Color, AnimationCurve, Rigidbody, audio, uGUI, TextMesh Pro) that a non-Udon upstream's gameplay
// code calls, so that its .cs files compile UNCHANGED with dotnet 8 and can be driven to make golden vectors.
//
// For an upstream that is plain Unity. A VRChat / UdonSharp upstream uses UdonStubs.cs instead: the two both define
// UnityEngine and are never compiled together. MetaXRStubs.cs adds OVRInput, OVRCameraRig and OVRManager for a Meta XR
// upstream. Taken from the mini golf port (MinimalGolfVR), where it was written for this; a game extends it in its own
// golden/ folder rather than editing this copy. What these are: plain objects with the shape the code expects, float
// maths in Unity's formulas, coroutines stepped by the harness frame by frame (Golden.Runner.Frame), and every AddForce,
// vibration and sound written to Golden.Record. What they are not: physics, rendering, input devices or audio.
#pragma warning disable CS0108, CS0114, CS0169, CS0414, CS0649, CS0660, CS0661, CS8618, CS8625, CS8600, CS8602, CS8603, CS8604
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace Golden
{
    public static class Record
    {
        public static readonly List<string> Events = new List<string>();
        public static void Note(string what) { Events.Add(what); }
        public static void Clear() { Events.Clear(); }
    }

    /// <summary>Running coroutines of every behaviour, stepped one frame at a time.</summary>
    public static class Runner
    {
        public class Routine
        {
            public UnityEngine.MonoBehaviour owner;
            public IEnumerator body;
            public object waiting;
            public float resumeAt;
            public bool realtime;
            public bool done;
        }

        public static readonly List<Routine> Routines = new List<Routine>();

        public static void Wait(Routine r)
        {
            r.waiting = r.body.Current;
            if (r.waiting is UnityEngine.WaitForSeconds w) { r.resumeAt = UnityEngine.Time.time + w.seconds; r.realtime = false; }
            else if (r.waiting is UnityEngine.WaitForSecondsRealtime rt) { r.resumeAt = UnityEngine.Time.unscaledTime + rt.seconds; r.realtime = true; }
            else r.resumeAt = float.NegativeInfinity;
        }

        /// <summary>One frame: time moves by dt, then every coroutine whose wait is over runs to its next yield.</summary>
        public static void Frame(float dt)
        {
            UnityEngine.Time.deltaTime = dt;
            UnityEngine.Time.unscaledDeltaTime = dt;
            UnityEngine.Time.time += dt;
            UnityEngine.Time.unscaledTime += dt;
            foreach (var r in Routines.ToList())
            {
                if (r.done) continue;
                float now = r.realtime ? UnityEngine.Time.unscaledTime : UnityEngine.Time.time;
                if (now < r.resumeAt) continue;
                if (r.body.MoveNext()) Wait(r);
                else r.done = true;
            }
            Routines.RemoveAll(r => r.done);
        }

        public static void Reset()
        {
            Routines.Clear();
            UnityEngine.Time.time = 0;
            UnityEngine.Time.unscaledTime = 0;
        }
    }
}

namespace UnityEngine
{
    // ---- attributes ------------------------------------------------------------------------------------------------
    public class HeaderAttribute : Attribute { public HeaderAttribute(string text) { } }
    public class TooltipAttribute : Attribute { public TooltipAttribute(string text) { } }
    public class RangeAttribute : Attribute { public RangeAttribute(float min, float max) { } }
    public class MinAttribute : Attribute { public MinAttribute(float min) { } }
    public class SerializeField : Attribute { }
    public class DisallowMultipleComponent : Attribute { }
    public class ExecuteAlways : Attribute { }
    public class RequireComponent : Attribute { public RequireComponent(Type t) { } }

    // ---- objects ----------------------------------------------------------------------------------------------------
    public class Object
    {
        public string name = "";
        public bool destroyed;
        public override string ToString() => name;
        public static void Destroy(Object o) { if (o != null) o.destroyed = true; }
        public static void DestroyImmediate(Object o) { Destroy(o); }
        public static void DontDestroyOnLoad(Object o) { }
        public static T Instantiate<T>(T original, Vector3 position, Quaternion rotation, Transform parent) where T : Object => original;
        public static T FindFirstObjectByType<T>() where T : Object => null;
        public static T FindFirstObjectByType<T>(FindObjectsInactive inactive) where T : Object => null;
        public static T[] FindObjectsByType<T>(FindObjectsInactive inactive, FindObjectsSortMode sort) where T : Object => new T[0];
    }

    public enum FindObjectsInactive { Exclude, Include }
    public enum FindObjectsSortMode { None, InstanceID }
    public enum SendMessageOptions { RequireReceiver, DontRequireReceiver }
    public enum Space { World, Self }
    public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }

    public struct Scene { public bool IsValid() => true; }

    public class Component : Object
    {
        public GameObject gameObject;
        public Transform transform => gameObject.transform;
        public string tag = "";
        public T GetComponent<T>() where T : class => gameObject.GetComponent<T>();
        public T[] GetComponents<T>() where T : class => gameObject.components.OfType<T>().ToArray();
        public T GetComponentInChildren<T>(bool includeInactive = false) where T : class => gameObject.GetComponentInChildren<T>();
        public T GetComponentInParent<T>() where T : class
        {
            for (var t = transform; t != null; t = t.parent) { var c = t.gameObject.GetComponent<T>(); if (c != null) return c; }
            return null;
        }
        public void SendMessage(string method, SendMessageOptions options)
        {
            foreach (var c in gameObject.components)
            {
                var m = c.GetType().GetMethod(method, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (m != null && m.GetParameters().Length == 0) m.Invoke(c, null);
            }
        }
    }

    public class Behaviour : Component
    {
        public bool enabled = true;
        public bool isActiveAndEnabled => enabled && gameObject.activeInHierarchy;
    }

    public class MonoBehaviour : Behaviour
    {
        public Coroutine StartCoroutine(IEnumerator body)
        {
            var r = new Golden.Runner.Routine { owner = this, body = body };
            if (body.MoveNext()) { Golden.Runner.Wait(r); Golden.Runner.Routines.Add(r); }
            else r.done = true;
            return new Coroutine { routine = r };
        }
        public void StopCoroutine(Coroutine c) { if (c != null && c.routine != null) c.routine.done = true; }
        public void StopAllCoroutines() { foreach (var r in Golden.Runner.Routines) if (r.owner == this) r.done = true; }
    }

    public sealed class Coroutine { public Golden.Runner.Routine routine; }
    public class YieldInstruction { }
    public sealed class WaitForSeconds : YieldInstruction { public float seconds; public WaitForSeconds(float s) { seconds = s; } }
    public sealed class WaitForSecondsRealtime : YieldInstruction { public float seconds; public WaitForSecondsRealtime(float s) { seconds = s; } }

    public sealed class GameObject : Object
    {
        public readonly Transform transform;
        public readonly List<Component> components = new List<Component>();
        bool active = true;
        public int layer;
        public Scene scene => new Scene();

        public GameObject(string name = "GameObject")
        {
            this.name = name;
            transform = new Transform { gameObject = this, name = name };
            components.Add(transform);
        }

        public bool activeSelf => active;
        public bool activeInHierarchy => active && (transform.parent == null || transform.parent.gameObject.activeInHierarchy);
        public void SetActive(bool value) { active = value; }

        public T AddComponent<T>() where T : Component, new()
        {
            var c = new T { gameObject = this, name = name };
            components.Add(c);
            return c;
        }
        public T GetComponent<T>() where T : class => components.OfType<T>().FirstOrDefault();
        public T GetComponentInChildren<T>() where T : class
        {
            var own = GetComponent<T>();
            if (own != null) return own;
            foreach (var child in transform.children) { var c = child.gameObject.GetComponentInChildren<T>(); if (c != null) return c; }
            return null;
        }
        public static GameObject Find(string name) => null;
        public static GameObject CreatePrimitive(PrimitiveType type)
        {
            var go = new GameObject(type.ToString());
            go.AddComponent<MeshFilter>().sharedMesh = new Mesh();
            go.AddComponent<MeshRenderer>();
            go.AddComponent<SphereCollider>();
            return go;
        }
    }

    public class Transform : Component, IEnumerable
    {
        internal readonly List<Transform> children = new List<Transform>();
        Transform parentValue;
        public Vector3 localPosition = Vector3.zero;
        public Quaternion localRotation = Quaternion.identity;
        public Vector3 localScale = Vector3.one;

        public Transform parent
        {
            get => parentValue;
            set => SetParent(value, true);
        }

        public void SetParent(Transform p, bool worldPositionStays)
        {
            Vector3 pos = position; Quaternion rot = rotation;
            if (parentValue != null) parentValue.children.Remove(this);
            parentValue = p;
            if (p != null) p.children.Add(this);
            if (worldPositionStays) { position = pos; rotation = rot; }
        }

        public int childCount => children.Count;
        public Transform GetChild(int i) => children[i];
        public IEnumerator GetEnumerator() => children.ToList().GetEnumerator();

        public Transform Find(string path)
        {
            Transform t = this;
            foreach (var part in path.Split('/'))
            {
                t = t.children.FirstOrDefault(c => c.name == part);
                if (t == null) return null;
            }
            return t;
        }

        public Vector3 lossyScale
        {
            get { var s = localScale; for (var p = parentValue; p != null; p = p.parentValue) s = Vector3.Scale(s, p.localScale); return s; }
        }

        public Quaternion rotation
        {
            get => parentValue == null ? localRotation : parentValue.rotation * localRotation;
            set => localRotation = parentValue == null ? value : Quaternion.Inverse(parentValue.rotation) * value;
        }

        public Vector3 position
        {
            get => parentValue == null ? localPosition : parentValue.TransformPoint(localPosition);
            set => localPosition = parentValue == null ? value : parentValue.InverseTransformPoint(value);
        }

        public Vector3 TransformPoint(Vector3 p)
        {
            var v = localRotation * Vector3.Scale(p, localScale) + localPosition;
            return parentValue == null ? v : parentValue.TransformPoint(v);
        }

        public Vector3 InverseTransformPoint(Vector3 world)
        {
            var p = parentValue == null ? world : parentValue.InverseTransformPoint(world);
            var r = Quaternion.Inverse(localRotation) * (p - localPosition);
            return new Vector3(r.x / localScale.x, r.y / localScale.y, r.z / localScale.z);
        }

        public void SetPositionAndRotation(Vector3 p, Quaternion r) { position = p; rotation = r; }
        public void Rotate(Vector3 axis, float angle, Space space)
        {
            if (space == Space.World) rotation = Quaternion.AngleAxis(angle, axis) * rotation;
            else localRotation = localRotation * Quaternion.AngleAxis(angle, axis);
        }
        public void Rotate(float x, float y, float z, Space space)
        {
            if (space == Space.Self) localRotation = localRotation * Quaternion.Euler(x, y, z);
            else rotation = Quaternion.Euler(x, y, z) * rotation;
        }
    }

    public class RectTransform : Transform { public Vector2 sizeDelta; }

    // ---- maths ------------------------------------------------------------------------------------------------------
    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public float sqrMagnitude => x * x + y * y;
        public float magnitude => (float)Math.Sqrt(x * x + y * y);
        public override string ToString() => $"({x:F2}, {y:F2})";
    }

    public struct Vector3
    {
        public const float kEpsilon = 0.00001f;
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static Vector3 one => new Vector3(1, 1, 1);
        public static Vector3 up => new Vector3(0, 1, 0);
        public static Vector3 down => new Vector3(0, -1, 0);
        public static Vector3 left => new Vector3(-1, 0, 0);
        public static Vector3 right => new Vector3(1, 0, 0);
        public static Vector3 forward => new Vector3(0, 0, 1);
        public static Vector3 back => new Vector3(0, 0, -1);
        public float sqrMagnitude => x * x + y * y + z * z;
        public float magnitude => (float)Math.Sqrt(x * x + y * y + z * z);
        public Vector3 normalized { get { float m = magnitude; return m > kEpsilon ? this / m : zero; } }
        public void Normalize() { this = normalized; }
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator -(Vector3 a) => new Vector3(-a.x, -a.y, -a.z);
        public static Vector3 operator *(Vector3 a, float k) => new Vector3(a.x * k, a.y * k, a.z * k);
        public static Vector3 operator *(float k, Vector3 a) => new Vector3(a.x * k, a.y * k, a.z * k);
        public static Vector3 operator /(Vector3 a, float k) => new Vector3(a.x / k, a.y / k, a.z / k);
        public static implicit operator Vector4(Vector3 v) => new Vector4(v.x, v.y, v.z, 0);
        public static Vector3 Scale(Vector3 a, Vector3 b) => new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
        public static float Distance(Vector3 a, Vector3 b) => (a - b).magnitude;
        public static Vector3 Lerp(Vector3 a, Vector3 b, float t) { t = Mathf.Clamp01(t); return new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
        public static Vector3 LerpUnclamped(Vector3 a, Vector3 b, float t) => new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        public override string ToString() => $"({x:F2}, {y:F2}, {z:F2})";
    }

    public struct Vector4
    {
        public float x, y, z, w;
        public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
    }

    public struct Quaternion
    {
        public float x, y, z, w;
        public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public static Quaternion identity => new Quaternion(0, 0, 0, 1);
        public static Quaternion operator *(Quaternion a, Quaternion b) => new Quaternion(
            a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y + a.y * b.w + a.z * b.x - a.x * b.z,
            a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);
        public static Vector3 operator *(Quaternion q, Vector3 v)
        {
            float x2 = q.x * 2, y2 = q.y * 2, z2 = q.z * 2;
            float xx = q.x * x2, yy = q.y * y2, zz = q.z * z2, xy = q.x * y2, xz = q.x * z2, yz = q.y * z2;
            float wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
            return new Vector3(
                (1 - (yy + zz)) * v.x + (xy - wz) * v.y + (xz + wy) * v.z,
                (xy + wz) * v.x + (1 - (xx + zz)) * v.y + (yz - wx) * v.z,
                (xz - wy) * v.x + (yz + wx) * v.y + (1 - (xx + yy)) * v.z);
        }
        public static Quaternion Inverse(Quaternion q) { float n = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w; return new Quaternion(-q.x / n, -q.y / n, -q.z / n, q.w / n); }
        public static Quaternion AngleAxis(float degrees, Vector3 axis)
        {
            var a = axis.normalized; double h = degrees * Math.PI / 360.0; float s = (float)Math.Sin(h);
            return new Quaternion(a.x * s, a.y * s, a.z * s, (float)Math.Cos(h));
        }
        /// <summary>Unity order: Z, then X, then Y.</summary>
        public static Quaternion Euler(float x, float y, float z) => AngleAxis(y, Vector3.up) * AngleAxis(x, Vector3.right) * AngleAxis(z, Vector3.forward);
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color Lerp(Color x, Color y, float t) { t = Mathf.Clamp01(t); return new Color(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t, x.a + (y.a - x.a) * t); }
        public static Color green => new Color(0, 1, 0, 1);
        public static Color yellow => new Color(1, 0.92156863f, 0.015686275f, 1);
    }

    public struct Color32
    {
        public byte r, g, b, a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static implicit operator Color(Color32 c) => new Color(c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
    }

    public static class Mathf
    {
        public static float Abs(float v) => Math.Abs(v);
        public static float Min(float a, float b) => a < b ? a : b;
        public static float Max(float a, float b) => a > b ? a : b;
        public static int Min(int a, int b) => a < b ? a : b;
        public static int Max(int a, int b) => a > b ? a : b;
        public static float Clamp(float v, float lo, float hi) => v < lo ? lo : v > hi ? hi : v;
        public static int Clamp(int v, int lo, int hi) => v < lo ? lo : v > hi ? hi : v;
        public static float Clamp01(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static float InverseLerp(float a, float b, float v) => a != b ? Clamp01((v - a) / (b - a)) : 0f;
        public static float SmoothStep(float from, float to, float t) { t = Clamp01(t); t = -2f * t * t * t + 3f * t * t; return to * t + from * (1f - t); }
        public static int RoundToInt(float f) => (int)Math.Round(f);
    }

    public class AnimationCurve
    {
        float t0, v0, t1, v1;
        /// <summary>EaseInOut: two keys with zero tangents; Unity's Hermite between them is v0 + (v1 - v0) * (3s^2 - 2s^3).</summary>
        public static AnimationCurve EaseInOut(float timeStart, float valueStart, float timeEnd, float valueEnd) => new AnimationCurve { t0 = timeStart, v0 = valueStart, t1 = timeEnd, v1 = valueEnd };
        public float Evaluate(float t)
        {
            if (t <= t0) return v0;
            if (t >= t1) return v1;
            float s = (t - t0) / (t1 - t0);
            return v0 + (v1 - v0) * (s * s * (3f - 2f * s));
        }
    }

    public static class Time
    {
        public static float time, deltaTime, unscaledTime, unscaledDeltaTime;
        public static float fixedDeltaTime = 0.02f;
    }

    /// <summary>
    /// UnityEngine.Random: Xorshift128 seeded as Unity seeds it (as in UdonStubs.cs; outputs checked against Unity 6000.3.21f1).
    /// Every int draw is also kept in Draws, so a harness can replay it in TypeScript. (The mini golf copy used its own LCG.)
    /// </summary>
    public static class Random
    {
        static uint x, y, z, w;
        public static readonly List<int[]> Draws = new List<int[]>();
        static Random() { InitState(0); }
        public static void InitState(int seed)
        {
            x = (uint)seed;
            y = x * 1812433253u + 1u;
            z = y * 1812433253u + 1u;
            w = z * 1812433253u + 1u;
        }
        /// <summary>InitState and a cleared Draws list.</summary>
        public static void Seed(uint seed) { InitState((int)seed); Draws.Clear(); }
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
            int result = min == max ? min : min < max ? min + (int)(Next() % (uint)(max - min)) : min - (int)(Next() % (uint)(min - max));
            Draws.Add(new[] { min, max, result });
            return result;
        }
    }

    public static class Debug
    {
        public static void Log(object o) { }
        public static void LogWarning(object o) { }
        public static void LogError(object o) { }
    }

    public static class Application { public static int targetFrameRate; public static bool isPlaying = true; }
    public static class QualitySettings { public static int vSyncCount; }
    public static class Physics { public static void SyncTransforms() { } }

    // ---- components -------------------------------------------------------------------------------------------------
    public enum RigidbodyInterpolation { None, Interpolate, Extrapolate }
    public enum ForceMode { Force, Acceleration, Impulse, VelocityChange }

    public class Rigidbody : Component
    {
        public Vector3 linearVelocity, angularVelocity;
        public bool isKinematic;
        public RigidbodyInterpolation interpolation;
        public Vector3 position { get => transform.position; set => transform.position = value; }
        public Quaternion rotation { get => transform.rotation; set => transform.rotation = value; }
        public Vector3 worldCenterOfMass => transform.position;
        public void AddForce(Vector3 v, ForceMode mode) { Golden.Record.Note($"AddForce {mode} {v.x:R} {v.y:R} {v.z:R}"); }
    }

    public class Collider : Component { public bool isTrigger; public Rigidbody attachedRigidbody; }
    public class SphereCollider : Collider { public float radius; }
    public class Collision { public Vector3 relativeVelocity; public Collider collider; }
    public class Camera : Behaviour { }
    public class Font : Object { }
    public class Mesh : Object { }
    public class MeshFilter : Component { public Mesh sharedMesh; }
    public class Texture : Object { }
    public class Shader : Object { public static Shader Find(string n) => new Shader { name = n }; }
    public class Material : Object
    {
        public Material(Shader s) { }
        public int renderQueue;
        public bool HasProperty(string p) => false;
        public void SetColor(string p, Color c) { }
        public void SetTexture(string p, Texture t) { }
        public void SetFloat(string p, float v) { }
        public void SetInt(string p, int v) { }
        public void EnableKeyword(string k) { }
        public void DisableKeyword(string k) { }
    }
    public class Renderer : Component { public Material sharedMaterial; }
    public class MeshRenderer : Renderer { }
    public static class Gizmos
    {
        public static Color color;
        public static void DrawWireSphere(Vector3 c, float r) { }
        public static void DrawSphere(Vector3 c, float r) { }
    }

    public class LineRenderer : Renderer
    {
        public bool enabled, useWorldSpace;
        public int positionCount;
        public float startWidth, endWidth;
        public Color startColor, endColor;
        public readonly Vector3[] positions = new Vector3[2];
        public void SetPosition(int i, Vector3 p) { positions[i] = p; }
    }

    public class AudioClip : Object { }
    public class AudioListener : Behaviour { }
    public class AudioSource : Behaviour
    {
        public AudioClip clip;
        public bool isPlaying, playOnAwake, loop;
        public float spatialBlend, volume;
        public int priority;
        public void Play() { isPlaying = true; }
        public void PlayOneShot(AudioClip c) { Golden.Record.Note("PlayOneShot " + c.name); }
    }
    public static class AudioSettings { public static double dspTime; }

    public class Canvas : Behaviour { }
    public class CanvasGroup : Behaviour { public float alpha = 1; }
}

namespace UnityEngine.Rendering
{
    public enum BlendMode { Zero, One, DstColor, SrcColor, OneMinusDstColor, SrcAlpha, OneMinusSrcColor, DstAlpha, OneMinusDstAlpha, SrcAlphaSaturate, OneMinusSrcAlpha }
    public enum RenderQueue { Background = 1000, Geometry = 2000, AlphaTest = 2450, Transparent = 3000, Overlay = 4000 }
}

namespace UnityEngine.UI
{
    public class Graphic : Behaviour { public Color color; public RectTransform rectTransform = new RectTransform(); }
    public class Image : Graphic { }
    public class Button : Behaviour
    {
        public class ButtonClickedEvent
        {
            readonly List<Action> listeners = new List<Action>();
            public int GetPersistentEventCount() => 0;
            public void AddListener(Action a) { listeners.Add(a); }
            public void Invoke() { foreach (var a in listeners) a(); }
        }
        public ButtonClickedEvent onClick = new ButtonClickedEvent();
    }
}

namespace TMPro
{
    public class TMP_Text : UnityEngine.UI.Graphic { public string text = ""; }
    public class TextMeshProUGUI : TMP_Text { }
}
