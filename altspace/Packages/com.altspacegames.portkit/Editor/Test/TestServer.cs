using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Threading;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// A local web server for Play-mode tests, inside the editor (no outside process to start or forget): the kit
    /// bundles and the snippet's script come from an address that is not the page's own, as they do for a real world.
    ///
    ///   http://localhost:&lt;page port + 100&gt;/kits/...   Library/PortKit/kits/...     (android/&lt;slug&gt;, windows/&lt;slug&gt;)
    ///   http://localhost:&lt;page port + 100&gt;/web/...    Assets/WebRoot/...           (pk-&lt;slug&gt;.js and what it fetches)
    ///
    /// Only the main editor serves (a Multiplayer Play Mode player loads from the main editor's). Requests are
    /// counted per path (Hits), so a test can tell whether a bundle was fetched once or twice.
    /// </summary>
    public static class TestServer
    {
        static HttpListener listener;
        static Thread thread;
        static string kitsRoot, webRoot;
        static readonly Dictionary<string, int> hits = new Dictionary<string, int>();

        public static int Port => PlayPort.Port + 100;
        public static string Address => "http://localhost:" + Port;
        public static bool Running => listener != null && listener.IsListening;

        /// <summary>How many times each path has been fetched since the server started (a request that is not a GET is counted under its method).</summary>
        public static Dictionary<string, int> Hits
        {
            get { lock (hits) return new Dictionary<string, int>(hits); }
        }

        public static void Start()
        {
            if (Running || PlayPort.IsClone) return;
            kitsRoot = Path.GetFullPath(PlayPort.MainRoot + "/" + KitBundles.BundleRoot);
            webRoot = Path.GetFullPath(PlayPort.MainRoot + "/Assets/WebRoot");
            lock (hits) hits.Clear();
            listener = new HttpListener();
            listener.Prefixes.Add($"http://localhost:{Port}/");
            listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            listener.Start();
            thread = new Thread(Loop) { IsBackground = true, Name = "PortKit test server" };
            thread.Start(listener);
            AssemblyReloadEvents.beforeAssemblyReload -= Stop;
            AssemblyReloadEvents.beforeAssemblyReload += Stop;
            EditorApplication.quitting -= Stop;
            EditorApplication.quitting += Stop;
        }

        public static void Stop()
        {
            var old = listener;
            listener = null;
            try { old?.Stop(); old?.Close(); }
            catch (Exception) { /* already closed */ }
        }

        static void Loop(object state)
        {
            var mine = (HttpListener)state;
            while (mine.IsListening)
            {
                HttpListenerContext context;
                try { context = mine.GetContext(); }
                catch (Exception) { return; }                                // stopped
                try { Serve(context); }
                catch (Exception) { try { context.Response.Abort(); } catch (Exception) { } }
            }
        }

        static void Serve(HttpListenerContext context)
        {
            string path = Uri.UnescapeDataString(context.Request.Url.AbsolutePath);
            var response = context.Response;
            response.AddHeader("Access-Control-Allow-Origin", "*");
            response.AddHeader("Cache-Control", "no-store");
            string root = path.StartsWith("/kits/") ? kitsRoot : path.StartsWith("/web/") ? webRoot : null;
            string file = root == null ? null : Path.GetFullPath(Path.Combine(root, path.Substring(path.IndexOf('/', 1) + 1)));
            if (file == null || !file.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(file))
            {
                response.StatusCode = 404;
                response.Close();
                return;
            }
            string counted = context.Request.HttpMethod == "GET" ? path : context.Request.HttpMethod + " " + path;
            lock (hits) { hits.TryGetValue(counted, out int n); hits[counted] = n + 1; }
            byte[] data = File.ReadAllBytes(file);
            switch (Path.GetExtension(file).ToLowerInvariant())
            {
                case ".js": response.ContentType = "text/javascript; charset=utf-8"; break;
                case ".json": response.ContentType = "application/json; charset=utf-8"; break;
                case ".html": response.ContentType = "text/html; charset=utf-8"; break;
                default: response.ContentType = "application/octet-stream"; break;
            }
            response.ContentLength64 = data.Length;
            if (context.Request.HttpMethod != "HEAD") response.OutputStream.Write(data, 0, data.Length);
            response.Close();
        }
    }
}
