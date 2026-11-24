// The station's shell, generated from ts/src/station-map.json: floors, walls, ceilings, roofs and props as merged
// meshes per region of the map, and the colliders a body meets. Nothing here comes from the upstream project but the
// map's rectangles (PORT.md section 6).
//
// The open floor is exactly the rules' walkable area at radius 0: the union of the rooms and corridors less the
// room-shape cut-outs and the props (ShipMap.IsBlocked). Walls stand on the edge of that area, their inner faces on the
// edge itself and their thickness outward, never into another open area; props are solid boxes of their exact
// rectangle. Consoles, panels, hatches, boards and markers have no solid collider (the rules do not block on them), so
// whatever a body can reach is open to the rules, and whatever the rules call open has nothing solid in it (checked by
// HiddenRoleTools.CheckWalkable against the rules' own test, ts/vectors/walkable-grid.json).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;

namespace HiddenRole
{
    /// <summary>An axis-aligned rectangle on the map (x right, y up the map; the kit's x and z).</summary>
    public struct MapRect
    {
        public double X0, Y0, X1, Y1;
        public MapRect(double x, double y, double w, double h) { X0 = x; Y0 = y; X1 = x + w; Y1 = y + h; }
        public bool Contains(double x, double y) => x >= X0 && x < X1 && y >= Y0 && y < Y1;
        public double CX => (X0 + X1) / 2;
        public double CY => (Y0 + Y1) / 2;
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "[{0:0.###},{1:0.###} .. {2:0.###},{3:0.###}]", X0, Y0, X1, Y1);
    }

    /// <summary>Collects the triangles of one material in one region.</summary>
    public sealed class MeshPart
    {
        public readonly List<Vector3> Vertices = new List<Vector3>();
        public readonly List<Vector3> Normals = new List<Vector3>();
        public readonly List<Vector2> Uvs = new List<Vector2>();
        public readonly List<int> Triangles = new List<int>();
        public int TriangleCount => Triangles.Count / 3;

        /// <summary>A quad with its front toward `normal` (corners in either winding; it is put right).</summary>
        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal, Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud)
        {
            if (Vector3.Dot(Vector3.Cross(b - a, c - a), normal) < 0) { (b, d) = (d, b); (ub, ud) = (ud, ub); }
            int i = Vertices.Count;
            Vertices.AddRange(new[] { a, b, c, d });
            Normals.AddRange(new[] { normal, normal, normal, normal });
            Uvs.AddRange(new[] { ua, ub, uc, ud });
            Triangles.AddRange(new[] { i, i + 1, i + 2, i, i + 2, i + 3 });
        }

        /// <summary>A box, all six faces outward, its UVs in metres / tile.</summary>
        public void Box(Vector3 min, Vector3 max, float tile, bool bottom = false)
        {
            Vector3 p(float x, float y, float z) => new Vector3(x, y, z);
            float x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x, y1 = max.y, z1 = max.z;
            Vector2 u(float a, float b) => new Vector2(a / tile, b / tile);
            Quad(p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1), Vector3.up, u(x0, z0), u(x1, z0), u(x1, z1), u(x0, z1));
            if (bottom) Quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), Vector3.down, u(x0, z0), u(x1, z0), u(x1, z1), u(x0, z1));
            Quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0), Vector3.back, u(x0, y0), u(x1, y0), u(x1, y1), u(x0, y1));
            Quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), Vector3.forward, u(x0, y0), u(x1, y0), u(x1, y1), u(x0, y1));
            Quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), Vector3.left, u(z0, y0), u(z1, y0), u(z1, y1), u(z0, y1));
            Quad(p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0), Vector3.right, u(z0, y0), u(z1, y0), u(z1, y1), u(z0, y1));
        }

        /// <summary>Adds another part, moved by `matrix`.</summary>
        public void Add(MeshPart other, Matrix4x4 matrix)
        {
            int i = Vertices.Count;
            foreach (var v in other.Vertices) Vertices.Add(matrix.MultiplyPoint3x4(v));
            foreach (var n in other.Normals) Normals.Add(matrix.MultiplyVector(n).normalized);
            Uvs.AddRange(other.Uvs);
            foreach (var t in other.Triangles) Triangles.Add(i + t);
        }

        public Mesh ToMesh(string name)
        {
            var mesh = new Mesh { name = name, indexFormat = Vertices.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            mesh.SetVertices(Vertices);
            mesh.SetNormals(Normals);
            mesh.SetUVs(0, Uvs);
            mesh.SetTriangles(Triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }
    }

    /// <summary>The walkable area on a grid made of every rectangle edge (exact, no sampling).</summary>
    public sealed class OpenGrid
    {
        public readonly double[] Xs, Ys;
        public readonly bool[,] Open;
        public int Nx => Xs.Length - 1;
        public int Ny => Ys.Length - 1;

        public OpenGrid(IList<MapRect> walk, IList<MapRect> cuts)
        {
            var xs = new SortedSet<double>();
            var ys = new SortedSet<double>();
            foreach (var r in walk.Concat(cuts)) { xs.Add(Round(r.X0)); xs.Add(Round(r.X1)); ys.Add(Round(r.Y0)); ys.Add(Round(r.Y1)); }
            Xs = xs.ToArray();
            Ys = ys.ToArray();
            Open = new bool[Nx, Ny];
            for (int i = 0; i < Nx; i++)
                for (int j = 0; j < Ny; j++)
                {
                    double x = (Xs[i] + Xs[i + 1]) / 2, y = (Ys[j] + Ys[j + 1]) / 2;
                    Open[i, j] = walk.Any(r => r.Contains(x, y)) && !cuts.Any(r => r.Contains(x, y));
                }
        }

        /// <summary>Map numbers are floats written as decimals: round away the float noise (0.05 mm).</summary>
        static double Round(double v) => Math.Round(v * 20000) / 20000;

        public bool At(int i, int j) => i >= 0 && j >= 0 && i < Nx && j < Ny && Open[i, j];

        /// <summary>The open area as few rectangles: runs along each row, then equal runs of neighbouring rows merged.</summary>
        public List<MapRect> Rectangles()
        {
            var result = new List<MapRect>();
            var active = new Dictionary<(int, int), int>();     // (i0, i1) -> row it started
            for (int j = 0; j <= Ny; j++)
            {
                var runs = new HashSet<(int, int)>();
                if (j < Ny)
                    for (int i = 0; i < Nx;)
                    {
                        if (!Open[i, j]) { i++; continue; }
                        int s = i;
                        while (i < Nx && Open[i, j]) i++;
                        runs.Add((s, i));
                    }
                foreach (var run in active.Keys.ToList())
                    if (!runs.Contains(run))
                    {
                        result.Add(new MapRect(Xs[run.Item1], Ys[active[run]], Xs[run.Item2] - Xs[run.Item1], Ys[j] - Ys[active[run]]));
                        active.Remove(run);
                    }
                foreach (var run in runs) if (!active.ContainsKey(run)) active[run] = j;
            }
            return result;
        }

        /// <summary>
        /// A stretch of wall: on the line x = At (vertical, from From to To along y) or y = At (horizontal, along x), with
        /// the open side toward +axis (Facing 1) or -axis (Facing -1), and how thick it may be without entering the
        /// next open area.
        /// </summary>
        public struct Wall
        {
            public bool Vertical;
            public double At, From, To, Thickness;
            public int Facing;
        }

        /// <summary>How far the closed cells from column `i` run along x in direction `dir` (outside the grid: unlimited).</summary>
        double ClosedDepthX(int i, int j, int dir, double limit)
        {
            double depth = 0;
            for (; i >= 0 && i < Nx && !Open[i, j] && depth < limit; i += dir) depth += Xs[i + 1] - Xs[i];
            return i < 0 || i >= Nx ? limit : depth;
        }

        double ClosedDepthY(int i, int j, int dir, double limit)
        {
            double depth = 0;
            for (; j >= 0 && j < Ny && !Open[i, j] && depth < limit; j += dir) depth += Ys[j + 1] - Ys[j];
            return j < 0 || j >= Ny ? limit : depth;
        }

        public List<Wall> Walls(double maxThickness)
        {
            var walls = new List<Wall>();
            // vertical lines x = Xs[i]: cells (i-1, j) and (i, j)
            for (int i = 0; i <= Nx; i++)
            {
                int j = 0;
                while (j < Ny)
                {
                    bool left = At(i - 1, j), right = At(i, j);
                    if (left == right) { j++; continue; }
                    int facing = right ? 1 : -1;
                    int s = j;
                    double thick = maxThickness;
                    while (j < Ny && At(i - 1, j) != At(i, j) && (At(i, j) ? 1 : -1) == facing)
                    {
                        thick = Math.Min(thick, ClosedDepthX(facing == 1 ? i - 1 : i, j, -facing, maxThickness));
                        j++;
                    }
                    walls.Add(new Wall { Vertical = true, At = Xs[i], From = Ys[s], To = Ys[j], Facing = facing, Thickness = thick });
                }
            }
            // horizontal lines y = Ys[j]: cells (i, j-1) and (i, j)
            for (int j = 0; j <= Ny; j++)
            {
                int i = 0;
                while (i < Nx)
                {
                    bool below = At(i, j - 1), above = At(i, j);
                    if (below == above) { i++; continue; }
                    int facing = above ? 1 : -1;
                    int s = i;
                    double thick = maxThickness;
                    while (i < Nx && At(i, j - 1) != At(i, j) && (At(i, j) ? 1 : -1) == facing)
                    {
                        thick = Math.Min(thick, ClosedDepthY(i, facing == 1 ? j - 1 : j, -facing, maxThickness));
                        i++;
                    }
                    walls.Add(new Wall { Vertical = false, At = Ys[j], From = Xs[s], To = Xs[i], Facing = facing, Thickness = thick });
                }
            }
            return walls;
        }
    }

    /// <summary>The meshes and colliders of one enclosed area (the station, or the observer lounge).</summary>
    public sealed class Shell
    {
        public readonly Dictionary<(int, string), MeshPart> Parts = new Dictionary<(int, string), MeshPart>();
        public readonly List<(Vector3 center, Vector3 size, int region)> Solids = new List<(Vector3, Vector3, int)>();
        public int Floors, WallCount;
        public double OpenArea;

        public MeshPart Part(int region, string material)
        {
            if (!Parts.TryGetValue((region, material), out var part)) Parts[(region, material)] = part = new MeshPart();
            return part;
        }

        /// <summary>
        /// Floors, ceilings, roofs and walls of the open area. `region` puts each piece in a part of the map (so the
        /// renderers can be culled one region at a time); `wallMaterial` may pick another material for a wall (windows).
        /// </summary>
        public static Shell Build(OpenGrid grid, float height, float baseY, Func<double, double, int> region,
                                  Func<OpenGrid.Wall, string> wallMaterial, float maxThickness = 0.25f, float tile = 2f)
        {
            var shell = new Shell();
            float y0 = baseY, y1 = baseY + height, roof = y1 + 0.2f;
            Vector2 U(double a, double b) => new Vector2((float)(a / tile), (float)(b / tile));
            foreach (var r in grid.Rectangles())
            {
                int g = region(r.CX, r.CY);
                float x0 = (float)r.X0, x1 = (float)r.X1, z0 = (float)r.Y0, z1 = (float)r.Y1;
                shell.Part(g, "floor").Quad(new Vector3(x0, y0, z0), new Vector3(x1, y0, z0), new Vector3(x1, y0, z1), new Vector3(x0, y0, z1), Vector3.up,
                    U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1));
                shell.Part(g, "ceiling").Quad(new Vector3(x0, y1, z0), new Vector3(x1, y1, z0), new Vector3(x1, y1, z1), new Vector3(x0, y1, z1), Vector3.down,
                    U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1));
                shell.Part(g, "hull").Quad(new Vector3(x0, roof, z0), new Vector3(x1, roof, z0), new Vector3(x1, roof, z1), new Vector3(x0, roof, z1), Vector3.up,
                    U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1));
                // the roof is solid, so the station cannot be entered from above
                shell.Solids.Add((new Vector3((x0 + x1) / 2, (y1 + roof) / 2, (z0 + z1) / 2), new Vector3(x1 - x0, roof - y1, z1 - z0), g));
                shell.Floors++;
                shell.OpenArea += (x1 - x0) * (z1 - z0);
            }
            foreach (var w in grid.Walls(maxThickness))
            {
                shell.WallCount++;
                float at = (float)w.At, from = (float)w.From, to = (float)w.To, t = (float)w.Thickness;
                float outer = at - w.Facing * t;                                          // the wall's thickness goes away from the open side
                double cx = w.Vertical ? at : (from + to) / 2, cy = w.Vertical ? (from + to) / 2 : at;
                int g = region(cx, cy);
                string material = wallMaterial(w);
                Vector3 P(float along, float across, float y) => w.Vertical ? new Vector3(across, y, along) : new Vector3(along, y, across);
                Vector3 inward = w.Vertical ? new Vector3(w.Facing, 0, 0) : new Vector3(0, 0, w.Facing);
                // the inner face: u along the wall in metres / tile, v over the height
                var uv0 = new Vector2(from / tile, 0); var uv1 = new Vector2(to / tile, 0); var uv2 = new Vector2(to / tile, 1); var uv3 = new Vector2(from / tile, 1);
                shell.Part(g, material).Quad(P(from, at, y0), P(to, at, y0), P(to, at, y1), P(from, at, y1), inward, uv0, uv1, uv2, uv3);
                // the outer face and the top of the slab, for anyone outside
                shell.Part(g, "hull").Quad(P(from, outer, y0), P(to, outer, y0), P(to, outer, roof), P(from, outer, roof), -inward,
                    U(from, y0), U(to, y0), U(to, roof), U(from, roof));
                shell.Part(g, "hull").Quad(P(from, at, roof), P(to, at, roof), P(to, outer, roof), P(from, outer, roof), Vector3.up,
                    U(from, at), U(to, at), U(to, outer), U(from, outer));
                var center = P((from + to) / 2, (at + outer) / 2, (y0 + roof) / 2);
                var size = w.Vertical ? new Vector3(t, roof - y0, to - from) : new Vector3(to - from, roof - y0, t);
                shell.Solids.Add((center, size, g));
            }
            return shell;
        }
    }
}
