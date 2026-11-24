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
