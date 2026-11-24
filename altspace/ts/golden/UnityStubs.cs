// The parts of UnityEngine the upstream rule methods use, for compiling them with dotnet outside Unity (golden vectors).
// Float arithmetic is C# float, as in Unity. Random is a seeded mulberry32, the same generator test/golden.test.ts uses,
// so random-driven vectors line up call for call.
using System;

namespace UnityEngine
{
    public struct Vector2
    {
        public float x;
        public float y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new Vector2(0f, 0f);
        public static Vector2 up => new Vector2(0f, 1f);
        public static Vector2 down => new Vector2(0f, -1f);
        public static Vector2 left => new Vector2(-1f, 0f);
        public static Vector2 right => new Vector2(1f, 0f);
        public float sqrMagnitude => x * x + y * y;
        public float magnitude => (float)Math.Sqrt(x * x + y * y);
        public void Normalize()
        {
            var m = magnitude;
            if (m > 1E-05f) { x /= m; y /= m; } else { x = 0f; y = 0f; }
        }
        public static float Distance(Vector2 a, Vector2 b)
        {
            float dx = a.x - b.x;
            float dy = a.y - b.y;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }
        public static Vector2 Lerp(Vector2 a, Vector2 b, float t)
        {
            t = Mathf.Clamp01(t);
            return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        }
        public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.x + b.x, a.y + b.y);
        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
        public static Vector2 operator -(Vector2 a) => new Vector2(-a.x, -a.y);
        public static Vector2 operator *(Vector2 a, float d) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator *(float d, Vector2 a) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator /(Vector2 a, float d) => new Vector2(a.x / d, a.y / d);
        public static bool operator ==(Vector2 a, Vector2 b)
        {
            float dx = a.x - b.x;
            float dy = a.y - b.y;
            return dx * dx + dy * dy < 9.99999944E-11f;
        }
        public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);
        public override bool Equals(object other) => other is Vector2 v && this == v;
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
    }

    public struct Rect
    {
        float m_XMin, m_YMin, m_Width, m_Height;
        public Rect(float x, float y, float width, float height) { m_XMin = x; m_YMin = y; m_Width = width; m_Height = height; }
        public float x => m_XMin;
        public float y => m_YMin;
        public float width => m_Width;
        public float height => m_Height;
        public float xMin => m_XMin;
        public float yMin => m_YMin;
        public float xMax => m_Width + m_XMin;
        public float yMax => m_Height + m_YMin;
        public bool Contains(Vector2 point) => point.x >= xMin && point.x < xMax && point.y >= yMin && point.y < yMax;
    }

    public static class Mathf
    {
        public static float Min(float a, float b) => a < b ? a : b;
        public static int Min(int a, int b) => a < b ? a : b;
        public static float Max(float a, float b) => a > b ? a : b;
        public static int Max(int a, int b) => a > b ? a : b;
        public static float Abs(float f) => Math.Abs(f);
        public static int Abs(int v) => Math.Abs(v);
        public static float Clamp(float value, float min, float max) { if (value < min) value = min; else if (value > max) value = max; return value; }
        public static int Clamp(int value, int min, int max) { if (value < min) value = min; else if (value > max) value = max; return value; }
        public static float Clamp01(float value) => value < 0f ? 0f : value > 1f ? 1f : value;
        public static int CeilToInt(float f) => (int)Math.Ceiling(f);
        public static float Floor(float f) => (float)Math.Floor(f);
        public static float Repeat(float t, float length) => Clamp(t - Floor(t / length) * length, 0f, length);
    }

    public static class Random
    {
        static uint a = 1;
        public static void InitState(uint seed) { a = seed; }
        static double Next()
        {
            a += 0x6D2B79F5u;
            uint t = a;
            t = (t ^ (t >> 15)) * (t | 1u);
            t ^= t + (t ^ (t >> 7)) * (t | 61u);
            return (t ^ (t >> 14)) / 4294967296.0;
        }
        public static float value => (float)Next();
        public static int Range(int min, int max) => max > min ? min + (int)Math.Floor(Next() * (max - min)) : min;
        public static float Range(float min, float max) => (float)(min + ((double)max - min) * Next());
    }

    public static class Time
    {
        public static float time;
        public static float deltaTime = 0.05f;
    }

    public static class Debug
    {
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
    }
}
