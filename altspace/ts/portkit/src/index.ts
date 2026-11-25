// What a game port imports. The platform adapters are separate on purpose:
//   portkit/src/platform/bs.ts     the app (only a built script's entry imports it)
//   portkit/src/platform/fake.ts   the fake room, for tests

export { Behaviour, NetworkEventTarget } from "./behaviour.ts";
export type {
  BehaviourClass,
  DebugView,
  DeserializationResult,
  InputView,
  NetworkEventTargetName,
  ProtectedView,
  RandomView,
  SerializationResult,
  TimeView,
  WriteRefusal,
} from "./behaviour.ts";
export { leafBudget, validateBindings } from "./bindings.ts";
export type { BindingBehaviour, BindingEvent, BindingObject, Bindings, LeafBudget } from "./bindings.ts";
export { boot, GameRuntime, RUNTIME_VERSION } from "./boot.ts";
export { DEFAULT_OPTIONS } from "./core.ts";
export type { RuntimeOptions } from "./core.ts";
export { decodeRelayArg, encodeRelayArg, materialProperty, parseRelayPayload, relayNumber } from "./host.ts";
export type { HostActions } from "./host.ts";
export { GameInstance } from "./instance.ts";
export type { GameDefinition } from "./instance.ts";
export { attachId, holderName, instanceKeyFor, networkId, relayKey, sanitizeInstanceKey, statePrefix } from "./names.ts";
export { Networking, Utilities } from "./networking.ts";
export type { StartKind } from "./networking.ts";
export { Persistence } from "./persistence.ts";
export type { PlayerDataView } from "./peruser.ts";
export { Player } from "./players.ts";
export { ObjectPool } from "./pool.ts";
export type { CandidateRule } from "./referee.ts";
export { AnimatorRef, AudioClipRef, AudioSourceRef, ComponentRef, GameObject, ParticleSystemRef, RendererRef, TextRef, Transform } from "./scene.ts";
export { TICK_MS, TICK_SECONDS } from "./scheduler.ts";
export { Draw, Secrets } from "./secrets.ts";
export type { Commitment, DealCheck, DealState, DrawState, DrawStatus, Opening } from "./secrets.ts";
export { sha256, sha256Text } from "./sha256.ts";
export { Button, Hand } from "./types.ts";
export type { Ability, BlockableControl, ButtonName, HandSide, HostEventDetail, HostEventKind, InputEvent, LocalPoses, Platform, Pose, RayHit } from "./types.ts";
export { canonicalJson, fnv1a } from "./util.ts";
export { Color, Curve, decodeValue, encodeValue, intDiv, Mathf, Quaternion, UnityRandom, Vector2, Vector3, Vector4 } from "./values.ts";
