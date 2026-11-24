// Everything the kit draws with and plays, made here from formulas: textures (painted pixel by pixel), materials (URP
// Unlit, so the station looks the same under any host world's lighting and costs no light per object on a Quest),
// small meshes (quads, boxes, a sphere, rings) and the two tones. No file is downloaded or copied from anywhere;
// the only outside asset is TextMesh Pro's LiberationSans SDF (SIL Open Font License 1.1), which the SDK setup imports.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace HiddenRole
{
    public static class KitArt
    {
        public const string Folder = "Assets/Kit/Art";
        const string MeshAsset = Folder + "/meshes.asset";

        // ------------------------------------------------------------------ colours of the station

        public static readonly Color Deep = Hex(0x0B1A24);
        public static readonly Color Hull = Hex(0x5E7884);
        public static readonly Color Metal = Hex(0x3E5560);
        public static readonly Color MetalDark = Hex(0x22313A);
        public static readonly Color Teal = Hex(0x2FB8B0);
        public static readonly Color Amber = Hex(0xF2A33A);
        public static readonly Color Coral = Hex(0xE2574C);
        public static readonly Color Sand = Hex(0xD9CBA3);
        public static readonly Color Board = Hex(0x0F2430);

        static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, 1f);

        // ------------------------------------------------------------------ materials

        static Shader unlit;
        static readonly Dictionary<string, Material> made = new Dictionary<string, Material>();

        public static Material Get(string name) => made.TryGetValue(name, out var m) ? m : throw new Exception($"no material '{name}'");

        /// <summary>Makes (or remakes) every material and texture. Returns the materials by name.</summary>
        public static Dictionary<string, Material> Materials()
        {
            Directory.CreateDirectory(Folder);
            unlit = Shader.Find("Universal Render Pipeline/Unlit") ?? throw new Exception("URP Unlit shader not found");
            made.Clear();
            Textured("floor", FloorTexture());
            Textured("wall", WallTexture());
            Textured("window", WindowTexture());
            Textured("ceiling", CeilingTexture());
            Textured("prop", PropTexture());
            Textured("hatch", HatchTexture());
            Plain("hull", Hull);
            Plain("fixture", MetalDark);
            Plain("trim", Metal);
            Plain("screen", Teal * 0.6f + Color.black * 0.4f);        // recoloured per console at run time (relay op color)
            Plain("fault", Coral);
            Plain("post", Coral);
            Plain("ring", Amber);
            Plain("board", Board);
            Plain("button", Hex(0x1F6F78));
            Plain("buttonWarn", Hex(0x8A2D2A));
            Plain("barBack", Hex(0x09141A));
            Plain("barFill", Hex(0x5BD38A));
            Plain("workFill", Teal);
            Plain("band", Amber);
            Plain("bot", Hex(0x6C7C86));
            Plain("botLamp", Hex(0x7FE3FF));
            Plain("downed", Amber);
            Plain("downedMark", Hex(0x1B1B1B));
            Plain("pad", Hex(0x34525E));
            var shell = Plain("shell", Color.black);
            shell.renderQueue = 2450;                                                     // after the station, before transparent things
            foreach (var m in made.Values)
            {
                BaseShaderGUI.SetMaterialKeywords(m);
                EditorUtility.SetDirty(m);
            }
            AssetDatabase.SaveAssets();
            return made;
        }

        static Material Save(string name)
        {
            string path = $"{Folder}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(unlit) { name = name };
                AssetDatabase.CreateAsset(m, path);
            }
            m.shader = unlit;
            m.enableInstancing = false;
            made[name] = m;
            return m;
        }

        static Material Plain(string name, Color colour)
        {
            var m = Save(name);
            m.SetTexture("_BaseMap", null);
            m.SetColor("_BaseColor", colour);
            return m;
        }

        static Material Textured(string name, Texture2D texture)
        {
            var m = Save(name);
            m.SetTexture("_BaseMap", texture);
            m.SetColor("_BaseColor", Color.white);
            return m;
        }

        // ------------------------------------------------------------------ textures, painted here

        static Texture2D Paint(string name, int w, int h, Func<int, int, Color> pixel, bool repeat = true)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, true);
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    t.SetPixel(x, y, pixel(x, y));
            t.Apply();
            string path = $"{Folder}/{name}.png";
            File.WriteAllBytes(path, t.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(t);
            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            importer.filterMode = FilterMode.Bilinear;
            importer.mipmapEnabled = true;
            importer.sRGBTexture = true;
            importer.maxTextureSize = 512;
            importer.textureCompression = TextureImporterCompression.Compressed;
            importer.SetPlatformTextureSettings(new TextureImporterPlatformSettings { name = "Android", overridden = true, maxTextureSize = 512, format = TextureImporterFormat.ASTC_6x6 });
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        static float Hash(int x, int y)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263);
                h = (h ^ (h >> 13)) * 1274126177;
                return ((h ^ (h >> 16)) & 0xFFFF) / 65535f;
            }
        }

        static Color Shade(Color c, float k) => new Color(c.r * k, c.g * k, c.b * k, 1f);

        /// <summary>Deck plates, one 2 m tile: four plates with seams, bolts at the corners, a little grain.</summary>
        static Texture2D FloorTexture() => Paint("floor", 256, 256, (x, y) =>
        {
            var plate = Hex(0x3A4A50);
            int px = x % 128, py = y % 128;
            float k = 0.92f + 0.08f * Hash(x / 2, y / 2);
            if (px < 3 || py < 3) return Shade(plate, 0.45f);
            if (px < 5 || py < 5) return Shade(plate, 1.18f);
            int bx = px < 64 ? px - 12 : px - 116, by = py < 64 ? py - 12 : py - 116;
            if (bx * bx + by * by < 10) return Shade(plate, 1.35f);
            // a raised tread of short diagonal ribs
            if (((px + py) / 6) % 4 == 0 && px > 20 && px < 108 && py > 20 && py < 108) k *= 1.08f;
            return Shade(plate, k);
        });

        /// <summary>
        /// A wall over its full height (v 0 at the floor, 1 at the ceiling), 2 m across: a dark kick plate, panels with
        /// seams, a glowing strip near the top (the station's lighting), a dark band under the ceiling.
        /// </summary>
        static Texture2D WallTexture() => Paint("wall", 256, 256, (x, y) =>
        {
            float v = y / 255f;
            var panel = Hex(0x4D6670);
            if (v < 0.09f) return Shade(Hex(0x1E2A30), 0.9f + 0.1f * Hash(x, y));
            if (v < 0.1f) return Hex(0x9AB0B8);
            if (v > 0.83f && v < 0.88f) return Color.Lerp(Hex(0xBFF6F0), Hex(0x6FE0D8), Mathf.Abs(v - 0.855f) * 40f);
            if (v >= 0.88f) return Shade(Hex(0x1E2A30), 1f);
            if (v > 0.80f) return Color.Lerp(panel, Hex(0x9DE7E0), (v - 0.80f) / 0.03f * 0.6f);   // the strip's glow on the wall
            int px = x % 128;
            if (px < 2 || px > 125) return Shade(panel, 0.55f);
            if (Mathf.Abs(v - 0.45f) < 0.006f) return Shade(panel, 0.6f);
            float k = 0.95f + 0.05f * Hash(x / 3, y / 3) - 0.12f * (0.8f - v);
            return Shade(panel, k);
        });

        /// <summary>A long window onto the water: deep blue, lighter toward the top, faint drifting specks, a frame.</summary>
        static Texture2D WindowTexture() => Paint("window", 256, 256, (x, y) =>
        {
            float v = y / 255f;
            if (v < 0.25f || v > 0.8f) return Shade(Hex(0x2B3D45), 0.9f + 0.1f * Hash(x, y));
            if (v < 0.27f || v > 0.78f || x % 128 < 3) return Hex(0x8FA3AA);
            var water = Color.Lerp(Hex(0x03121F), Hex(0x0E5470), (v - 0.27f) / 0.51f);
            if (Hash(x, y) > 0.995f) water = Color.Lerp(water, Hex(0x9FE8FF), 0.6f);
            return water;
        });

        /// <summary>The ceiling: dark grid with a light panel in each 2 m tile.</summary>
        static Texture2D CeilingTexture() => Paint("ceiling", 128, 128, (x, y) =>
        {
            int px = x % 64, py = y % 64;
            if (px > 18 && px < 46 && py > 22 && py < 42) return Hex(0xCFF7F2);
            if (px > 16 && px < 48 && py > 20 && py < 44) return Hex(0x5E7A80);
            if (px < 2 || py < 2) return Hex(0x111A1F);
            return Shade(Hex(0x26343A), 0.95f + 0.05f * Hash(x, y));
        });

        /// <summary>Machinery casing: panels, a rivet line and a hazard stripe at the foot.</summary>
        static Texture2D PropTexture() => Paint("prop", 128, 128, (x, y) =>
        {
            var c = Hex(0x56707A);
            if (y < 10) return ((x + y) / 8) % 2 == 0 ? Amber : Hex(0x222222);
            if (x % 64 < 2 || y % 64 < 2) return Shade(c, 0.5f);
            if (y % 64 == 8 && x % 8 < 2) return Shade(c, 1.3f);
            return Shade(c, 0.9f + 0.1f * Hash(x / 2, y / 2));
        });

        /// <summary>A service hatch seen from above: an amber and black ring, a dark grate.</summary>
        static Texture2D HatchTexture() => Paint("hatch", 128, 128, (x, y) =>
        {
            float dx = x - 63.5f, dy = y - 63.5f, r = Mathf.Sqrt(dx * dx + dy * dy);
            if (r > 63) return Hex(0x1E2A30);
            if (r > 50) return ((int)((Mathf.Atan2(dy, dx) + Mathf.PI) / (2 * Mathf.PI) * 16) % 2 == 0) ? Amber : Hex(0x1A1A1A);
            if (r > 46) return Hex(0x6E8088);
            return (x / 6 + y / 6) % 2 == 0 ? Hex(0x2A363C) : Hex(0x161E22);
        }, false);

        // ------------------------------------------------------------------ small meshes, saved in one asset

        static readonly Dictionary<string, Mesh> meshes = new Dictionary<string, Mesh>();
        static readonly List<Mesh> pending = new List<Mesh>();

        public static void BeginMeshes()
        {
            meshes.Clear();
            pending.Clear();
        }

        /// <summary>Keeps a mesh for the asset written by SaveMeshes (every generated mesh of the kit goes in one file).</summary>
        public static Mesh Keep(Mesh mesh)
        {
            pending.Add(mesh);
            return mesh;
        }

        public static void SaveMeshes()
        {
            AssetDatabase.DeleteAsset(MeshAsset);
            var holder = new Mesh { name = "station meshes" };
            AssetDatabase.CreateAsset(holder, MeshAsset);
            foreach (var m in pending) AssetDatabase.AddObjectToAsset(m, holder);
            AssetDatabase.SaveAssets();
        }

        /// <summary>A unit quad in the XY plane, seen from -Z (as Unity's own, and as text is read).</summary>
        public static Mesh Quad()
        {
            if (meshes.TryGetValue("quad", out var m)) return m;
            var part = new MeshPart();
            part.Quad(new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0), Vector3.back,
                new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1));
            return meshes["quad"] = Keep(part.ToMesh("quad"));
        }

        /// <summary>A unit cube centred on the origin.</summary>
        public static Mesh Cube()
        {
            if (meshes.TryGetValue("cube", out var m)) return m;
            var part = new MeshPart();
            part.Box(new Vector3(-0.5f, -0.5f, -0.5f), new Vector3(0.5f, 0.5f, 0.5f), 1f, true);
            return meshes["cube"] = Keep(part.ToMesh("cube"));
        }

        /// <summary>A sphere of radius 0.5; `inside`: its triangles face inward (the blackout shell, seen from within).</summary>
        public static Mesh Sphere(bool inside)
        {
            string key = inside ? "sphereIn" : "sphere";
            if (meshes.TryGetValue(key, out var m)) return m;
            var v = new List<Vector3>();
            var n = new List<Vector3>();
            var uv = new List<Vector2>();
            var tris = new List<int>();
            const int rings = 12, segments = 20;
            for (int r = 0; r <= rings; r++)
                for (int s = 0; s <= segments; s++)
                {
                    float a = Mathf.PI * r / rings, b = 2 * Mathf.PI * s / segments;
                    var p = new Vector3(Mathf.Sin(a) * Mathf.Cos(b), Mathf.Cos(a), Mathf.Sin(a) * Mathf.Sin(b));
                    v.Add(p * 0.5f);
                    n.Add(inside ? -p : p);
                    uv.Add(new Vector2((float)s / segments, 1f - (float)r / rings));
                }
            for (int r = 0; r < rings; r++)
                for (int s = 0; s < segments; s++)
                {
                    int a = r * (segments + 1) + s, b = a + segments + 1;
                    if (inside) tris.AddRange(new[] { a, a + 1, b, b, a + 1, b + 1 });
                    else tris.AddRange(new[] { a, b, a + 1, b, b + 1, a + 1 });
                }
            var mesh = new Mesh { name = key };
            mesh.SetVertices(v);
            mesh.SetNormals(n);
            mesh.SetUVs(0, uv);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            return meshes[key] = Keep(mesh);
        }

        /// <summary>A flat ring (or a disc when inner is 0) lying on y = 0, facing up, UVs across its square.</summary>
        public static MeshPart Ring(float inner, float outer, int segments, float y = 0f)
        {
            var part = new MeshPart();
            for (int s = 0; s < segments; s++)
            {
                float a = 2 * Mathf.PI * s / segments, b = 2 * Mathf.PI * (s + 1) / segments;
                Vector3 P(float r, float t) => new Vector3(r * Mathf.Cos(t), y, r * Mathf.Sin(t));
                Vector2 U(Vector3 p) => new Vector2(p.x / (2 * outer) + 0.5f, p.z / (2 * outer) + 0.5f);
                var o0 = P(outer, a); var o1 = P(outer, b); var i0 = P(inner, a); var i1 = P(inner, b);
                part.Quad(i0, o0, o1, i1, Vector3.up, U(i0), U(o0), U(o1), U(i1));
            }
            return part;
        }

        /// <summary>An upright cylinder (no caps) from y0 to y1.</summary>
        public static MeshPart Cylinder(float radius, float y0, float y1, int segments)
        {
            var part = new MeshPart();
            for (int s = 0; s < segments; s++)
            {
                float a = 2 * Mathf.PI * s / segments, b = 2 * Mathf.PI * (s + 1) / segments;
                var p0 = new Vector3(radius * Mathf.Cos(a), y0, radius * Mathf.Sin(a));
                var p1 = new Vector3(radius * Mathf.Cos(b), y0, radius * Mathf.Sin(b));
                var normal = new Vector3(Mathf.Cos((a + b) / 2), 0, Mathf.Sin((a + b) / 2));
                part.Quad(p0, p1, p1 + Vector3.up * (y1 - y0), p0 + Vector3.up * (y1 - y0), normal, new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1));
            }
            return part;
        }

        // ------------------------------------------------------------------ the two tones

        /// <summary>
        /// The new-job alert (two short rising beeps) and the alarm (a falling two-tone call, played at the shift's end),
        /// written as 16-bit mono WAV from sine waves with soft edges.
        /// </summary>
        public static AudioClip[] Tones()
        {
            Directory.CreateDirectory(Folder);
            var alert = Wave("tone-alert", 22050, new[] { (880f, 0.12f), (0f, 0.05f), (1320f, 0.16f) }, 0.45f);
            var alarm = Wave("tone-alarm", 22050, new[] { (523f, 0.28f), (392f, 0.28f), (523f, 0.28f), (392f, 0.28f), (330f, 0.5f) }, 0.5f);
            return new[] { alert, alarm };
        }

        static AudioClip Wave(string name, int rate, (float hz, float seconds)[] notes, float volume)
        {
            var samples = new List<short>();
            foreach (var (hz, seconds) in notes)
            {
                int count = (int)(rate * seconds);
                int edge = Math.Min(count / 4, rate / 100);
                for (int i = 0; i < count; i++)
                {
                    float env = Math.Min(1f, Math.Min(i / (float)Math.Max(1, edge), (count - i) / (float)Math.Max(1, edge)));
                    float s = hz <= 0 ? 0 : Mathf.Sin(2 * Mathf.PI * hz * i / rate) * 0.8f + Mathf.Sin(4 * Mathf.PI * hz * i / rate) * 0.2f;
                    samples.Add((short)(s * env * volume * short.MaxValue));
                }
            }
            string path = $"{Folder}/{name}.wav";
            using (var file = new BinaryWriter(File.Create(path)))
            {
                int bytes = samples.Count * 2;
                file.Write(new[] { (byte)'R', (byte)'I', (byte)'F', (byte)'F' });
                file.Write(36 + bytes);
                file.Write(new[] { (byte)'W', (byte)'A', (byte)'V', (byte)'E', (byte)'f', (byte)'m', (byte)'t', (byte)' ' });
                file.Write(16);
                file.Write((short)1);
                file.Write((short)1);
                file.Write(rate);
                file.Write(rate * 2);
                file.Write((short)2);
                file.Write((short)16);
                file.Write(new[] { (byte)'d', (byte)'a', (byte)'t', (byte)'a' });
                file.Write(bytes);
                foreach (var s in samples) file.Write(s);
            }
            AssetDatabase.ImportAsset(path);
            return AssetDatabase.LoadAssetAtPath<AudioClip>(path);
        }
    }
}
