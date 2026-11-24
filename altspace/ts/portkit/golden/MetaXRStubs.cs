// Meta XR SDK stand-ins (OVRInput, OVRCameraRig, OVRManager) for a plain-Unity upstream built on Meta XR; compile with
// UnityStubs.cs. Taken from the mini golf port. Controller state is set by the harness; vibrations go to Golden.Record.
#pragma warning disable CS0108, CS0114, CS0169, CS0414, CS0649, CS0660, CS0661, CS8618, CS8625, CS8600, CS8602, CS8603, CS8604
using System;
using System.Collections.Generic;

// ---- the Meta XR SDK -----------------------------------------------------------------------------------------------
public class OVRCameraRig : UnityEngine.MonoBehaviour
{
    public UnityEngine.Transform centerEyeAnchor, trackingSpace, leftHandAnchor, rightHandAnchor, leftControllerAnchor, rightControllerAnchor;
}

public class OVRManager : UnityEngine.MonoBehaviour
{
    public enum TrackingOrigin { EyeLevel, FloorLevel, Stage }
    public TrackingOrigin trackingOriginType;
}

/// <summary>Controller state the harness sets frame by frame; vibrations go to Golden.Record.</summary>
public static class OVRInput
{
    public enum Controller { None = 0, LTouch = 1, RTouch = 2, Touch = 3 }
    public enum Button { One, Two, Start, PrimaryIndexTrigger, PrimaryHandTrigger }
    public enum RawButton { Start }
    public enum Axis1D { PrimaryIndexTrigger, PrimaryHandTrigger }
    public enum Axis2D { PrimaryThumbstick }

    public static readonly Dictionary<Controller, float> Trigger = new Dictionary<Controller, float>();
    public static readonly HashSet<string> Held = new HashSet<string>();
    public static readonly HashSet<string> Down = new HashSet<string>();
    public static readonly HashSet<string> Up = new HashSet<string>();

    public static float Get(Axis1D axis, Controller c) => axis == Axis1D.PrimaryIndexTrigger && Trigger.TryGetValue(c, out var v) ? v : 0f;
    public static UnityEngine.Vector2 Get(Axis2D axis, Controller c) => new UnityEngine.Vector2(0, 0);
    public static bool Get(Button b, Controller c) => Held.Contains(b + "/" + c);
    public static bool GetDown(Button b, Controller c) => Down.Contains(b + "/" + c);
    public static bool GetDown(RawButton b, Controller c) => false;
    public static bool GetUp(Button b, Controller c) => Up.Contains(b + "/" + c);
    public static void SetControllerVibration(float frequency, float amplitude, Controller c) { Golden.Record.Note($"Vibrate {c} {frequency:R} {amplitude:R}"); }
}
