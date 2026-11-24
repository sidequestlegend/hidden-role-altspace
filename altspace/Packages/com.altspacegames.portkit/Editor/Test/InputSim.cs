using System;
using System.Collections;
using System.Globalization;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace PortKit
{
    /// <summary>
    /// Input for Play-mode tests, through the SDK's real desktop player: a mouse and a keyboard of the test's own are
    /// added to the Input System and fed state events. The SDK's desktop controller reads Mouse.current and
    /// Keyboard.current, casts its own rays, and raises the page's click, grab, drop and button events itself, exactly
    /// as it does for a person at the editor. So what a test learns this way holds for Play mode's input path; it says
    /// nothing about controllers in the headset.
    ///
    /// Commands for the page (PKTEST CMD &lt;id&gt; ...), each answered when it has finished:
    ///   pointer &lt;x&gt; &lt;y&gt; &lt;z&gt;                move the mouse over a world point (answers with the screen point)
    ///   click &lt;x&gt; &lt;y&gt; &lt;z&gt;                  move there, press and release the left button
    ///   press &lt;x&gt; &lt;y&gt; &lt;z&gt;                  move there and hold the left button down (a grab)
    ///   release                            let the left button go (a drop)
    ///   key &lt;Key&gt; tap|down|up              a key of UnityEngine.InputSystem.Key, e.g. Digit3 (the held object's trigger)
    ///   look &lt;x&gt; &lt;y&gt; &lt;z&gt;                   turn the desktop player's camera to face a world point
    ///   wait &lt;frames&gt;
    ///   type &lt;holder&gt; &lt;path&gt; &lt;text&gt;     characters into the TMP_InputField at path under the kit root, each through the
    ///                                    field's own key handling (ProcessEvent, as uGUI's module hands it a key event): the
    ///                                    test's keyboard cannot type, since TMP_InputField reads IMGUI events, which Input
    ///                                    System state events do not make. Click the field first (focus) and elsewhere after,
    ///                                    as a person does. Text is percent-coded (%20 a space, %25 a percent sign). From rp-toolkit.
    ///   walk &lt;x&gt; &lt;z&gt; [speed]               the desktop player walks to a world point as a body would: a capsule (radius 0.25 m,
    ///                                    1.7 m tall, steps of 0.3 m) at walking speed (default 3 m/s) that slides along what
    ///                                    it meets and stands still while the page has movement locked. The SDK's desktop
    ///                                    player is a fly camera that passes through walls; this answers "ok reached" or
    ///                                    "blocked at ... by ...". From hidden-role.
    ///   where                            the desktop player's feet and camera
    ///   place &lt;x&gt; &lt;y&gt; &lt;z&gt;                  put the desktop player's feet there
    /// Pointer commands first move the mouse one pixel aside: the SDK's desktop pointer acts on its last target again if
    /// the mouse has not moved (found by hidden-role: a Start click once pressed Stop).
    /// The editor may be in the background: the Input System is told to keep taking input without focus for the test,
    /// and the machine's own mouse and keyboard are switched off in this editor until the test ends.
    /// </summary>
    public static class InputSim
    {
        static Mouse mouse;
        static Keyboard keyboard;
        static Vector2 position;
        static bool leftDown;
        static InputSettings.BackgroundBehavior? savedBackground;
        static InputSettings.EditorInputBehaviorInPlayMode? savedEditorBehaviour;

        internal static void Register()
        {
            KitPlayTest.Commands["pointer"] = (a, reply) => Pointer(a, reply, 0);
            KitPlayTest.Commands["click"] = (a, reply) => Pointer(a, reply, 1);
            KitPlayTest.Commands["press"] = (a, reply) => Pointer(a, reply, 2);
            KitPlayTest.Commands["release"] = (a, reply) => ReleaseButton(reply);
            KitPlayTest.Commands["key"] = KeyCommand;
            KitPlayTest.Commands["look"] = Look;
            KitPlayTest.Commands["wait"] = (a, reply) => Frames(int.Parse(a[0], CultureInfo.InvariantCulture));
            KitPlayTest.Commands["type"] = Type;
            KitPlayTest.Commands["walk"] = Walk;
            KitPlayTest.Commands["where"] = (a, reply) => { reply(Where()); return null; };
            KitPlayTest.Commands["place"] = (a, reply) =>
            {
                var player = DesktopPlayer();
                if (player == null) { reply("error: no desktop player"); return null; }
                player.position = Point(a);
                reply("ok " + Where());
                return null;
            };
        }

        static void Ensure()
        {
            if (mouse != null && mouse.added && keyboard != null && keyboard.added) return;
            var settings = InputSystem.settings;
            savedBackground = settings.backgroundBehavior;
            savedEditorBehaviour = settings.editorInputBehaviorInPlayMode;
            settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            // The machine's own mouse and keyboard are switched off for the test: whenever one of them reports anything
            // (somebody working at this computer) it becomes Mouse.current again, and the SDK's player then sees a button
            // that is not held. Seen as grabs that let go by themselves in some runs and not in others.
            silenced.Clear();
            foreach (var device in InputSystem.devices.ToArray())
                if ((device is Pointer || device is Keyboard) && device.enabled)
                {
                    InputSystem.DisableDevice(device);
                    silenced.Add(device);
                }
            mouse = InputSystem.AddDevice<Mouse>("PortKitTestMouse");
            keyboard = InputSystem.AddDevice<Keyboard>("PortKitTestKeyboard");
            leftDown = false;
        }

        static readonly System.Collections.Generic.List<InputDevice> silenced = new System.Collections.Generic.List<InputDevice>();

        /// <summary>Takes the test's devices away and puts the Input System's settings back.</summary>
        internal static void Release()
        {
            try
            {
                if (mouse != null && mouse.added) InputSystem.RemoveDevice(mouse);
                if (keyboard != null && keyboard.added) InputSystem.RemoveDevice(keyboard);
                foreach (var device in silenced)
                    if (device != null && device.added) InputSystem.EnableDevice(device);
                silenced.Clear();
                if (savedBackground != null) InputSystem.settings.backgroundBehavior = savedBackground.Value;
                if (savedEditorBehaviour != null) InputSystem.settings.editorInputBehaviorInPlayMode = savedEditorBehaviour.Value;
            }
            catch (Exception) { /* Play mode is ending */ }
            mouse = null;
            keyboard = null;
            savedBackground = null;
            savedEditorBehaviour = null;
        }

        static IEnumerator Frames(int count)
        {
            int until = Time.frameCount + Mathf.Max(1, count);
            double giveUp = UnityEditor.EditorApplication.timeSinceStartup + 20;
            while (Time.frameCount < until && UnityEditor.EditorApplication.timeSinceStartup < giveUp) yield return null;
        }

        static void SendMouse()
        {
            var state = new MouseState { position = position };
            if (leftDown) state = state.WithButton(MouseButton.Left, true);
            mouse.MakeCurrent();
            InputSystem.QueueStateEvent(mouse, state);
        }

        static Vector3 Point(string[] a) =>
            new Vector3(float.Parse(a[0], CultureInfo.InvariantCulture), float.Parse(a[1], CultureInfo.InvariantCulture), float.Parse(a[2], CultureInfo.InvariantCulture));

        static Camera PlayerCamera() => Camera.main != null ? Camera.main : UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None).FirstOrDefault(c => c.isActiveAndEnabled);

        static IEnumerator Pointer(string[] a, Action<string> reply, int mode)
        {
            Ensure();
            var camera = PlayerCamera();
            if (camera == null) { reply("error: no camera"); yield break; }
            var screen = camera.WorldToScreenPoint(Point(a));
            if (screen.z <= 0f || !camera.pixelRect.Contains(screen))
            {
                reply(FormattableString.Invariant($"error: the point is not in view (screen {screen.x:F0},{screen.y:F0}, depth {screen.z:F2}, view {camera.pixelRect.width:F0}x{camera.pixelRect.height:F0})"));
                yield break;
            }
            // a pixel aside first: the SDK's pointer takes a move to pick its target again (a still mouse keeps the last one)
            position = new Vector2(screen.x + (screen.x >= 1f ? -1f : 1f), screen.y);
            SendMouse();
            var nudge = Frames(2);
            while (nudge.MoveNext()) yield return null;
            position = new Vector2(screen.x, screen.y);
            SendMouse();
            var wait = Frames(3);
            while (wait.MoveNext()) yield return null;
            if (mode >= 1)
            {
                leftDown = true;
                SendMouse();
                wait = Frames(3);
                while (wait.MoveNext()) yield return null;
            }
            if (mode == 1)
            {
                leftDown = false;
                SendMouse();
                wait = Frames(3);
                while (wait.MoveNext()) yield return null;
            }
            reply(FormattableString.Invariant($"ok screen {screen.x:F0},{screen.y:F0} of {camera.pixelRect.width:F0}x{camera.pixelRect.height:F0}"));
        }

        static IEnumerator ReleaseButton(Action<string> reply)
        {
            Ensure();
            leftDown = false;
            SendMouse();
            var wait = Frames(3);
            while (wait.MoveNext()) yield return null;
            reply("ok");
        }

        static IEnumerator KeyCommand(string[] a, Action<string> reply)
        {
            Ensure();
            if (!Enum.TryParse(a[0], true, out Key key)) { reply("error: no key called " + a[0]); yield break; }
            string how = a.Length > 1 ? a[1] : "tap";
            keyboard.MakeCurrent();
            if (how == "tap" || how == "down")
            {
                InputSystem.QueueStateEvent(keyboard, new KeyboardState(key));
                var wait = Frames(3);
                while (wait.MoveNext()) yield return null;
                // a tap is held for a third of a second: what a held object's buttons do is worked out in physics steps,
                // and a few fast frames can pass without one
                double until = UnityEditor.EditorApplication.timeSinceStartup + (how == "tap" ? 0.35 : 0.0);
                while (UnityEditor.EditorApplication.timeSinceStartup < until) yield return null;
            }
            if (how == "tap" || how == "up")
            {
                InputSystem.QueueStateEvent(keyboard, new KeyboardState());
                var wait = Frames(3);
                while (wait.MoveNext()) yield return null;
            }
            reply("ok");
        }

        static IEnumerator Type(string[] a, Action<string> reply)
        {
            if (a.Length < 3) { reply("error: type <holder> <path> <text>"); yield break; }
            var t = KitProbe.Find(a[0], a[1]);
            var field = t != null ? t.GetComponent<TMPro.TMP_InputField>() : null;
            if (field == null) { reply("error: no input field at " + a[1]); yield break; }
            bool focused = field.isFocused;
            string text = Uri.UnescapeDataString(string.Join(" ", a.Skip(2)));
            foreach (char c in text)
            {
                field.ProcessEvent(new Event { type = EventType.KeyDown, character = c, keyCode = KeyCode.None });
                yield return null;
            }
            field.ForceLabelUpdate();
            reply($"ok typed {text.Length}, focused before {focused}, now '{field.text}'");
        }

        // ---- walking (lifted from hidden-role's HiddenRoleTools) ----
        public const float BodyRadius = 0.25f, BodyHeight = 1.7f, StepUp = 0.3f;
        /// <summary>What a body meets: every layer but UI (5), Menu (22) and the player's own (23, 24).</summary>
        public const int SolidMask = ~((1 << 5) | (1 << 22) | (1 << 23) | (1 << 24));

        /// <summary>The SDK's desktop player (BS.BSDesktopController.Instance), found by name.</summary>
        static Transform DesktopPlayer()
        {
            var type = GraphTypes.Find("BS.BSDesktopController");
            var instance = type?.GetProperty("Instance", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)?.GetValue(null) as Component;
            return instance != null ? instance.transform : null;
        }

        static string F2(float v) => v.ToString("F2", CultureInfo.InvariantCulture);

        static string Where()
        {
            var p = DesktopPlayer();
            if (p == null) return "error: no desktop player";
            var cam = PlayerCamera();
            return $"{F2(p.position.x)} {F2(p.position.y)} {F2(p.position.z)}" + (cam != null ? $" camera {F2(cam.transform.position.x)} {F2(cam.transform.position.y)} {F2(cam.transform.position.z)}" : "");
        }

        /// <summary>The client's movement lock (scene.SetCanMove), as the SDK's own player reads it.</summary>
        static bool CanMove()
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(asm => asm.GetType("SideQuest.FlexaBody.ActionsSystem", false)).FirstOrDefault(t => t != null);
            var field = type?.GetField("canMove", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
            return field == null || (bool)field.GetValue(null);
        }

        static Vector3 Flat(Vector3 v) => new Vector3(v.x, 0, v.z);

        static IEnumerator Walk(string[] args, Action<string> reply)
        {
            var player = DesktopPlayer();
            if (player == null) { reply("error: no desktop player"); yield break; }
            var target = new Vector3(float.Parse(args[0], CultureInfo.InvariantCulture), 0, float.Parse(args[1], CultureInfo.InvariantCulture));
            float speed = args.Length > 2 ? float.Parse(args[2], CultureInfo.InvariantCulture) : 3f;
            double last = UnityEditor.EditorApplication.timeSinceStartup;
            double give = last + Vector3.Distance(Flat(player.position), target) / speed * 2 + 6;
            double lastProgress = last;
            float best = float.MaxValue;
            string blocker = "";
            while (true)
            {
                yield return null;
                if (!UnityEditor.EditorApplication.isPlaying || player == null) { reply("error: Play mode ended"); yield break; }
                double now = UnityEditor.EditorApplication.timeSinceStartup;
                float dt = Mathf.Min(0.1f, (float)(now - last));
                last = now;
                var here = player.position;
                var flat = target - Flat(here);
                flat.y = 0;
                float left = flat.magnitude;
                if (left < 0.12f) { reply($"ok reached {F2(here.x)} {F2(here.z)}"); yield break; }
                if (left < best - 0.02f) { best = left; lastProgress = now; }
                if (now - lastProgress > 1.5 || now > give)
                {
                    reply($"blocked at {F2(here.x)} {F2(here.z)}, {F2(left)} m short" + (blocker.Length > 0 ? " by " + blocker : "") + (CanMove() ? "" : " (movement locked)"));
                    yield break;
                }
                if (!CanMove()) continue;
                var move = flat.normalized * Mathf.Min(left, speed * dt);
                // move and slide: up to three tries along what was hit
                for (int i = 0; i < 3 && move.sqrMagnitude > 1e-8f; i++)
                {
                    var a = here + Vector3.up * (StepUp + BodyRadius);
                    var b = here + Vector3.up * (BodyHeight - BodyRadius);
                    if (Physics.CapsuleCast(a, b, BodyRadius * 0.98f, move.normalized, out var hit, move.magnitude + 0.01f, SolidMask, QueryTriggerInteraction.Ignore))
                    {
                        blocker = hit.collider.name + " " + hit.collider.GetType().Name;
                        float go = Mathf.Max(0, hit.distance - 0.01f);
                        here += move.normalized * go;
                        var rest = move - move.normalized * go;
                        var normal = hit.normal;
                        normal.y = 0;
                        move = normal.sqrMagnitude > 1e-6f ? Vector3.ProjectOnPlane(rest, normal.normalized) : Vector3.zero;
                    }
                    else
                    {
                        here += move;
                        move = Vector3.zero;
                    }
                }
                player.position = here;
            }
        }

        static IEnumerator Look(string[] a, Action<string> reply)
        {
            var camera = PlayerCamera();
            if (camera == null) { reply("error: no camera"); yield break; }
            // the desktop player turns its body about Y and its head about X: face the point with both
            var target = Point(a);
            var body = camera.transform.root;
            var flat = target - camera.transform.position;
            flat.y = 0f;
            if (flat.sqrMagnitude > 1e-6f) body.rotation = Quaternion.LookRotation(flat.normalized, Vector3.up);
            camera.transform.LookAt(target);
            var wait = Frames(2);
            while (wait.MoveNext()) yield return null;
            reply(FormattableString.Invariant($"ok camera at {camera.transform.position.x:F2},{camera.transform.position.y:F2},{camera.transform.position.z:F2}"));
        }
    }
}
