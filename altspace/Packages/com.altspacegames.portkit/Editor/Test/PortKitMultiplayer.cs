using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace PortKit
{
    /// <summary>
    /// The second local player without clicking. The SDK's local multiplayer runs each extra player as a Multiplayer
    /// Play Mode virtual player, which a person switches on by ticking it in Window > Multiplayer > Multiplayer Play
    /// Mode. The engine keeps that behind internal API (Unity.Multiplayer.PlayMode.Editor.MultiplayerPlaymode, in
    /// UnityEditor.MultiplayerModule), reached here by reflection.
    ///
    ///   PortKit/Multiplayer/Activate Player 2      starts the second editor (a clone under Library/VP); takes a minute the first time
    ///   PortKit/Multiplayer/Deactivate Players     closes every extra player
    ///   PortKit/Multiplayer/Report                 each player's state
    /// Report: Logs/portkit_multiplayer.txt. A player is ready when its state is Launched; its own remote is at
    /// Library/VP/&lt;id&gt;/Library/PortKit (tools/remote.sh takes that folder as the project).
    /// </summary>
    public static class PortKitMultiplayer
    {
        const string LogPath = "Logs/portkit_multiplayer.txt";
        const BindingFlags Any = BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        static object[] Players()
        {
            var type = GraphTypes.Find("Unity.Multiplayer.PlayMode.Editor.MultiplayerPlaymode");
            var players = type.GetProperty("Players", Any)?.GetValue(null) as Array;
            if (players == null) throw new Exception("Multiplayer Play Mode has no players (is com.unity.multiplayer.playmode 2.x in the manifest, and switched on in Project Settings > Multiplayer > Playmode?)");
            return players.Cast<object>().ToArray();
        }

        static string Describe(object player)
        {
            var t = player.GetType();
            return $"{t.GetProperty("Name", Any)?.GetValue(player)}: {t.GetProperty("PlayerState", Any)?.GetValue(player)} ({t.GetProperty("Type", Any)?.GetValue(player)})";
        }

        static void Write(StringBuilder report)
        {
            try
            {
                foreach (var player in Players()) report.AppendLine(Describe(player));
                string clones = PlayPort.MainRoot + "/Library/VP";
                if (Directory.Exists(clones))
                    foreach (var dir in Directory.GetDirectories(clones)) report.AppendLine("clone folder: " + dir.Replace('\\', '/'));
            }
            catch (Exception e) { report.AppendLine("FAILED: " + (e.InnerException ?? e).Message); }
            Directory.CreateDirectory("Logs");
            File.WriteAllText(LogPath, report.ToString());
        }

        static string Switch(object player, bool on)
        {
            var t = player.GetType();
            var method = t.GetMethod(on ? "Activate" : "Deactivate", Any) ?? throw new Exception("UnityPlayer has no " + (on ? "Activate" : "Deactivate"));
            var parameters = method.GetParameters();
            var args = new object[parameters.Length];                       // (out error [, extra arguments])
            bool ok = (bool)method.Invoke(player, args);
            return ok ? "ok" : "refused: " + args[0];
        }

        [MenuItem("PortKit/Multiplayer/Activate Player 2")]
        public static void ActivateTwo()
        {
            var report = new StringBuilder();
            try
            {
                var players = Players();
                if (players.Length < 2) throw new Exception("there is no second player slot");
                report.AppendLine("activate player 2: " + Switch(players[1], true));
            }
            catch (Exception e) { report.AppendLine("FAILED: " + (e.InnerException ?? e).Message); }
            Write(report);
        }

        [MenuItem("PortKit/Multiplayer/Deactivate Players")]
        public static void DeactivateAll()
        {
            var report = new StringBuilder();
            try
            {
                var players = Players();
                for (int i = 1; i < players.Length; i++)
                {
                    string state = players[i].GetType().GetProperty("PlayerState", Any)?.GetValue(players[i])?.ToString();
                    if (state != "NotLaunched") report.AppendLine($"deactivate player {i + 1}: " + Switch(players[i], false));
                }
            }
            catch (Exception e) { report.AppendLine("FAILED: " + (e.InnerException ?? e).Message); }
            Write(report);
        }

        [MenuItem("PortKit/Multiplayer/Report")]
        public static void Report() => Write(new StringBuilder());
    }
}
