using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace PortKit
{
    /// <summary>Finds types of the Creator SDK by name (lifted from FlightWorld's GraphTypes): nothing here needs the SDK at compile time.</summary>
    public static class GraphTypes
    {
        public static Type Find(string fullName)
        {
            var type = TryFind(fullName);
            if (type == null) throw new Exception($"type '{fullName}' not found (is the Creator SDK installed?)");
            return type;
        }

        public static Type TryFind(string fullName)
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetType(fullName, false);
                if (type != null) return type;
            }
            return null;
        }
    }

    /// <summary>
    /// The Creator SDK's lists of what a world graph may use (lifted from FlightWorld's GraphSpike.AllowedMembers).
    /// The app enforces them; the editor does not, so everything the port kit generates is checked here first.
    /// </summary>
    public static class AllowList
    {
        static HashSet<string> members;

        /// <summary>"Namespace.Type.member" for every member a graph may get, set or call (BS.SDKEditor.VsStubsAllowed.members). Throws if the SDK has none.</summary>
        public static HashSet<string> Members()
        {
            if (members != null) return members;
            var type = GraphTypes.TryFind("BS.SDKEditor.VsStubsAllowed");
            if (type?.GetField("members")?.GetValue(null) is string[] list && list.Length > 0)
                return members = new HashSet<string>(list, StringComparer.Ordinal);
            throw new Exception("the Creator SDK's member allow list (BS.SDKEditor.VsStubsAllowed.members) was not found");
        }

        public static bool Allows(string member) => Members().Contains(member);

        /// <summary>The members of `used` that are not on the list.</summary>
        public static List<string> Refused(IEnumerable<string> used)
        {
            var allowed = Members();
            return used.Where(m => !allowed.Contains(m)).Distinct().OrderBy(m => m, StringComparer.Ordinal).ToList();
        }

        /// <summary>
        /// The SDK's own check of every graph in the project (assets, prefabs) and under `sceneRoots`: the node
        /// identifiers the app will not run (BS.SDKEditor.ValidateVisualScripting.CollectDisallowedElements, the check
        /// behind the Builder's "Visual Scripting node support" item). Empty means clean; throws if it could not run.
        /// </summary>
        public static List<string> DisallowedNodes(IEnumerable<GameObject> sceneRoots)
        {
            var type = GraphTypes.Find("BS.SDKEditor.ValidateVisualScripting");
            var method = type.GetMethod("CollectDisallowedElements", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                         ?? throw new Exception("ValidateVisualScripting.CollectDisallowedElements not found in this SDK");
            try
            {
                var found = method.Invoke(null, new object[] { sceneRoots ?? Enumerable.Empty<GameObject>(), false });
                return ((IEnumerable)found).Cast<object>().Select(o => o?.ToString() ?? "").ToList();
            }
            catch (TargetInvocationException e)
            {
                throw new Exception("the SDK's graph check failed: " + (e.InnerException ?? e).Message, e.InnerException ?? e);
            }
        }
    }
}
