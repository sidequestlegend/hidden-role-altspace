/*!
 * hidden-role (working title): a hidden-role station game for Altspace snippets.
 * Rules translated from MIT-licensed C# by chocowriter and dmjdesu; runtime portkit (MIT).
 * Licence texts and credits: see the source repository's README.
 */
/* pk-hidden-role.js: portkit runtime with the rules of 'hidden-role' (protocol pk1, bindings dfa38295e9ffc5a8d53a3da5becbd1d091094fdc). Built file: do not edit. */
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // portkit/src/behaviour.ts
  var LINK = /* @__PURE__ */ Symbol("pk1.link");
  function linkBehaviour(behaviour, link) {
    Object.defineProperty(behaviour, LINK, { value: link, enumerable: false, configurable: true, writable: false });
  }
  function linkOf(behaviour) {
    const link = behaviour[LINK];
    if (!link) throw new Error("this behaviour is not part of a running instance yet (do not use the runtime in a constructor or a field initialiser)");
    return link;
  }
  var Behaviour = class {
    // ---- what the runtime provides ------------------------------------------------------------------------------
    /** The id this behaviour has in bindings.json. */
    get behaviourId() {
      return linkOf(this).id;
    }
    get gameObject() {
      return linkOf(this).gameObject;
    }
    get transform() {
      return linkOf(this).gameObject.transform;
    }
    get Networking() {
      return linkOf(this).networking;
    }
    get Time() {
      return linkOf(this).time;
    }
    get Random() {
      return linkOf(this).random;
    }
    get Debug() {
      return linkOf(this).debug;
    }
    /** Commit / reveal, fair draws and sealed delivery. */
    get Secrets() {
      return linkOf(this).secrets;
    }
    /** Per-device saved data for the local player (localStorage). */
    get Storage() {
      return linkOf(this).storage;
    }
    /** Text, animator parameters, particles and colours on kit objects. */
    get Host() {
      return linkOf(this).host;
    }
    /** The snippet element's attributes. */
    get Settings() {
      return linkOf(this).settings;
    }
    /** Per-player saved values everyone present can read (VRChat: PlayerData). */
    get PlayerData() {
      return linkOf(this).playerData;
    }
    /** Buttons, thumbsticks, triggers, keys, head and hand poses, haptics, teleport. */
    get Input() {
      return linkOf(this).input;
    }
    /** Values only the world's owner and moderators can write. */
    get Protected() {
      return linkOf(this).protectedValues;
    }
    /**
     * For a per-player behaviour: the player it belongs to. Null on an ordinary behaviour. An upstream field named
     * `Player` would hide it: such a port renames the field (the convention: `upstreamPlayer`) or reads `OwnerPlayer`.
     */
    get Player() {
      return linkOf(this).player;
    }
    /** The same as `Player`, under a name no upstream field is likely to use. */
    get OwnerPlayer() {
      return linkOf(this).player;
    }
    /**
     * One object shared by every instance of this game on the page (two tables of one game keep one chip balance
     * here). Page memory only: not synced, not saved, gone when the page reloads (use Storage for that).
     */
    get Shared() {
      return linkOf(this).shared;
    }
    /** This instance's key (the `room` / `instance` attribute, or the element's index): `pk1.<slug>.<key>`. */
    get InstanceKey() {
      return linkOf(this).instanceKey;
    }
    /**
     * This behaviour's own click reach in metres, overriding the bindings' `reach`, the class's `interactReach` and
     * the game's default (a snippet setting, for example). Undefined: those apply. 0: any distance.
     */
    get InteractReach() {
      return linkOf(this).reach.get(this);
    }
    set InteractReach(metres) {
      if (metres === void 0) linkOf(this).reach.delete(this);
      else linkOf(this).reach.set(this, metres);
    }
    // ---- calls --------------------------------------------------------------------------------------------------
    /** Sends the synced fields. Only the owner's request does anything; it goes out at the end of the tick. */
    RequestSerialization() {
      linkOf(this).requestSerialization();
    }
    SendCustomEvent(name) {
      const fn = this[name];
      if (typeof fn === "function") fn.call(this);
      else this.Debug.LogWarning(`SendCustomEvent: ${this.behaviourId} has no method '${name}'`);
    }
    /**
     * Runs `name` on every client (All: here at once, then everywhere else) or only on the owner's. Arguments
     * must be JSON data or the value types of values.ts. While the method runs, `Networking.CallingPlayer` is
     * the sender: check it before honouring a request not everybody may make. `name` must be listed in the
     * class's `static networkCallable`.
     */
    SendCustomNetworkEvent(target, name, ...args) {
      linkOf(this).sendNetworkEvent(target, name, args);
    }
    /**
     * Asks the referee to run `name` on its copy of this behaviour, with `Networking.CallingPlayer` set to the
     * sender. Unlike a network event the request is numbered and kept until the referee acknowledges it: it is
     * run in order, survives a change of referee, and is never replayed to a late joiner. Returns its number.
     */
    SendCommand(name, ...args) {
      return linkOf(this).sendCommand(name, args);
    }
    SendCustomEventDelayedSeconds(name, seconds2) {
      linkOf(this).delaySeconds(name, seconds2);
    }
    /** A frame is one 50 ms tick here. */
    SendCustomEventDelayedFrames(name, frames) {
      linkOf(this).delayFrames(name, frames);
    }
    /** Another behaviour of this instance, by its bindings id. */
    FindBehaviour(id) {
      return linkOf(this).find(id);
    }
    /** Every ordinary behaviour of this instance with the given bindings type, in bindings order. */
    FindBehavioursOfType(type) {
      return linkOf(this).findByType(type);
    }
    /** The per-player behaviour of the given type that belongs to `player`. */
    PlayerBehaviour(player, type) {
      return linkOf(this).playerBehaviour(player, type);
    }
    /** One per-player behaviour of the given type for every player present, in player-id order. */
    PlayerBehaviours(type) {
      return linkOf(this).playerBehaviours(type);
    }
    /** One of the few things that are truly asynchronous: await it. */
    Raycast(origin, direction, maxDistance = 1e3, layerMask = -1) {
      return linkOf(this).raycast(origin, direction, maxDistance, layerMask);
    }
    /**
     * Has `method` called when a graph of the kit reports `name` through
     * `window.__pk1.event("<slug>:<inst>", "<name>", "<arg>|<arg>...")`. The method receives the arguments as strings.
     */
    RegisterGraphEvent(name, method) {
      linkOf(this).onGraphEvent(name, method);
    }
    // ---- overridable, as in UdonSharp ---------------------------------------------------------------------------
    Start() {
    }
    /**
     * Called after Start and after any saved values were applied, once this client knows what it came to: a new
     * game ("fresh"), saved state nobody was playing ("resumed": carry on or reset, as the game prefers), a game
     * others are playing ("joined"), or no game yet ("idle"). In a game with declared referee candidates it is
     * called again when the first referee is elected. The same value is `this.Networking.StartKind`.
     */
    OnInstanceStart(_kind) {
    }
    /** Called 20 times a second, only on classes that override it. `this.Time.deltaTime` is the time it covers. */
    Update() {
    }
    /** Synced fields were just replaced by another player's values. Not called for the owner's own writes. */
    OnDeserialization(_result) {
    }
    OnPreSerialization() {
    }
    /** `success` is false when the room refused the write (see OnWriteRefused for why). */
    OnPostSerialization(_result) {
    }
    OnOwnershipTransferred(_player) {
    }
    OnPlayerJoined(_player) {
    }
    OnPlayerLeft(_player) {
    }
    /** A player's saved data and per-player behaviours are loaded and published (VRChat: OnPlayerRestored). */
    OnPlayerRestored(_player) {
    }
    /** Values in a player's PlayerData changed; `keys` names them. */
    OnPlayerDataUpdated(_player, _keys) {
    }
    /** The room refused something this behaviour wrote. Also reported through OnPostSerialization for fields. */
    OnWriteRefused(_refusal) {
    }
    /** The referee has run the command this behaviour sent with that number. */
    OnCommandAcknowledged(_number) {
    }
    /** A player's fair draw under `label` changed state (see Secrets.beginDraw). Called on every behaviour that overrides it. */
    OnDrawChanged(_player, _label, _state) {
    }
    /** A protected value changed. Called on every behaviour that overrides it. */
    OnProtectedChanged(_key) {
    }
    /**
     * The referee changed (VRChat: OnMasterTransferred). Null when there is none left (a game with declared
     * candidates and nobody offering). A game with hidden information may void its match here: the new referee
     * does not know what the old one dealt.
     */
    OnMasterTransferred(_newMaster) {
    }
    /** A controller button of the local player went down or came up. Called on every behaviour that overrides it. */
    OnButtonPressed(_button, _side) {
    }
    OnButtonReleased(_button, _side) {
    }
    /** A key went down or came up; `key` is the Unity KeyCode name. */
    OnKeyPressed(_key) {
    }
    OnKeyReleased(_key) {
    }
    /** The local player clicked this behaviour's object. */
    Interact() {
    }
    OnPickup() {
    }
    OnDrop() {
    }
    /** The instance is going away (its element left the page), or this per-player behaviour's player left. */
    OnDestroy() {
    }
  };
  /** Names of the fields that are synced. Values must be JSON data, arrays of it, or the value types of values.ts. */
  __publicField(Behaviour, "synced", []);
  /** "manual": sent by RequestSerialization(). "continuous": sent when changed, a few times a second. */
  __publicField(Behaviour, "syncMode", "manual");
  /**
   * UdonSharp's [FieldChangeCallback]: synced field name -> the property to assign instead. When a received
   * value differs from the field's current one, the property's setter is called with it (and must store it);
   * local code gets the same effect by assigning through the property.
   *
   *   static synced = ["_open"];
   *   static fieldChangeCallbacks = { _open: "Open" };
   *   _open = false;
   *   get Open() { return this._open; }
   *   set Open(value: boolean) { this._open = value; this.door.SetActive(!value); }
   */
  __publicField(Behaviour, "fieldChangeCallbacks", {});
  /**
   * True for a behaviour that exists once per player (VRChat: a PlayerObject). It is made when the player joins
   * and dropped when they leave, that player owns it for good, and its synced fields travel in their user state.
   */
  __publicField(Behaviour, "perPlayer", false);
  /** For a per-player behaviour: its synced fields are saved on the device and put back on the next visit. */
  __publicField(Behaviour, "persistent", false);
  /**
   * Metres from the nearest of the local head and hands within which a click counts as Interact() (or as a bound
   * click). 0 means any distance. A behaviour can change its own at run time with `InteractReach`.
   */
  __publicField(Behaviour, "interactReach", 0);
  /**
   * The methods another client may run on this behaviour: by SendCustomNetworkEvent, or by SendCommand on the
   * referee. Nothing else can be called from the network (a modified client names any method it likes), and a
   * name starting with `_` never can. A subclass's list adds to its parent's.
   *
   *   static networkCallable = ["StartGame", "PlaceBid"];
   */
  __publicField(Behaviour, "networkCallable", []);

  // portkit/src/names.ts
  var TAG = "pk1";
  function sanitizeInstanceKey(raw) {
    if (!raw) return "";
    return raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "");
  }
  function isValidSlug(slug) {
    return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
  }
  function instanceKeyFor(attrs, indexAmongSameName) {
    return sanitizeInstanceKey(attrs.room) || sanitizeInstanceKey(attrs.instance) || String(indexAmongSameName);
  }
  function holderName(slug, inst) {
    return `${TAG}:${slug}:${inst}`;
  }
  function relayKey(slug, inst) {
    return `${slug}:${inst}`;
  }
  function networkId(slug, inst, objKey) {
    return `${TAG}/${slug}/${inst}/${objKey}`;
  }
  function statePrefix(slug, inst) {
    return `${TAG}.${slug}.${inst}`;
  }
  function storagePrefix(slug, inst, uid) {
    return `${TAG}.${slug}.${inst}.${uid}.`;
  }
  function isPathSegment(segment) {
    return /^[A-Za-z0-9_\-@]{1,64}$/.test(segment);
  }
  function makeEnvelope(slug, inst, type, fields) {
    return { pk: 1, g: slug, i: inst, t: type, ...fields };
  }

  // portkit/src/util.ts
  function utf8Length(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) bytes += 1;
      else if (c < 2048) bytes += 2;
      else if (c >= 55296 && c <= 56319 && i + 1 < text.length && (text.charCodeAt(i + 1) & 64512) === 56320) {
        bytes += 4;
        i++;
      } else bytes += 3;
    }
    return bytes;
  }
  function utf8Encode(text) {
    const out = new Uint8Array(utf8Length(text));
    let o = 0;
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < text.length && (text.charCodeAt(i + 1) & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (text.charCodeAt(++i) - 56320);
      } else if (c >= 55296 && c <= 57343) c = 65533;
      if (c < 128) out[o++] = c;
      else if (c < 2048) {
        out[o++] = 192 | c >> 6;
        out[o++] = 128 | c & 63;
      } else if (c < 65536) {
        out[o++] = 224 | c >> 12;
        out[o++] = 128 | c >> 6 & 63;
        out[o++] = 128 | c & 63;
      } else {
        out[o++] = 240 | c >> 18;
        out[o++] = 128 | c >> 12 & 63;
        out[o++] = 128 | c >> 6 & 63;
        out[o++] = 128 | c & 63;
      }
    }
    return out;
  }
  function utf8Decode(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i++];
      let c;
      if (b < 128) c = b;
      else if (b < 224) c = (b & 31) << 6 | bytes[i++] & 63;
      else if (b < 240) {
        c = (b & 15) << 12 | (bytes[i] & 63) << 6 | bytes[i + 1] & 63;
        i += 2;
      } else {
        c = (b & 7) << 18 | (bytes[i] & 63) << 12 | (bytes[i + 1] & 63) << 6 | bytes[i + 2] & 63;
        i += 3;
      }
      out += String.fromCodePoint(c);
    }
    return out;
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function toBase64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64[a >> 2] + B64[(a & 3) << 4 | b >> 4];
      if (i + 1 < bytes.length) out += B64[(b & 15) << 2 | c >> 6];
      if (i + 2 < bytes.length) out += B64[c & 63];
    }
    return out;
  }
  function fromBase64(text) {
    const clean = text.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let o = 0;
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < clean.length; i++) {
      let v = B64.indexOf(clean[i]);
      if (v < 0) v = clean[i] === "+" ? 62 : clean[i] === "/" ? 63 : -1;
      if (v < 0) throw new Error("bad base64 character");
      buffer = buffer << 6 | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = buffer >> bits & 255;
      }
    }
    return out.subarray(0, o);
  }
  function fnv1a(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  function canonicalJson(value) {
    return JSON.stringify(sortKeys(value));
  }
  function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
      return out;
    }
    return value;
  }
  function asciiJson(value) {
    const json = JSON.stringify(value);
    let out = "";
    let from = 0;
    for (let i = 0; i < json.length; i++) {
      const code = json.charCodeAt(i);
      if (code !== 124 && code < 127) continue;
      out += json.slice(from, i) + BACKSLASH + "u" + code.toString(16).padStart(4, "0");
      from = i + 1;
    }
    return from === 0 ? json : out + json.slice(from);
  }
  var BACKSLASH = String.fromCharCode(92);
  function jsonLeafBytes(text) {
    let bytes = 2;
    for (let i = 0; i < text.length; i++) bytes += leafCharBytes(text, i);
    return bytes;
  }
  function leafCharBytes(text, i) {
    const c = text.charCodeAt(i);
    if (c === 34 || c === 92) return 2;
    if (c < 32) return c === 8 || c === 9 || c === 10 || c === 12 || c === 13 ? 2 : 6;
    if (c < 128) return 1;
    if (c < 2048) return 2;
    if (c >= 56320 && c <= 57343) return i > 0 && (text.charCodeAt(i - 1) & 64512) === 55296 ? 0 : 3;
    if (c >= 55296 && c <= 56319) return i + 1 < text.length && (text.charCodeAt(i + 1) & 64512) === 56320 ? 4 : 3;
    return 3;
  }
  function safeParse(text) {
    if (typeof text !== "string" || text.length === 0) return void 0;
    try {
      return JSON.parse(text);
    } catch {
      return void 0;
    }
  }
  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function deferred() {
    let resolveFn;
    const d = {
      promise: new Promise((resolve) => {
        resolveFn = resolve;
      }),
      resolve(value) {
        if (d.settled) return;
        d.settled = true;
        resolveFn(value);
      },
      settled: false
    };
    return d;
  }

  // portkit/src/values.ts
  var Vector2 = class _Vector2 {
    constructor(x = 0, y = 0) {
      __publicField(this, "x");
      __publicField(this, "y");
      this.x = x;
      this.y = y;
    }
    static get zero() {
      return new _Vector2(0, 0);
    }
    static get one() {
      return new _Vector2(1, 1);
    }
    static get up() {
      return new _Vector2(0, 1);
    }
    static get down() {
      return new _Vector2(0, -1);
    }
    static get left() {
      return new _Vector2(-1, 0);
    }
    static get right() {
      return new _Vector2(1, 0);
    }
    clone() {
      return new _Vector2(this.x, this.y);
    }
    add(o) {
      return new _Vector2(this.x + o.x, this.y + o.y);
    }
    sub(o) {
      return new _Vector2(this.x - o.x, this.y - o.y);
    }
    scale(k) {
      return new _Vector2(this.x * k, this.y * k);
    }
    /** C# `==` on Vector2 is an approximate comparison; this is the same test. */
    equals(o) {
      if (!o) return false;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      return dx * dx + dy * dy < 999999944e-19;
    }
    get magnitude() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    get sqrMagnitude() {
      return this.x * this.x + this.y * this.y;
    }
    get normalized() {
      const m = this.magnitude;
      return m > 1e-5 ? this.scale(1 / m) : _Vector2.zero;
    }
    static Distance(a, b) {
      return a.sub(b).magnitude;
    }
    static Dot(a, b) {
      return a.x * b.x + a.y * b.y;
    }
    static Lerp(a, b, t) {
      const k = Mathf.Clamp01(t);
      return new _Vector2(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
    }
    toString() {
      return `(${this.x}, ${this.y})`;
    }
  };
  var Vector3 = class _Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      __publicField(this, "x");
      __publicField(this, "y");
      __publicField(this, "z");
      this.x = x;
      this.y = y;
      this.z = z;
    }
    static get zero() {
      return new _Vector3(0, 0, 0);
    }
    static get one() {
      return new _Vector3(1, 1, 1);
    }
    static get up() {
      return new _Vector3(0, 1, 0);
    }
    static get down() {
      return new _Vector3(0, -1, 0);
    }
    static get left() {
      return new _Vector3(-1, 0, 0);
    }
    static get right() {
      return new _Vector3(1, 0, 0);
    }
    static get forward() {
      return new _Vector3(0, 0, 1);
    }
    static get back() {
      return new _Vector3(0, 0, -1);
    }
    clone() {
      return new _Vector3(this.x, this.y, this.z);
    }
    add(o) {
      return new _Vector3(this.x + o.x, this.y + o.y, this.z + o.z);
    }
    sub(o) {
      return new _Vector3(this.x - o.x, this.y - o.y, this.z - o.z);
    }
    scale(k) {
      return new _Vector3(this.x * k, this.y * k, this.z * k);
    }
    equals(o) {
      if (!o) return false;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const dz = this.z - o.z;
      return dx * dx + dy * dy + dz * dz < 999999944e-19;
    }
    get magnitude() {
      return Math.sqrt(this.sqrMagnitude);
    }
    get sqrMagnitude() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    get normalized() {
      const m = this.magnitude;
      return m > 1e-5 ? this.scale(1 / m) : _Vector3.zero;
    }
    static Distance(a, b) {
      return a.sub(b).magnitude;
    }
    /** Degrees between two directions, 0 to 180 (UnityEngine.Vector3.Angle; 0 when either is nearly zero). */
    static Angle(from, to) {
      const denominator = Math.sqrt(from.sqrMagnitude * to.sqrMagnitude);
      if (denominator < 1e-15) return 0;
      const dot = Mathf.Clamp(_Vector3.Dot(from, to) / denominator, -1, 1);
      return Math.acos(dot) * Mathf.Rad2Deg;
    }
    /** Reflects a direction off the plane with normal `inNormal` (UnityEngine.Vector3.Reflect). */
    static Reflect(inDirection, inNormal) {
      const factor = -2 * _Vector3.Dot(inNormal, inDirection);
      return new _Vector3(factor * inNormal.x + inDirection.x, factor * inNormal.y + inDirection.y, factor * inNormal.z + inDirection.z);
    }
    static Dot(a, b) {
      return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    static Cross(a, b) {
      return new _Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    }
    static Lerp(a, b, t) {
      const k = Mathf.Clamp01(t);
      return new _Vector3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    }
    static MoveTowards(current, target, maxDelta) {
      const d = target.sub(current);
      const m = d.magnitude;
      return m <= maxDelta || m === 0 ? target.clone() : current.add(d.scale(maxDelta / m));
    }
    toString() {
      return `(${this.x}, ${this.y}, ${this.z})`;
    }
  };
  var Quaternion = class _Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      __publicField(this, "x");
      __publicField(this, "y");
      __publicField(this, "z");
      __publicField(this, "w");
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    static get identity() {
      return new _Quaternion(0, 0, 0, 1);
    }
    clone() {
      return new _Quaternion(this.x, this.y, this.z, this.w);
    }
    /** Unity's Quaternion.Euler: degrees, applied in Z, X, Y order. */
    static Euler(x, y, z) {
      const hx = x * Mathf.Deg2Rad / 2;
      const hy = y * Mathf.Deg2Rad / 2;
      const hz = z * Mathf.Deg2Rad / 2;
      const sx = Math.sin(hx), cx = Math.cos(hx);
      const sy = Math.sin(hy), cy = Math.cos(hy);
      const sz = Math.sin(hz), cz = Math.cos(hz);
      return new _Quaternion(
        cy * sx * cz + sy * cx * sz,
        sy * cx * cz - cy * sx * sz,
        cy * cx * sz - sy * sx * cz,
        cy * cx * cz + sy * sx * sz
      );
    }
    static AngleAxis(degrees, axis) {
      const n = axis.normalized;
      const h = degrees * Mathf.Deg2Rad / 2;
      const s = Math.sin(h);
      return new _Quaternion(n.x * s, n.y * s, n.z * s, Math.cos(h));
    }
    /** this * o: rotate by o first, then by this (Unity's operator order). */
    mul(o) {
      return new _Quaternion(
        this.w * o.x + this.x * o.w + this.y * o.z - this.z * o.y,
        this.w * o.y + this.y * o.w + this.z * o.x - this.x * o.z,
        this.w * o.z + this.z * o.w + this.x * o.y - this.y * o.x,
        this.w * o.w - this.x * o.x - this.y * o.y - this.z * o.z
      );
    }
    /** this * v: the vector rotated by this quaternion. */
    rotate(v) {
      const { x, y, z, w } = this;
      const tx = 2 * (y * v.z - z * v.y);
      const ty = 2 * (z * v.x - x * v.z);
      const tz = 2 * (x * v.y - y * v.x);
      return new Vector3(v.x + w * tx + (y * tz - z * ty), v.y + w * ty + (z * tx - x * tz), v.z + w * tz + (x * ty - y * tx));
    }
    get inverse() {
      const n = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w || 1;
      return new _Quaternion(-this.x / n, -this.y / n, -this.z / n, this.w / n);
    }
    /** Degrees, each in [0, 360), in Unity's convention. */
    get eulerAngles() {
      const { x, y, z, w } = this;
      const sinX = 2 * (w * x - y * z);
      let ex, ey, ez;
      if (Math.abs(sinX) > 0.9999995) {
        ex = Math.sign(sinX) * Math.PI / 2;
        ey = 2 * Math.atan2(y, w);
        ez = 0;
      } else {
        ex = Math.asin(sinX);
        ey = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
        ez = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
      }
      const wrap = (r) => {
        const d = r * Mathf.Rad2Deg % 360;
        return d < 0 ? d + 360 : d;
      };
      return new Vector3(wrap(ex), wrap(ey), wrap(ez));
    }
    /** Degrees between two rotations (UnityEngine.Quaternion.Angle). */
    static Angle(a, b) {
      const dot = Math.min(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w), 1);
      return dot > 0.999999 ? 0 : Math.acos(dot) * 2 * Mathf.Rad2Deg;
    }
    /**
     * The rotation whose forward (Z) is `forward` and whose up is as close to `upwards` as it can be
     * (UnityEngine.Quaternion.LookRotation). A zero forward gives the identity.
     */
    static LookRotation(forward, upwards = new Vector3(0, 1, 0)) {
      const f2 = forward.normalized;
      if (f2.sqrMagnitude < 1e-12) return _Quaternion.identity;
      let r = Vector3.Cross(upwards, f2);
      if (r.sqrMagnitude < 1e-12) {
        const axis = Vector3.Cross(new Vector3(0, 0, 1), f2);
        if (axis.sqrMagnitude < 1e-12) return f2.z >= 0 ? _Quaternion.identity : new _Quaternion(0, 1, 0, 0);
        return _Quaternion.AngleAxis(Math.acos(Mathf.Clamp(f2.z, -1, 1)) * Mathf.Rad2Deg, axis);
      }
      r = r.normalized;
      const u = Vector3.Cross(f2, r);
      const m00 = r.x, m01 = u.x, m02 = f2.x;
      const m10 = r.y, m11 = u.y, m12 = f2.y;
      const m20 = r.z, m21 = u.z, m22 = f2.z;
      const trace = m00 + m11 + m22;
      let q;
      if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        q = new _Quaternion((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s);
      } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        q = new _Quaternion(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
      } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        q = new _Quaternion((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
      } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        q = new _Quaternion((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
      }
      return q;
    }
    static Slerp(a, b, t) {
      const k = Mathf.Clamp01(t);
      let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
      const s = dot < 0 ? -1 : 1;
      dot = Math.abs(dot);
      let wa, wb;
      if (dot > 0.9995) {
        wa = 1 - k;
        wb = k;
      } else {
        const theta = Math.acos(dot);
        const sin = Math.sin(theta);
        wa = Math.sin((1 - k) * theta) / sin;
        wb = Math.sin(k * theta) / sin;
      }
      wb *= s;
      const q = new _Quaternion(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb, a.w * wa + b.w * wb);
      const n = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
      return new _Quaternion(q.x / n, q.y / n, q.z / n, q.w / n);
    }
    equals(o) {
      if (!o) return false;
      return Math.abs(this.x * o.x + this.y * o.y + this.z * o.z + this.w * o.w) > 0.999999;
    }
    toString() {
      return `(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
    }
  };
  var Vector4 = class _Vector4 {
    constructor(x = 0, y = 0, z = 0, w = 0) {
      __publicField(this, "x");
      __publicField(this, "y");
      __publicField(this, "z");
      __publicField(this, "w");
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    clone() {
      return new _Vector4(this.x, this.y, this.z, this.w);
    }
    equals(o) {
      return !!o && this.x === o.x && this.y === o.y && this.z === o.z && this.w === o.w;
    }
  };
  var Color = class _Color {
    constructor(r = 0, g = 0, b = 0, a = 1) {
      __publicField(this, "r");
      __publicField(this, "g");
      __publicField(this, "b");
      __publicField(this, "a");
      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;
    }
    static get white() {
      return new _Color(1, 1, 1, 1);
    }
    static get black() {
      return new _Color(0, 0, 0, 1);
    }
    static get red() {
      return new _Color(1, 0, 0, 1);
    }
    static get green() {
      return new _Color(0, 1, 0, 1);
    }
    static get blue() {
      return new _Color(0, 0, 1, 1);
    }
    static get yellow() {
      return new _Color(1, 0.92156863, 0.015686275, 1);
    }
    static get clear() {
      return new _Color(0, 0, 0, 0);
    }
    static get cyan() {
      return new _Color(0, 1, 1, 1);
    }
    static get magenta() {
      return new _Color(1, 0, 1, 1);
    }
    static get gray() {
      return new _Color(0.5, 0.5, 0.5, 1);
    }
    static get grey() {
      return new _Color(0.5, 0.5, 0.5, 1);
    }
    /**
     * UnityEngine.Color.HSVToRGB, line for line: H, S, V in [0, 1]; with `hdr` false each channel is clamped to
     * [0, 1]. Alpha is 1. (Unity computes in single precision; this in double: the last digits can differ.)
     */
    static HSVToRGB(H, S, V, hdr = true) {
      const c = new _Color(1, 1, 1, 1);
      if (S === 0) {
        c.r = V;
        c.g = V;
        c.b = V;
      } else if (V === 0) {
        c.r = 0;
        c.g = 0;
        c.b = 0;
      } else {
        c.r = 0;
        c.g = 0;
        c.b = 0;
        const h = H * 6;
        const temp = Math.floor(h);
        const t = h - temp;
        const var1 = V * (1 - S);
        const var2 = V * (1 - S * t);
        const var3 = V * (1 - S * (1 - t));
        switch (temp) {
          case 0:
            c.r = V;
            c.g = var3;
            c.b = var1;
            break;
          case 1:
            c.r = var2;
            c.g = V;
            c.b = var1;
            break;
          case 2:
            c.r = var1;
            c.g = V;
            c.b = var3;
            break;
          case 3:
            c.r = var1;
            c.g = var2;
            c.b = V;
            break;
          case 4:
            c.r = var3;
            c.g = var1;
            c.b = V;
            break;
          case 5:
            c.r = V;
            c.g = var1;
            c.b = var2;
            break;
          case 6:
            c.r = V;
            c.g = var3;
            c.b = var1;
            break;
          case -1:
            c.r = V;
            c.g = var1;
            c.b = var2;
            break;
        }
        if (!hdr) {
          c.r = Mathf.Clamp01(c.r);
          c.g = Mathf.Clamp01(c.g);
          c.b = Mathf.Clamp01(c.b);
        }
      }
      return c;
    }
    /** UnityEngine.Color.RGBToHSV: [H, S, V], each in [0, 1]. */
    static RGBToHSV(color) {
      const { r, g, b } = color;
      const rgbToHue = (offset, dominant, c1, c2) => {
        const V = dominant;
        if (V === 0) return [0, 0, 0];
        const min = c1 > c2 ? c2 : c1;
        const delta = V - min;
        if (delta === 0) return [0, 0, V];
        const S = delta / V;
        let H = offset + (c1 - c2) / delta;
        H /= 6;
        if (H < 0) H += 1;
        return [H, S, V];
      };
      if (b > g && b > r) return rgbToHue(4, b, r, g);
      if (g > r) return rgbToHue(2, g, b, r);
      return rgbToHue(0, r, g, b);
    }
    clone() {
      return new _Color(this.r, this.g, this.b, this.a);
    }
    static Lerp(a, b, t) {
      const k = Mathf.Clamp01(t);
      return new _Color(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k, a.a + (b.a - a.a) * k);
    }
    equals(o) {
      return !!o && this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a;
    }
  };
  var Curve = class {
    constructor(keys) {
      __publicField(this, "keys");
      this.keys = keys;
    }
    Evaluate(t) {
      const k = this.keys;
      if (k.length === 0) return 0;
      if (t <= k[0][0]) return k[0][1];
      for (let i = 1; i < k.length; i++) {
        if (t <= k[i][0]) {
          const [t0, v0] = k[i - 1];
          const [t1, v1] = k[i];
          return t1 === t0 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0);
        }
      }
      return k[k.length - 1][1];
    }
  };
  var Mathf = {
    PI: Math.PI,
    Deg2Rad: Math.PI / 180,
    Rad2Deg: 180 / Math.PI,
    Epsilon: 1401298e-51,
    Infinity: Number.POSITIVE_INFINITY,
    Abs: Math.abs,
    Min: Math.min,
    Max: Math.max,
    Sqrt: Math.sqrt,
    Pow: Math.pow,
    Sin: Math.sin,
    Cos: Math.cos,
    Atan2: Math.atan2,
    Floor: Math.floor,
    Ceil: Math.ceil,
    FloorToInt: (v) => Math.floor(v),
    CeilToInt: (v) => Math.ceil(v),
    /** C# rounds halves to the even neighbour; Math.round does not. */
    Round: (v) => {
      const f2 = Math.floor(v);
      const d = v - f2;
      if (d < 0.5) return f2;
      if (d > 0.5) return f2 + 1;
      return f2 % 2 === 0 ? f2 : f2 + 1;
    },
    RoundToInt: (v) => Mathf.Round(v),
    Sign: (v) => v >= 0 ? 1 : -1,
    Clamp: (v, lo, hi) => v < lo ? lo : v > hi ? hi : v,
    Clamp01: (v) => v < 0 ? 0 : v > 1 ? 1 : v,
    Lerp: (a, b, t) => a + (b - a) * Mathf.Clamp01(t),
    LerpUnclamped: (a, b, t) => a + (b - a) * t,
    InverseLerp: (a, b, v) => a === b ? 0 : Mathf.Clamp01((v - a) / (b - a)),
    MoveTowards: (current, target, maxDelta) => Math.abs(target - current) <= maxDelta ? target : current + Math.sign(target - current) * maxDelta,
    Repeat: (t, length) => Mathf.Clamp(t - Math.floor(t / length) * length, 0, length),
    Approximately: (a, b) => Math.abs(b - a) < Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 1121039e-50)
  };
  function encodeValue(value) {
    if (value === void 0 || value === null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "object") return value;
    if (value instanceof Vector2) return { $v2: [value.x, value.y] };
    if (value instanceof Vector3) return { $v3: [value.x, value.y, value.z] };
    if (value instanceof Quaternion) return { $q: [value.x, value.y, value.z, value.w] };
    if (value instanceof Vector4) return { $v4: [value.x, value.y, value.z, value.w] };
    if (value instanceof Color) return { $color: [value.r, value.g, value.b, value.a] };
    if (value instanceof Curve) return { $curve: value.keys };
    if (Array.isArray(value)) return value.map(encodeValue);
    const out = {};
    for (const key of Object.keys(value)) out[key] = encodeValue(value[key]);
    return out;
  }
  function decodeValue(json) {
    if (json === null || typeof json !== "object") return json;
    if (Array.isArray(json)) return json.map(decodeValue);
    const o = json;
    const n = (key, len) => {
      const a2 = o[key];
      return Array.isArray(a2) && a2.length === len && a2.every((v) => typeof v === "number") ? a2 : null;
    };
    let a;
    if (a = n("$v2", 2)) return new Vector2(a[0], a[1]);
    if (a = n("$v3", 3)) return new Vector3(a[0], a[1], a[2]);
    if (a = n("$q", 4)) return new Quaternion(a[0], a[1], a[2], a[3]);
    if (a = n("$v4", 4)) return new Vector4(a[0], a[1], a[2], a[3]);
    if (a = n("$color", 4)) return new Color(a[0], a[1], a[2], a[3]);
    if (Array.isArray(o.$curve)) return new Curve(o.$curve);
    const out = {};
    for (const key of Object.keys(o)) out[key] = decodeValue(o[key]);
    return out;
  }

  // portkit/src/fields.ts
  function readFields(target, fields) {
    const bag = target;
    const out = {};
    for (const field of fields) out[field] = encodeValue(bag[field]);
    return out;
  }
  function assignFields(target, fields, data, callbacks) {
    if (!isRecord(data)) return;
    const bag = target;
    for (const field of fields) {
      if (!(field in data)) continue;
      const property = callbacks ? callbacks[field] : void 0;
      if (property === void 0) {
        bag[field] = decodeValue(data[field]);
        continue;
      }
      if (canonicalJson(encodeValue(bag[field])) === canonicalJson(data[field] ?? null)) continue;
      bag[property] = decodeValue(data[field]);
    }
  }

  // portkit/src/peruser.ts
  var MAX_PLAYER_LEAVES = 4;
  var PER_LEAF = 24;
  var PerUser = class {
    constructor(core, storage, hooks) {
      __publicField(this, "core");
      __publicField(this, "storage");
      __publicField(this, "hooks");
      __publicField(this, "remote", /* @__PURE__ */ new Map());
      __publicField(this, "delivered", /* @__PURE__ */ new Map());
      __publicField(this, "local", {});
      __publicField(this, "localLoaded", false);
      __publicField(this, "localDirty", false);
      __publicField(this, "changedKeys", /* @__PURE__ */ new Set());
      /** sid -> behaviour id -> the per-player behaviour */
      __publicField(this, "owned", /* @__PURE__ */ new Map());
      __publicField(this, "dirtyBuckets", /* @__PURE__ */ new Set());
      __publicField(this, "lastWrite", /* @__PURE__ */ new Map());
      __publicField(this, "typeIds", []);
      /** PlayerData is published only when the game uses it. */
      __publicField(this, "dataEnabled", false);
      __publicField(this, "started", false);
      this.core = core;
      this.storage = storage;
      this.hooks = hooks;
    }
    path(leaf) {
      return `${this.core.prefix}.${leaf}`;
    }
    /** Declares the per-player behaviour ids of this game, in bindings order (it fixes which leaf each uses). */
    declareTypes(ids) {
      this.typeIds = ids.slice();
    }
    bucketOf(id) {
      const index = Math.max(0, this.typeIds.indexOf(id));
      const leaves = Math.min(MAX_PLAYER_LEAVES, Math.max(1, Math.ceil(this.typeIds.length / PER_LEAF)));
      return Math.floor(index * leaves / Math.max(1, this.typeIds.length));
    }
    listen() {
      const dot = this.core.prefix + ".";
      this.core.own(
        this.core.platform.onUser(dot, (sid, path) => {
          if (this.core.disposed || sid === this.core.me.sid) return;
          const leaf = path.slice(dot.length);
          if (leaf === "d") this.readRemoteData(sid);
          else if (/^p[0-3]$/.test(leaf)) this.readRemoteBucket(sid, Number(leaf.slice(1)));
        })
      );
    }
    // ---- PlayerData ---------------------------------------------------------------------------------------------
    /** Loads the local player's saved values and publishes them. Called once behaviours have started. */
    restoreLocal() {
      if (this.localLoaded) return;
      this.localLoaded = true;
      const saved = this.storage.get("playerdata", null);
      this.local = isRecord(saved) ? encodeValue(saved) : {};
      if (this.dataEnabled) this.localDirty = true;
    }
    enableData() {
      if (this.dataEnabled) return;
      this.dataEnabled = true;
      if (this.localLoaded) this.localDirty = true;
    }
    Set(key, value) {
      const encoded = encodeValue(value);
      if (canonicalJson(this.local[key] ?? null) === canonicalJson(encoded) && key in this.local) return;
      this.local[key] = encoded;
      this.changedKeys.add(key);
      this.localDirty = true;
      this.enableData();
    }
    Delete(key) {
      if (!(key in this.local)) return;
      delete this.local[key];
      this.changedKeys.add(key);
      this.localDirty = true;
    }
    bag(player) {
      if (player.isLocal) return this.local;
      return this.remote.get(player.sid)?.data ?? null;
    }
    Get(player, key, fallback) {
      const bag = this.bag(player);
      return bag && key in bag ? decodeValue(bag[key]) : fallback;
    }
    Has(player, key) {
      const bag = this.bag(player);
      return !!bag && key in bag;
    }
    Keys(player) {
      const bag = this.bag(player);
      return bag ? Object.keys(bag) : [];
    }
    IsRestored(player) {
      return player.isLocal ? this.localLoaded : !!this.remote.get(player.sid)?.restored;
    }
    SetString(key, value) {
      this.Set(key, String(value));
    }
    SetInt(key, value) {
      this.Set(key, Math.trunc(value));
    }
    SetFloat(key, value) {
      this.Set(key, value);
    }
    SetBool(key, value) {
      this.Set(key, !!value);
    }
    GetString(player, key) {
      return String(this.Get(player, key, ""));
    }
    GetInt(player, key) {
      return Math.trunc(Number(this.Get(player, key, 0)) || 0);
    }
    GetFloat(player, key) {
      return Number(this.Get(player, key, 0)) || 0;
    }
    GetBool(player, key) {
      return this.Get(player, key, false) === true;
    }
    readRemoteData(sid) {
      const raw = safeParse(this.core.platform.userGet(sid, this.path("d")));
      let entry = this.remote.get(sid);
      if (!entry) this.remote.set(sid, entry = { data: {}, restored: false, announced: false });
      const before = entry.data;
      const now = isRecord(raw) && isRecord(raw.d) ? raw.d : {};
      entry.data = now;
      entry.restored = isRecord(raw) && raw.r === 1;
      const player = this.delivered.get(sid);
      if (!player || !this.started) return;
      if (entry.restored && !entry.announced) {
        entry.announced = true;
        this.hooks.restored(player);
        const all = Object.keys(now).sort();
        if (all.length) this.hooks.dataUpdated(player, all);
        return;
      }
      const keys = [];
      for (const key of /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(now)])) {
        if (canonicalJson(before[key] ?? null) !== canonicalJson(now[key] ?? null) || key in before !== key in now) keys.push(key);
      }
      if (keys.length) this.hooks.dataUpdated(player, keys.sort());
    }
    // ---- per-player behaviours ----------------------------------------------------------------------------------
    /** Registers a per-player behaviour that has just been made for `player`. Returns true if it already has data. */
    adopt(player, id, behaviour, fields, persistent, callbacks) {
      let mine = this.owned.get(player.sid);
      if (!mine) this.owned.set(player.sid, mine = /* @__PURE__ */ new Map());
      const entry = { id, behaviour, fields, callbacks, persistent, bucket: this.bucketOf(id), n: 0 };
      mine.set(id, entry);
      if (player.isLocal) {
        if (!persistent) return false;
        const saved = this.storage.get(`po.${id}`, null);
        if (!isRecord(saved)) return false;
        this.core.guard(`${id} field change callback`, () => assignFields(behaviour, fields, encodeValue(saved), callbacks));
        entry.n = 1;
        this.dirtyBuckets.add(entry.bucket);
        return true;
      }
      const stored = this.remoteBucket(player.sid, entry.bucket)[id];
      if (!stored) return false;
      this.core.guard(`${id} field change callback`, () => assignFields(behaviour, fields, stored[1], callbacks));
      entry.n = stored[0];
      return true;
    }
    behaviour(sid, id) {
      return this.owned.get(sid)?.get(id)?.behaviour ?? null;
    }
    behavioursOf(sid) {
      return [...this.owned.get(sid)?.values() ?? []].map((o) => o.behaviour);
    }
    /** The local player asked to send one of their per-player behaviours. */
    requestSerialization(behaviour) {
      const mine = this.owned.get(this.core.me.sid);
      if (!mine) return;
      for (const entry of mine.values()) {
        if (entry.behaviour !== behaviour) continue;
        entry.n++;
        this.dirtyBuckets.add(entry.bucket);
        return;
      }
    }
    remoteBucket(sid, bucket) {
      const raw = safeParse(this.core.platform.userGet(sid, this.path(`p${bucket}`)));
      const out = {};
      if (!isRecord(raw) || !isRecord(raw.b)) return out;
      for (const id of Object.keys(raw.b)) {
        const entry = raw.b[id];
        if (Array.isArray(entry) && typeof entry[0] === "number") out[id] = [entry[0], entry[1]];
      }
      return out;
    }
    readRemoteBucket(sid, bucket) {
      const theirs = this.owned.get(sid);
      if (!theirs) return;
      const stored = this.remoteBucket(sid, bucket);
      for (const entry of theirs.values()) {
        const value = stored[entry.id];
        if (!value || value[0] === entry.n) continue;
        entry.n = value[0];
        this.core.guard(`${entry.id} field change callback`, () => assignFields(entry.behaviour, entry.fields, value[1], entry.callbacks));
        if (this.started) this.hooks.deserialized(entry.behaviour);
      }
    }
    // ---- players coming and going -------------------------------------------------------------------------------
    /** Called after OnPlayerJoined has been delivered for `player`. */
    playerDelivered(player) {
      this.delivered.set(player.sid, player);
      if (player.isLocal) {
        if (this.dataEnabled || this.hasPersistentLocal()) {
          this.hooks.restored(player);
          const all = Object.keys(this.local).sort();
          if (this.dataEnabled && all.length) this.hooks.dataUpdated(player, all);
        }
        return;
      }
      this.readRemoteData(player.sid);
    }
    hasPersistentLocal() {
      for (const entry of this.owned.get(this.core.me.sid)?.values() ?? []) if (entry.persistent) return true;
      return false;
    }
    /** Drops everything kept for a player who left. Returns their per-player behaviours, for OnDestroy. */
    playerGone(sid) {
      const gone = this.behavioursOf(sid);
      this.owned.delete(sid);
      this.remote.delete(sid);
      this.delivered.delete(sid);
      return gone;
    }
    // ---- writing ------------------------------------------------------------------------------------------------
    /** Writes what changed, at most a few times a second per leaf. Called once per tick. */
    flush() {
      if (this.core.disposed || !this.started) return;
      const now = this.core.platform.clock.now();
      const due = (leaf) => now - (this.lastWrite.get(leaf) ?? -Infinity) >= this.core.options.continuousIntervalMs;
      const limit = this.core.platform.limits.maxLeafBytes - 64;
      for (const bucket of [...this.dirtyBuckets]) {
        const leaf = `p${bucket}`;
        if (!due(leaf)) continue;
        this.dirtyBuckets.delete(bucket);
        const b = {};
        const mine = [...this.owned.get(this.core.me.sid)?.values() ?? []].filter((o) => o.bucket === bucket && o.n > 0);
        for (const entry of mine) b[entry.id] = [entry.n, readFields(entry.behaviour, entry.fields)];
        const text = asciiJson({ b });
        if (jsonLeafBytes(text) > limit) {
          this.hooks.refused("playerObject", "value_too_large", this.path(leaf), mine[0]?.behaviour ?? null);
          continue;
        }
        this.lastWrite.set(leaf, now);
        this.core.platform.userSet(this.path(leaf), text);
        for (const entry of mine) if (entry.persistent) this.storage.set(`po.${entry.id}`, decodeValue(b[entry.id][1]));
      }
      if (this.localDirty && this.localLoaded && this.dataEnabled && due("d")) {
        this.localDirty = false;
        const keys = [...this.changedKeys].sort();
        this.changedKeys.clear();
        const text = asciiJson({ r: 1, d: this.local });
        if (jsonLeafBytes(text) > limit) {
          this.hooks.refused("playerData", "value_too_large", this.path("d"), null);
        } else {
          this.lastWrite.set("d", now);
          this.core.platform.userSet(this.path("d"), text);
          this.storage.set("playerdata", decodeValue(this.local));
        }
        const me = this.delivered.get(this.core.me.sid);
        if (me && keys.length) this.hooks.dataUpdated(me, keys);
      }
    }
    /** Removes the local player's leaves, when the instance stops while they stay in the room. */
    retire() {
      const { platform } = this.core;
      if (this.dataEnabled) platform.userSet(this.path("d"), null);
      const leaves = /* @__PURE__ */ new Set();
      for (const entry of this.owned.get(this.core.me.sid)?.values() ?? []) if (entry.n > 0) leaves.add(entry.bucket);
      for (const bucket of leaves) platform.userSet(this.path(`p${bucket}`), null);
    }
  };

  // portkit/src/bindings.ts
  var EVENT_KINDS = ["click", "grab", "drop", "triggerEnter", "triggerExit", "collisionEnter", "collisionExit", "uiButton", "uiSlider", "uiToggle", "heldTrigger", "heldPrimary", "heldSecondary", "field", "graph"];
  var GRAPH_KINDS = ["uiButton", "uiSlider", "uiToggle", "heldTrigger", "heldPrimary", "heldSecondary", "field"];
  function validateBindings(json) {
    const problems = [];
    const fail = (text) => problems.push(text);
    if (!isRecord(json)) throw new Error("bindings: not an object");
    if (json.schema !== 1) fail(`schema is ${JSON.stringify(json.schema)}, expected 1`);
    if (typeof json.slug !== "string" || !isValidSlug(json.slug)) fail(`slug ${JSON.stringify(json.slug)} is not lower-case letters, digits and hyphens`);
    const bundles = isRecord(json.bundles) ? json.bundles : {};
    const objects = isRecord(json.objects) ? json.objects : {};
    const refs = Array.isArray(json.refs) ? json.refs : [];
    const behaviours = Array.isArray(json.behaviours) ? json.behaviours : [];
    const events = Array.isArray(json.events) ? json.events : [];
    const paths = /* @__PURE__ */ new Map();
    for (const key of Object.keys(objects)) {
      const o = objects[key];
      if (!isPathSegment(key)) fail(`object key '${key}' must be 1-64 of A-Z a-z 0-9 _ - @ (it becomes part of a network id)`);
      if (!isRecord(o) || typeof o.path !== "string") {
        fail(`object '${key}' has no path`);
        continue;
      }
      if (o.sync !== void 0 && o.sync !== "none" && o.sync !== "transform") fail(`object '${key}': sync must be "none" or "transform"`);
      const other = paths.get(o.path);
      if (other !== void 0) fail(`objects '${other}' and '${key}' have the same path '${o.path}'`);
      paths.set(o.path, key);
    }
    refs.forEach((ref, i) => {
      if (typeof ref !== "string" || !(ref in objects)) fail(`refs[${i}] '${String(ref)}' is not an object key`);
    });
    if (new Set(refs).size !== refs.length) fail("refs lists an object twice");
    const ids = /* @__PURE__ */ new Set();
    for (const b of behaviours) {
      if (!isRecord(b) || typeof b.id !== "string" || typeof b.type !== "string") {
        fail(`a behaviour entry has no id or type: ${JSON.stringify(b)}`);
        continue;
      }
      if (!isPathSegment(b.id)) fail(`behaviour id '${b.id}' must be 1-64 of A-Z a-z 0-9 _ - @ (it is a state key)`);
      if (ids.has(b.id)) fail(`behaviour id '${b.id}' is used twice`);
      ids.add(b.id);
      if (b.object !== void 0 && b.object !== null && !(String(b.object) in objects)) fail(`behaviour '${b.id}': object '${String(b.object)}' is not an object key`);
      if (b.fields !== void 0 && !isRecord(b.fields)) fail(`behaviour '${b.id}': fields is not an object`);
      if (b.group !== void 0 && (typeof b.group !== "string" || !/^[A-Za-z0-9_-]{1,48}$/.test(b.group))) fail(`behaviour '${b.id}': group must be 1-48 of A-Z a-z 0-9 _ -`);
      if (b.group !== void 0 && b.perPlayer === true) fail(`behaviour '${b.id}': a per-player behaviour cannot be in a sync group`);
    }
    const checkRefs = (where, value) => {
      if (Array.isArray(value)) value.forEach((v, i) => checkRefs(`${where}[${i}]`, v));
      else if (isRecord(value)) {
        if (typeof value.$obj === "string" && !(value.$obj in objects)) fail(`${where}: $obj '${value.$obj}' is not an object key`);
        else if (typeof value.$beh === "string" && !ids.has(value.$beh)) fail(`${where}: $beh '${value.$beh}' is not a behaviour id`);
        else if (typeof value.$comp === "string" && !(value.$comp in objects)) fail(`${where}: $comp '${value.$comp}' is not an object key`);
        else if (value.$clip !== void 0 && value.on !== void 0 && !(String(value.on) in objects)) fail(`${where}: $clip on '${String(value.on)}' is not an object key`);
        else if (!Object.keys(value).some((k) => k.startsWith("$"))) for (const k of Object.keys(value)) checkRefs(`${where}.${k}`, value[k]);
      }
    };
    for (const b of behaviours) if (isRecord(b) && isRecord(b.fields)) for (const f2 of Object.keys(b.fields)) checkRefs(`behaviour '${String(b.id)}' field '${f2}'`, b.fields[f2]);
    events.forEach((e, i) => {
      if (!isRecord(e)) return fail(`events[${i}] is not an object`);
      if (typeof e.kind !== "string" || EVENT_KINDS.indexOf(e.kind) < 0) fail(`events[${i}]: kind '${String(e.kind)}' is not one of ${EVENT_KINDS.join(", ")}`);
      if (e.kind === "graph") {
        if (typeof e.name !== "string" || !e.name) fail(`events[${i}]: a graph event needs a name`);
      } else if (typeof e.object !== "string" || !(e.object in objects)) fail(`events[${i}]: object '${String(e.object)}' is not an object key`);
      const unbound = GRAPH_KINDS.indexOf(String(e.kind)) >= 0 && !e.behaviour && !e.method;
      if (unbound) return;
      if (typeof e.behaviour !== "string" || !ids.has(e.behaviour)) fail(`events[${i}]: behaviour '${String(e.behaviour)}' is not a behaviour id`);
      if (typeof e.method !== "string" || !e.method) fail(`events[${i}]: no method`);
    });
    if (problems.length) throw new Error("bindings.json is not valid:\n  - " + problems.join("\n  - "));
    const normalObjects = {};
    for (const key of Object.keys(objects)) {
      const o = objects[key];
      normalObjects[key] = { path: o.path, sync: o.sync === "transform" ? "transform" : "none", grab: o.grab === true, click: o.click === true, seat: o.seat === true };
      if (o.active === false) normalObjects[key].active = false;
    }
    return {
      schema: 1,
      slug: json.slug,
      hash: typeof json.hash === "string" ? json.hash : void 0,
      root: typeof json.root === "string" && json.root ? json.root : void 0,
      bundles: { windows: typeof bundles.windows === "string" ? bundles.windows : "", android: typeof bundles.android === "string" ? bundles.android : "" },
      objects: normalObjects,
      refs,
      behaviours,
      events
    };
  }

  // portkit/src/events.ts
  var NetEvents = class {
    constructor(core, sync, routes) {
      __publicField(this, "core");
      __publicField(this, "sync");
      __publicField(this, "routes");
      __publicField(this, "held", /* @__PURE__ */ new Map());
      /** The session whose event or command is being run right now, for Networking.CallingPlayer. */
      __publicField(this, "callingSid", null);
      __publicField(this, "sent", 0);
      __publicField(this, "received", 0);
      /** Requests naming a method that may not be called from the network, for tests and diagnostics. */
      __publicField(this, "refusedCount", 0);
      __publicField(this, "refusedNames", /* @__PURE__ */ new Set());
      this.core = core;
      this.sync = sync;
      this.routes = routes;
    }
    listen() {
      this.core.own(this.core.platform.onOneShot((fromSid, data) => this.receive(fromSid, data)));
    }
    send(behaviour, target, name, args) {
      if (this.core.disposed) return;
      const address = this.routes.address(behaviour);
      if (!address) return;
      if (!callable(behaviour, name)) {
        this.core.log("warn", `SendCustomNetworkEvent: ${address.id} has no network-callable method '${name}' (list it in its class's static networkCallable; names starting with '_' can never be sent)`);
        return;
      }
      const fields = { b: address.id, e: name };
      if (args.length) fields.a = args.map(encodeValue);
      const me = this.core.me.sid;
      let ownerSid;
      if (address.playerSid !== null) {
        fields.ps = address.playerSid;
        ownerSid = address.playerSid;
      } else {
        const slot = this.sync.slotOf(behaviour);
        ownerSid = slot ? this.sync.ownerSid(slot) : null;
        if (slot && ownerSid === me) {
          const mark = this.sync.flushOne(slot);
          if (mark && mark.w === me) fields.s = [mark.g, mark.n];
        }
      }
      if (target === "Owner") {
        if (ownerSid === me) {
          this.invoke(behaviour, name, args, me);
          return;
        }
        if (ownerSid === null) {
          this.core.log("warn", `${address.id}.${name}: no owner to send to`);
          return;
        }
        fields.o = ownerSid;
      } else this.invoke(behaviour, name, args, me);
      this.post(behaviour, name, fields);
    }
    post(behaviour, name, fields) {
      const text = asciiJson(makeEnvelope(this.core.slug, this.core.inst, "ev", fields));
      if (utf8Length(text) > this.core.platform.limits.oneShotMaxBytes || !this.core.platform.oneShot(text)) {
        this.core.log("error", `network event '${name}' is too large to send (${utf8Length(text)} bytes)`);
        this.routes.refused(behaviour, "oneshot_too_large", name);
        return;
      }
      this.sent++;
    }
    receive(fromSid, data) {
      if (this.core.disposed || !this.sync.started) return;
      const env2 = parseOurs(data, this.core.slug, this.core.inst);
      if (!env2 || env2.t !== "ev" || typeof env2.b !== "string" || typeof env2.e !== "string") return;
      const me = this.core.me.sid;
      const name = env2.e;
      const args = Array.isArray(env2.a) ? env2.a.map(decodeValue) : [];
      this.received++;
      if (typeof env2.ps === "string") {
        if (typeof env2.o === "string" && env2.o !== me) return;
        const behaviour2 = this.routes.playerBehaviour(env2.ps, env2.b);
        if (behaviour2) this.invoke(behaviour2, name, args, fromSid);
        return;
      }
      const behaviour = this.routes.behaviour(env2.b);
      const slot = behaviour ? this.sync.slotOf(behaviour) : null;
      if (!behaviour || !slot) return;
      if (typeof env2.o === "string") {
        if (env2.o !== me) return;
        if (!this.sync.isOwner(slot)) {
          const owner = this.sync.ownerSid(slot);
          const hops = typeof env2.h === "number" ? env2.h : 0;
          if (owner !== null && owner !== fromSid && hops < 2) {
            const fields = { b: env2.b, e: name, o: owner, h: hops + 1 };
            if (args.length) fields.a = env2.a;
            this.post(behaviour, name, fields);
          }
          return;
        }
      }
      const run = () => this.invoke(behaviour, name, args, fromSid);
      const mark = Array.isArray(env2.s) && typeof env2.s[0] === "number" && typeof env2.s[1] === "number" ? { g: env2.s[0], n: env2.s[1] } : null;
      if (mark && !this.has(slot, mark.g, mark.n)) this.hold(slot, mark.g, mark.n, run);
      else run();
    }
    /** Has the write the event was sent after reached this client's mirror? (Sequence numbers only rise.) */
    has(slot, _g, n) {
      return slot.seenN >= n;
    }
    hold(slot, g, n, run) {
      let list = this.held.get(slot.id);
      if (!list) this.held.set(slot.id, list = []);
      const entry = { g, n, run, timer: 0 };
      entry.timer = this.core.scheduler.after(this.core.options.eventHoldMs, () => {
        const current = this.held.get(slot.id) ?? [];
        const at = current.indexOf(entry);
        if (at < 0) return;
        current.splice(at, 1);
        run();
      });
      list.push(entry);
      slot.onApplied = () => this.release(slot);
    }
    release(slot) {
      const list = this.held.get(slot.id);
      if (!list || !list.length) return;
      const ready = list.filter((h) => this.has(slot, h.g, h.n));
      if (!ready.length) return;
      this.held.set(
        slot.id,
        list.filter((h) => !ready.includes(h))
      );
      for (const h of ready) {
        this.core.scheduler.cancel(h.timer);
        h.run();
      }
    }
    /** Runs a method of game code on behalf of `fromSid` (a network event or a command). */
    invoke(behaviour, name, args, fromSid) {
      if (!callable(behaviour, name)) {
        const key = `${behaviour.constructor.name}.${name}`;
        if (!this.refusedNames.has(key) && this.refusedNames.size < 64) {
          this.refusedNames.add(key);
          this.core.log("warn", `refused a request from session ${fromSid} to run '${String(name).slice(0, 64)}' on ${behaviour.constructor.name}: not in its networkCallable list`);
        }
        this.refusedCount++;
        return;
      }
      const before = this.callingSid;
      this.callingSid = fromSid;
      try {
        this.core.guard(name, () => behaviour[name](...args));
      } finally {
        this.callingSid = before;
      }
    }
  };
  var LISTS = /* @__PURE__ */ new WeakMap();
  function networkCallableOf(cls) {
    let set = LISTS.get(cls);
    if (set) return set;
    const names = /* @__PURE__ */ new Set();
    for (let c = cls; typeof c === "function" && c !== Behaviour && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
      if (Object.prototype.hasOwnProperty.call(c, "networkCallable")) {
        const list = c.networkCallable;
        if (Array.isArray(list)) {
          for (const name of list) if (typeof name === "string") names.add(name);
        }
      }
    }
    set = names;
    LISTS.set(cls, set);
    return set;
  }
  function callable(behaviour, name) {
    if (typeof name !== "string" || name.length === 0 || name.charCodeAt(0) === 95 || name === "constructor") return false;
    if (!networkCallableOf(behaviour.constructor).has(name)) return false;
    for (let proto = Object.getPrototypeOf(behaviour); proto && proto !== Behaviour.prototype && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      if (Object.prototype.hasOwnProperty.call(proto, name)) return typeof behaviour[name] === "function";
    }
    return false;
  }
  function parseOurs(data, slug, inst) {
    if (typeof data !== "string" || data.indexOf('"pk":1') < 0) return null;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const e = parsed;
    if (e.pk !== 1 || e.g !== slug || e.i !== inst || typeof e.t !== "string") return null;
    return e;
  }

  // portkit/src/refrecord.ts
  var RefereeTable = class {
    constructor(presence, referee, name, parseEntry) {
      __publicField(this, "presence");
      __publicField(this, "referee");
      __publicField(this, "name");
      __publicField(this, "parseEntry");
      __publicField(this, "last", null);
      __publicField(this, "lastText", "");
      this.presence = presence;
      this.referee = referee;
      this.name = name;
      this.parseEntry = parseEntry;
    }
    /** The table as the referee published it: read from the referee's own user state, else the last one read. */
    read() {
      const ref = this.referee.current();
      const epoch = this.referee.epoch;
      if (ref) {
        const raw = this.presence.extra(ref.sid, this.name);
        const parsed = this.parse(raw, epoch);
        if (parsed) {
          this.last = { e: epoch, m: parsed };
          return parsed;
        }
      }
      return this.last && this.last.e === epoch ? this.last.m : {};
    }
    /** A copy the referee may change and `write`: its own published table, else its predecessor's last one. */
    working() {
      const epoch = this.referee.epoch;
      const own = this.parse(this.presence.extra(this.presence.localSid, this.name), epoch);
      const base = own ?? (this.last && this.last.e === epoch ? this.last.m : {});
      return JSON.parse(JSON.stringify(base));
    }
    /** Publishes the table in the local player's user state (only the referee calls this). */
    write(table) {
      const value = { e: this.referee.epoch, m: table };
      const text = asciiJson(value);
      if (text === this.lastText && this.presence.extra(this.presence.localSid, this.name) !== void 0) return;
      this.lastText = text;
      this.presence.setExtra(this.name, value);
      this.last = { e: value.e, m: JSON.parse(JSON.stringify(table)) };
    }
    parse(raw, epoch) {
      if (!isRecord(raw) || raw.e !== epoch || !isRecord(raw.m)) return null;
      const out = {};
      for (const key of Object.keys(raw.m)) {
        const entry = this.parseEntry(raw.m[key]);
        if (entry !== null) out[key] = entry;
      }
      return out;
    }
  };

  // portkit/src/commands.ts
  var MAX_COMMAND_BYTES = 2048;
  var MAX_BATCH = 8;
  var MAX_BATCH_BYTES = 4096;
  var Commands = class {
    constructor(core, presence, referee, routes) {
      __publicField(this, "core");
      __publicField(this, "presence");
      __publicField(this, "referee");
      __publicField(this, "routes");
      __publicField(this, "queue", []);
      __publicField(this, "nextNumber", 0);
      __publicField(this, "acks");
      /** False until behaviours have started: the referee runs nothing before then. */
      __publicField(this, "started", false);
      __publicField(this, "run", 0);
      this.core = core;
      this.presence = presence;
      this.referee = referee;
      this.routes = routes;
      this.acks = new RefereeTable(presence, referee, "ak", (v) => typeof v === "number" ? v : null);
    }
    listen() {
      this.presence.onExtra(() => this.review());
      this.presence.on(() => this.review());
      this.referee.on(() => this.review());
    }
    send(behaviour, name, args) {
      const address = this.routes.address(behaviour);
      if (!address) return 0;
      if (!callable(behaviour, name)) {
        this.core.log("warn", `SendCommand: ${address.id} has no network-callable method '${name}' (list it in its class's static networkCallable)`);
        return 0;
      }
      if (this.nextNumber === 0) this.nextNumber = (this.table()[this.core.me.sid] ?? 0) + 1;
      const n = this.nextNumber++;
      const record = [n, address.id, address.playerSid ?? "", name, args.map(encodeValue)];
      if (utf8Length(asciiJson(record)) > MAX_COMMAND_BYTES) {
        this.routes.refused(behaviour, "value_too_large", name);
        return 0;
      }
      this.queue.push({ n, behaviour, record });
      this.review();
      return n;
    }
    /** Publishes, runs and acknowledges whatever is due. Also called about once a second. */
    review() {
      if (this.core.disposed || !this.started) return;
      const me = this.core.me.sid;
      const acked = this.table()[me] ?? 0;
      while (this.queue.length && this.queue[0].n <= acked) {
        const done = this.queue.shift();
        this.core.guard("OnCommandAcknowledged", () => this.routes.acknowledged(done.behaviour, done.n));
      }
      const published = this.presence.extra(me, "q");
      if (this.queue.length) {
        const batch = [];
        let bytes = 2;
        for (const pending of this.queue) {
          const size = utf8Length(asciiJson(pending.record)) + 1;
          if (batch.length >= MAX_BATCH || batch.length && bytes + size > MAX_BATCH_BYTES) break;
          batch.push(pending.record);
          bytes += size;
        }
        const first = Array.isArray(published) && Array.isArray(published[0]) ? published[0][0] : null;
        const last = Array.isArray(published) && Array.isArray(published[published.length - 1]) ? published[published.length - 1][0] : null;
        if (first !== batch[0][0] || last !== batch[batch.length - 1][0]) this.presence.setExtra("q", batch);
      } else if (published !== void 0) this.presence.setExtra("q", void 0);
      if (this.referee.isMe()) this.officiate();
    }
    officiate() {
      const table = this.acks.working();
      let changed = false;
      for (const sid of Object.keys(table)) {
        if (!this.presence.has(sid)) {
          delete table[sid];
          changed = true;
        }
      }
      for (const who of this.presence.list()) {
        const batch = this.presence.extra(who.sid, "q");
        if (!Array.isArray(batch)) continue;
        for (const q of batch.slice(0, MAX_BATCH)) {
          if (!Array.isArray(q) || typeof q[0] !== "number" || typeof q[1] !== "string" || typeof q[3] !== "string") break;
          const acked = table[who.sid] ?? 0;
          if (q[0] <= acked) continue;
          if (acked > 0 && q[0] !== acked + 1) break;
          table[who.sid] = q[0];
          changed = true;
          const behaviour = this.routes.resolve(q[1], typeof q[2] === "string" && q[2] ? q[2] : null);
          const args = Array.isArray(q[4]) ? q[4].map(decodeValue) : [];
          this.run++;
          if (behaviour) this.routes.invoke(behaviour, q[3], args, who.sid);
        }
      }
      if (changed) this.acks.write(table);
    }
    table() {
      return this.acks.read();
    }
  };

  // portkit/src/core.ts
  var DEFAULT_OPTIONS = {
    settleMs: 1e3,
    claimStepMs: 400,
    claimRetryMs: 3e3,
    snapshotTimeoutMs: 8e3,
    clockTimeoutMs: 2e3,
    clockResyncMs: 6e4,
    admitWarnMs: 15e3,
    ownerClaimTimeoutMs: 5e3,
    continuousIntervalMs: 200,
    eventHoldMs: 2e3,
    whenEmpty: "reset"
  };
  var Core = class {
    constructor(platform, slug, inst, options, scheduler) {
      __publicField(this, "platform");
      __publicField(this, "slug");
      __publicField(this, "inst");
      /** `pk1.<slug>.<inst>` */
      __publicField(this, "prefix");
      __publicField(this, "options");
      __publicField(this, "scheduler");
      /** The local player as the platform reported them when the instance started. */
      __publicField(this, "me");
      __publicField(this, "disposed", false);
      __publicField(this, "unsubs", []);
      __publicField(this, "stateHandlers", []);
      this.platform = platform;
      this.slug = slug;
      this.inst = inst;
      this.prefix = statePrefix(slug, inst);
      this.options = options;
      this.scheduler = scheduler;
      this.me = platform.local();
    }
    /** Starts listening to the room's state under this instance's prefix. */
    listen() {
      const dot = this.prefix + ".";
      this.own(
        this.platform.onState(dot, (path, value) => {
          if (this.disposed) return;
          const key = path.slice(dot.length);
          for (const handler of this.stateHandlers.slice()) {
            try {
              handler(key, value);
            } catch (error) {
              this.error("state handler", error);
            }
          }
        })
      );
    }
    /** Reads a leaf of this instance from the mirror. `key` is relative to the prefix. */
    get(key) {
      return this.platform.stateGet(this.prefix + "." + key);
    }
    set(key, value) {
      if (this.disposed) return;
      this.platform.stateSet(this.prefix + "." + key, value);
    }
    entries() {
      const dot = this.prefix + ".";
      return this.platform.stateEntries(dot).map(([path, value]) => [path.slice(dot.length), value]);
    }
    onState(handler) {
      this.stateHandlers.push(handler);
    }
    /** Keeps an unsubscribe to run when the instance is disposed. */
    own(unsub) {
      if (this.disposed) unsub();
      else this.unsubs.push(unsub);
    }
    log(level, message) {
      this.platform.log(level, `[${this.slug}:${this.inst}] ${message}`);
    }
    error(where, error) {
      const text = error instanceof Error ? error.stack ?? error.message : String(error);
      this.log("error", `${where}: ${text}`);
    }
    /** Runs game code so that one behaviour's exception cannot stop the others. */
    guard(where, fn) {
      try {
        fn();
      } catch (error) {
        this.error(where, error);
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.scheduler.stop();
      for (const unsub of this.unsubs.splice(0)) {
        try {
          unsub();
        } catch {
        }
      }
      this.stateHandlers.length = 0;
    }
  };

  // portkit/src/host.ts
  function encodeRelayArg(text) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 37 || c === 124 || c === 94 || c === 34 || c === 92 || c < 32) {
        out += "%" + c.toString(16).toUpperCase().padStart(2, "0");
      } else if (c >= 55296 && c <= 57343) {
        const pairStart = c <= 56319 && i + 1 < text.length && (text.charCodeAt(i + 1) & 64512) === 56320;
        if (pairStart) {
          out += text[i] + text[i + 1];
          i++;
        } else out += "\uFFFD";
      } else out += text[i];
    }
    return out;
  }
  function decodeRelayArg(text) {
    return text.replace(/%([0-9A-F]{2})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  function relayNumber(value) {
    if (!Number.isFinite(value)) return "0";
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }
  function relayRecord(op, target, args) {
    let record = op + "|" + (typeof target === "number" ? String(target) : encodeRelayArg(target));
    for (const arg of args) record += "|" + encodeRelayArg(arg);
    return record;
  }
  function relayPayload(slug, inst, records) {
    return relayKey(slug, inst) + "|" + records.join("^");
  }
  function parseEventArgs(text) {
    return text === "" ? [] : text.split("|").map(decodeRelayArg);
  }
  function materialProperty(property, slot = 0) {
    return slot > 0 ? `#${Math.floor(slot)}:${property}` : property;
  }
  var MAX_PAYLOAD = 12e3;
  var RelayHost = class {
    constructor(platform, slug, inst, refs) {
      __publicField(this, "platform");
      __publicField(this, "slug");
      __publicField(this, "inst");
      __publicField(this, "refs");
      __publicField(this, "warned", /* @__PURE__ */ new Set());
      __publicField(this, "waiting", /* @__PURE__ */ new Map());
      /** What was last sent (or queued) per target and property: an unchanged value is not sent again. */
      __publicField(this, "last", /* @__PURE__ */ new Map());
      __publicField(this, "queue", []);
      __publicField(this, "nextRequest", 1);
      /** Payloads and records handed to the bridge, for tests and diagnostics. */
      __publicField(this, "payloadsSent", 0);
      __publicField(this, "recordsSent", 0);
      /** Used instead of the relay for an object that is not in refs but that the page can reach. */
      __publicField(this, "fallbackActive", () => false);
      /** Plays a clip of the object's own list through the page when the page can reach the object. */
      __publicField(this, "fallbackClip", () => false);
      this.platform = platform;
      this.slug = slug;
      this.inst = inst;
      this.refs = refs;
    }
    /** Called with the graph's reply to a clock op. */
    onClockReply(requestId, seconds2) {
      const resolve = this.waiting.get(requestId);
      if (!resolve) return;
      this.waiting.delete(requestId);
      resolve(seconds2);
    }
    setText(target, text) {
      this.value("text", target, "text", [text]);
    }
    animBool(target, name, value) {
      this.value("animBool", target, "anim." + name, [name, value ? "1" : "0"]);
    }
    animFloat(target, name, value) {
      this.value("animFloat", target, "anim." + name, [name, relayNumber(value)]);
    }
    animInt(target, name, value) {
      this.value("animInt", target, "anim." + name, [name, String(Math.trunc(value))]);
    }
    animResetTrigger(target, name) {
      this.event("animResetTrigger", target, [name]);
    }
    animPlay(target, state, crossFadeSeconds = 0) {
      this.event("animPlay", target, [state, relayNumber(crossFadeSeconds)]);
    }
    animTrigger(target, name) {
      this.event("animTrigger", target, [name, "1"]);
    }
    particles(target, play) {
      this.event("particles", target, [play ? "play" : "stop"]);
    }
    setColor(target, property, color, slot = 0) {
      const name = materialProperty(property, slot);
      this.value("color", target, "color." + name, [name, relayNumber(color.r), relayNumber(color.g), relayNumber(color.b), relayNumber(color.a)]);
    }
    matFloat(target, property, value, slot = 0) {
      const name = materialProperty(property, slot);
      this.value("matFloat", target, "mat." + name, [name, relayNumber(value)]);
    }
    uiColor(target, color) {
      this.value("uiColor", target, "uiColor", [relayNumber(color.r), relayNumber(color.g), relayNumber(color.b), relayNumber(color.a)]);
    }
    setActive(target, active) {
      if (!target.startsWith("@") && this.refs.indexOf(target) < 0 && this.fallbackActive(target, active)) return;
      this.value("active", target, "active", [active ? "1" : "0"]);
    }
    playClip(target, clipIndex, clipsOn, volumeScale) {
      const own = clipsOn === void 0 || clipsOn === target;
      const scaled = volumeScale !== void 0 && volumeScale !== 1;
      if (own && !scaled && !target.startsWith("@") && this.refs.indexOf(target) < 0 && this.fallbackClip(target, clipIndex)) return;
      const holder = this.resolve("audio", own ? target : clipsOn);
      if (holder === null) return;
      if (typeof holder !== "number") {
        this.warnOnce(`audio:${holder}`, `the clips of ${holder} cannot be played: the audio op needs the holder in bindings.refs`);
        return;
      }
      if (scaled) this.event("audioScaled", target, [String(Math.trunc(clipIndex)), String(holder), relayNumber(volumeScale)]);
      else this.event("audio", target, [String(Math.trunc(clipIndex)), String(holder)]);
    }
    audioPitch(target, pitch) {
      this.value("audioPitch", target, "audioPitch", [relayNumber(pitch)]);
    }
    audioVolume(target, volume) {
      this.value("audioVolume", target, "audioVolume", [relayNumber(volume)]);
    }
    animEnabled(target, enabled) {
      this.value("animEnabled", target, "animEnabled", [enabled ? "1" : "0"]);
    }
    uiSetToggle(target, on) {
      this.value("uiSetToggle", target, "uiSetToggle", [on ? "1" : "0"]);
    }
    uiSetSlider(target, value) {
      this.value("uiSetSlider", target, "uiSetSlider", [relayNumber(value)]);
    }
    scale(target, localScale) {
      this.value("scale", target, "scale", [relayNumber(localScale.x), relayNumber(localScale.y), relayNumber(localScale.z)]);
    }
    rbVelocity(target, velocity) {
      this.event("rbVelocity", target, [relayNumber(velocity.x), relayNumber(velocity.y), relayNumber(velocity.z)]);
    }
    rbKinematic(target, kinematic) {
      this.value("rbKinematic", target, "rbKinematic", [kinematic ? "1" : "0"]);
    }
    spawn(target, name) {
      this.event("spawn", target, [name]);
    }
    despawn(target) {
      this.event("despawn", target, []);
      if (target.startsWith("@")) {
        for (const key of [...this.last.keys()]) if (key.startsWith(target + "/")) this.last.delete(key);
      }
    }
    op(name, target, args, property) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === "clock") throw new Error(`'${name}' is not a relay op name (letters, digits, _; not clock)`);
      const text = args.map((a) => typeof a === "number" ? relayNumber(a) : typeof a === "boolean" ? a ? "1" : "0" : String(a));
      if (property !== void 0) this.value(name, target, `op.${name}.${property}`, text);
      else this.event(name, target, text);
    }
    /** The clock is not batched: its answer is timed from the moment it is sent. */
    requestClock() {
      const id = String(this.nextRequest++);
      return new Promise((resolve) => {
        this.waiting.set(id, resolve);
        this.platform.relaySend(relayPayload(this.slug, this.inst, [relayRecord("clock", 0, [id])]));
      });
    }
    /** Forgets clock requests nobody answered. */
    abandonClock() {
      this.waiting.clear();
    }
    /** Forgets what was sent, so that every value goes out again (after the kit was loaded anew). */
    forget() {
      this.last.clear();
    }
    flush() {
      if (!this.queue.length) return;
      const queue = this.queue;
      this.queue = [];
      const prefix = relayKey(this.slug, this.inst).length + 1;
      let batch = [];
      let size = prefix;
      const send = () => {
        if (!batch.length) return;
        this.payloadsSent++;
        this.recordsSent += batch.length;
        this.platform.relaySend(relayPayload(this.slug, this.inst, batch));
        batch = [];
        size = prefix;
      };
      for (const item of queue) {
        if (batch.length && size + item.record.length + 1 > MAX_PAYLOAD) send();
        batch.push(item.record);
        size += item.record.length + 1;
      }
      send();
    }
    warnOnce(key, message) {
      if (this.warned.has(key)) return;
      this.warned.add(key);
      this.platform.log("warn", `[${this.slug}:${this.inst}] ${message}`);
    }
    /** The wire form of a target: a Refs index, "@<path>", or null when the relay cannot reach the object. */
    resolve(op, target) {
      if (target.startsWith("@")) return target;
      const index = this.refs.indexOf(target);
      if (index >= 0) return index;
      if (!this.warned.has(target)) {
        this.warned.add(target);
        this.platform.log("warn", `[${this.slug}:${this.inst}] '${target}' is not in bindings.refs, so the relay graph cannot reach it (${op} ignored)`);
      }
      return null;
    }
    /** Queues a value. Sending the same value again does nothing; a newer one in the same tick replaces it. */
    value(op, target, property, args) {
      const wire = this.resolve(op, target);
      if (wire === null) return;
      const record = relayRecord(op, wire, args);
      const slot = `${wire}/${property}`;
      if (this.last.get(slot) === record) return;
      this.last.set(slot, record);
      const pending = this.queue.find((q) => q.slot === slot);
      if (pending) pending.record = record;
      else this.queue.push({ slot, record });
    }
    event(op, target, args) {
      const wire = this.resolve(op, target);
      if (wire === null) return;
      this.queue.push({ slot: null, record: relayRecord(op, wire, args) });
    }
  };
  var ClockSync = class {
    constructor(clock) {
      __publicField(this, "clock");
      __publicField(this, "offsetSeconds");
      __publicField(this, "synced", false);
      this.clock = clock;
      this.offsetSeconds = clock.wallSeconds() - clock.now() / 1e3;
    }
    /** `sentAt` and the present bracket the host's reading; it is placed halfway between them. */
    accept(hostSeconds, sentAtMs) {
      if (!Number.isFinite(hostSeconds)) return;
      const mid = (sentAtMs + this.clock.now()) / 2;
      this.offsetSeconds = hostSeconds - mid / 1e3;
      this.synced = true;
    }
    seconds() {
      return this.clock.now() / 1e3 + this.offsetSeconds;
    }
  };

  // portkit/src/scene.ts
  var Transform = class {
    constructor(gameObject) {
      __publicField(this, "gameObject");
      __publicField(this, "pos", Vector3.zero);
      __publicField(this, "rot", Quaternion.identity);
      __publicField(this, "lpos", Vector3.zero);
      __publicField(this, "lrot", Quaternion.identity);
      __publicField(this, "lscale", Vector3.one);
      /** False until the world pose has been read from the host or set by the script. */
      __publicField(this, "known", false);
      this.gameObject = gameObject;
    }
    /** World position as last set or reported. Returns a copy, as a C# struct would be. */
    get position() {
      return this.pos.clone();
    }
    set position(v) {
      this.pos = v.clone();
      this.known = true;
      this.gameObject.host?.setTransform({ position: v.clone() });
    }
    get rotation() {
      return this.rot.clone();
    }
    set rotation(q) {
      this.rot = q.clone();
      this.known = true;
      this.gameObject.host?.setTransform({ rotation: q.clone() });
    }
    get eulerAngles() {
      return this.rot.eulerAngles;
    }
    set eulerAngles(v) {
      this.rotation = Quaternion.Euler(v.x, v.y, v.z);
    }
    /** Local values are only what the script itself set: the host is not asked for them. */
    get localPosition() {
      return this.lpos.clone();
    }
    set localPosition(v) {
      this.lpos = v.clone();
      this.gameObject.host?.setTransform({ localPosition: v.clone() });
    }
    get localRotation() {
      return this.lrot.clone();
    }
    set localRotation(q) {
      this.lrot = q.clone();
      this.gameObject.host?.setTransform({ localRotation: q.clone() });
    }
    get localScale() {
      return this.lscale.clone();
    }
    set localScale(v) {
      this.lscale = v.clone();
      this.gameObject.host?.setTransform({ localScale: v.clone() });
    }
    get forward() {
      return this.rot.rotate(Vector3.forward);
    }
    get up() {
      return this.rot.rotate(Vector3.up);
    }
    get right() {
      return this.rot.rotate(Vector3.right);
    }
    SetPositionAndRotation(position, rotation) {
      this.pos = position.clone();
      this.rot = rotation.clone();
      this.known = true;
      this.gameObject.host?.setTransform({ position: position.clone(), rotation: rotation.clone() });
    }
    /** Asks the host where the object is now (after a drop, or physics). Await it before reading `position`. */
    async Refresh() {
      const pose2 = await this.gameObject.host?.readTransform();
      if (pose2) this._report(pose2.position, pose2.rotation);
    }
    /** @internal The host reported the object's pose. */
    _report(position, rotation) {
      this.pos = position.clone();
      this.rot = rotation.clone();
      this.known = true;
    }
  };
  var GameObject = class {
    constructor(key, name, host, actions, subscribe2 = null) {
      /** The key in bindings.objects, or "" for an object that only exists in the script. */
      __publicField(this, "key");
      __publicField(this, "name");
      __publicField(this, "transform");
      /** @internal */
      __publicField(this, "host");
      __publicField(this, "actions");
      __publicField(this, "subscribe");
      __publicField(this, "active", true);
      __publicField(this, "layerValue", -1);
      this.key = key;
      this.name = name;
      this.host = host;
      this.actions = actions;
      this.subscribe = subscribe2;
      this.transform = new Transform(this);
    }
    /** As last set by the script (objects start active unless the script says otherwise). */
    get activeSelf() {
      return this.active;
    }
    SetActive(active) {
      this.active = !!active;
      if (this.actions && this.key) this.actions.setActive(this.key, this.active);
      else this.host?.setActive(this.active);
    }
    /**
     * The object's layer as last set by the script (-1 before that: the kit's own). Setting it moves the object's
     * collider: 20 (Grabbable) for a pickup that may be picked up, 5 (UI) for one that may not, which is then
     * clickable and lets hands pass through. Only what changes is sent.
     */
    get layer() {
      return this.layerValue;
    }
    set layer(value) {
      const layer = Math.trunc(value);
      if (layer === this.layerValue) return;
      this.layerValue = layer;
      this.host?.setLayer(layer);
    }
    /**
     * Listens to this object's events: the page's own (click, grab, drop, ...) and those a graph reports for it
     * (uiButton, uiSlider, heldTrigger, ...). Prefer `events` in bindings.json; this is for wiring made in code.
     * The listener lives as long as the instance.
     */
    On(kind, handler) {
      if (this.subscribe) this.subscribe(kind, handler);
      else this.host?.on(kind, handler);
    }
    /**
     * Attaches this object to the local player's hand (0 left, 1 right), at an offset from it (BS.AttachedObject;
     * UNVERIFIED in Play mode). Only the local player can be attached to; other players see it only through a synced
     * transform.
     */
    AttachToHand(side, position = new Vector3(), rotation = new Quaternion()) {
      this.host?.attachToHand(side, position, rotation);
    }
    /** Lets go of what AttachToHand attached. */
    Detach() {
      this.host?.detach();
    }
    /** Makes the local player let go of this object if they hold it (VRChat: VRCPickup.Drop()); `drop` follows. */
    ReleaseGrab() {
      this.host?.releaseGrab();
    }
    /** Asks to own the object's synced transform (VRChat: Networking.SetOwner on a VRCObjectSync). */
    TakeOwnership() {
      this.host?.takeOwnership();
    }
    toString() {
      return this.name || this.key;
    }
  };
  var ComponentRef = class {
    constructor(kind, gameObject, actions) {
      __publicField(this, "kind");
      __publicField(this, "gameObject");
      __publicField(this, "actions");
      this.kind = kind;
      this.gameObject = gameObject;
      this.actions = actions;
    }
    get transform() {
      return this.gameObject.transform;
    }
  };
  var TextRef = class extends ComponentRef {
    constructor() {
      super(...arguments);
      __publicField(this, "value", "");
    }
    get text() {
      return this.value;
    }
    set text(value) {
      const next = value === null || value === void 0 ? "" : String(value);
      if (next === this.value) return;
      this.value = next;
      this.actions.setText(this.gameObject.key, next);
    }
    /** The colour of the text (a uGUI graphic). */
    set color(value) {
      this.actions.uiColor(this.gameObject.key, value);
    }
  };
  var AnimatorRef = class extends ComponentRef {
    constructor() {
      super(...arguments);
      __publicField(this, "on", true);
    }
    /** Animator.enabled: a disabled animator holds its pose. Reading gives what the script last set. */
    get enabled() {
      return this.on;
    }
    set enabled(value) {
      this.on = !!value;
      this.actions.animEnabled(this.gameObject.key, this.on);
    }
    SetBool(name, value) {
      this.actions.animBool(this.gameObject.key, name, value);
    }
    SetFloat(name, value) {
      this.actions.animFloat(this.gameObject.key, name, value);
    }
    SetInteger(name, value) {
      this.actions.animInt(this.gameObject.key, name, value);
    }
    SetTrigger(name) {
      this.actions.animTrigger(this.gameObject.key, name);
    }
    ResetTrigger(name) {
      this.actions.animResetTrigger(this.gameObject.key, name);
    }
    Play(state) {
      this.actions.animPlay(this.gameObject.key, state, 0);
    }
    CrossFade(state, seconds2) {
      this.actions.animPlay(this.gameObject.key, state, seconds2);
    }
  };
  var ParticleSystemRef = class extends ComponentRef {
    Play() {
      this.actions.particles(this.gameObject.key, true);
    }
    Stop() {
      this.actions.particles(this.gameObject.key, false);
    }
  };
  var RendererRef = class extends ComponentRef {
    /** Sets a colour property of one of the renderer's materials, "_BaseColor" of slot 0 by default (URP). */
    SetColor(color, property = "_BaseColor", slot = 0) {
      this.actions.setColor(this.gameObject.key, property, color, slot);
    }
    /** Sets a float property of one of the renderer's materials. */
    SetFloat(property, value, slot = 0) {
      this.actions.matFloat(this.gameObject.key, property, value, slot);
    }
  };
  var AudioSourceRef = class extends ComponentRef {
    constructor() {
      super(...arguments);
      __publicField(this, "pitchValue", 1);
      __publicField(this, "volumeValue", 1);
      /** The clip `Play()` plays (UnityEngine.AudioSource.clip). */
      __publicField(this, "clip", null);
    }
    /** Plays a clip (a `$clip` field value, or an index into this object's own clip list) through this audio source. */
    PlayOneShot(clip, volumeScale) {
      if (typeof clip === "number") this.actions.playClip(this.gameObject.key, clip, void 0, volumeScale);
      else this.actions.playClip(this.gameObject.key, clip.index, clip.on ?? void 0, volumeScale);
    }
    /** Plays `clip` as a one-shot (it overlaps a sound still playing instead of cutting it off). */
    Play() {
      if (this.clip) this.PlayOneShot(this.clip);
    }
    /** AudioSource.pitch (relay op `audioPitch`). Reading gives what the script last set. */
    get pitch() {
      return this.pitchValue;
    }
    set pitch(value) {
      this.pitchValue = value;
      this.actions.audioPitch(this.gameObject.key, value);
    }
    /** AudioSource.volume (relay op `audioVolume`). */
    get volume() {
      return this.volumeValue;
    }
    set volume(value) {
      this.volumeValue = value;
      this.actions.audioVolume(this.gameObject.key, value);
    }
  };
  var AudioClipRef = class {
    constructor(index, on = null) {
      __publicField(this, "index");
      __publicField(this, "on");
      this.index = index;
      this.on = on;
    }
  };
  function makeComponent(kind, gameObject, actions) {
    switch (kind) {
      case "Text":
      case "TMP":
        return new TextRef(kind, gameObject, actions);
      case "Animator":
        return new AnimatorRef(kind, gameObject, actions);
      case "ParticleSystem":
        return new ParticleSystemRef(kind, gameObject, actions);
      case "Renderer":
        return new RendererRef(kind, gameObject, actions);
      case "AudioSource":
        return new AudioSourceRef(kind, gameObject, actions);
      case "Transform":
        return gameObject.transform;
      default:
        return new ComponentRef(kind, gameObject, actions);
    }
  }

  // portkit/src/networking.ts
  var Networking = class {
    /** @internal */
    constructor(host) {
      __publicField(this, "host");
      this.host = host;
    }
    get LocalPlayer() {
      return this.host.localPlayer();
    }
    /** True on the one client that is this instance's referee (VRChat: the master). */
    get IsReferee() {
      return this.host.isReferee();
    }
    /** The same as IsReferee, under the name upstream code uses. */
    get IsMaster() {
      return this.host.isReferee();
    }
    /** The referee, or null while there is none. */
    get Master() {
      return this.host.refereePlayer();
    }
    /**
     * IsOwner(target): does the local player own it?  IsOwner(player, target): does that player?
     * A GameObject stands for the behaviours on it, as in Udon, where ownership belongs to the object.
     */
    IsOwner(a, b) {
      const player = b === void 0 ? this.host.localPlayer() : a;
      const target = b === void 0 ? a : b;
      const behaviour = this.first(target);
      return behaviour ? this.host.isOwner(behaviour, player) : false;
    }
    GetOwner(target) {
      const behaviour = this.first(target);
      return behaviour ? this.host.owner(behaviour) : null;
    }
    /**
     * Makes `player` the owner. It takes effect here at once; if someone else claimed at the same moment and the
     * room kept their claim, OnOwnershipTransferred reports the real owner a moment later.
     */
    SetOwner(player, target) {
      for (const behaviour of this.all(target)) this.host.setOwner(behaviour, player);
    }
    /** Synced time in seconds: the same on every client, to within the accuracy of the first clock exchange. */
    GetServerTimeInSeconds() {
      return this.host.serverSeconds();
    }
    GetServerTimeInMilliseconds() {
      return Math.floor(this.host.serverSeconds() * 1e3);
    }
    /** Everyone taking part in this instance, in player-id order (VRChat: VRCPlayerApi.GetPlayers). */
    GetPlayers() {
      return this.host.playerList();
    }
    GetPlayerCount() {
      return this.host.playerList().length;
    }
    GetPlayerById(id) {
      return this.host.playerById(id);
    }
    /**
     * While a network event or a command runs: the player who sent it (the local player for one sent here).
     * Null outside one, and null for a sender who is not taking part in this instance.
     */
    get CallingPlayer() {
      return this.host.callingPlayer();
    }
    /** The sender's session and user id, as the room stamped them, even when they are not a participant. */
    get CallingSession() {
      return this.host.callingSession();
    }
    /**
     * In a game whose referee candidates are "declared": offers the local player as referee, or withdraws them.
     * A referee who withdraws stops being referee and the remaining candidates elect another.
     */
    SetRefereeCandidate(on) {
      this.host.setCandidate(on);
    }
    IsRefereeCandidate(player) {
      return this.host.isCandidate(player);
    }
    /** Whether this client started a new game, resumed a saved one, or joined one in progress. */
    get StartKind() {
      return this.host.startKind();
    }
    /** Always false: the app queues and retries writes itself. Kept so that upstream checks translate. */
    get IsClogged() {
      return false;
    }
    all(target) {
      return target instanceof GameObject ? this.host.behavioursOn(target) : [target];
    }
    first(target) {
      return this.all(target)[0] ?? null;
    }
  };

  // portkit/src/persistence.ts
  var Persistence = class {
    constructor(store, slug, inst, uid) {
      __publicField(this, "store");
      __publicField(this, "prefix");
      this.store = store;
      this.prefix = storagePrefix(slug, inst, uid);
    }
    /** The saved value, or `fallback` when there is none or it cannot be read. */
    get(key, fallback) {
      let text = null;
      try {
        text = this.store.get(this.prefix + key);
      } catch {
        return fallback;
      }
      if (text === null) return fallback;
      try {
        return decodeValue(JSON.parse(text));
      } catch {
        return fallback;
      }
    }
    /** False when the device refused to store it (storage full or switched off). */
    set(key, value) {
      try {
        this.store.set(this.prefix + key, JSON.stringify(encodeValue(value)));
        return true;
      } catch {
        return false;
      }
    }
    has(key) {
      try {
        return this.store.get(this.prefix + key) !== null;
      } catch {
        return false;
      }
    }
    remove(key) {
      try {
        this.store.remove(this.prefix + key);
      } catch {
      }
    }
    keys() {
      try {
        return this.store.keys(this.prefix).map((k) => k.slice(this.prefix.length));
      } catch {
        return [];
      }
    }
  };

  // portkit/src/players.ts
  var ID_SETTLE_MS = 600;
  var Player = class {
    constructor(sid, uid, name, isLocal, playerId) {
      __publicField(this, "sid");
      __publicField(this, "uid");
      __publicField(this, "isLocal");
      __publicField(this, "displayName");
      __publicField(this, "playerId");
      /** The space's owner or a moderator, as the platform reports it. Not proof: check what the room accepted. */
      __publicField(this, "isSpaceAdmin", false);
      /** @internal */
      __publicField(this, "_valid", true);
      /** @internal */
      __publicField(this, "_isMaster", () => false);
      this.sid = sid;
      this.uid = uid;
      this.displayName = name;
      this.isLocal = isLocal;
      this.playerId = playerId;
    }
    /** False once the player has left: keep no references across OnPlayerLeft. */
    IsValid() {
      return this._valid;
    }
    get isMaster() {
      return this._valid && this._isMaster();
    }
    toString() {
      return `${this.displayName}#${this.playerId}`;
    }
  };
  var Players = class {
    constructor(core, presence, referee) {
      __publicField(this, "core");
      __publicField(this, "presence");
      __publicField(this, "referee");
      __publicField(this, "bySidMap", /* @__PURE__ */ new Map());
      __publicField(this, "claims", /* @__PURE__ */ new Map());
      __publicField(this, "handlers", []);
      __publicField(this, "localAssigned", deferred());
      __publicField(this, "highWater", 0);
      __publicField(this, "myId", 0);
      __publicField(this, "recheck", 0);
      this.core = core;
      this.presence = presence;
      this.referee = referee;
    }
    /** Starts following ids and claims one for the local player (who must have announced already). */
    start() {
      this.presence.on(() => this.refresh());
      this.presence.onExtra(() => this.refresh());
      this.refresh();
      this.claim();
    }
    /** Resolves once the local player's id has stood for the settle time. */
    whenLocalAssigned() {
      return this.localAssigned.promise;
    }
    get local() {
      return this.bySidMap.get(this.core.me.sid) ?? null;
    }
    bySid(sid) {
      return this.bySidMap.get(sid) ?? null;
    }
    byId(id) {
      for (const player of this.bySidMap.values()) if (player.playerId === id) return player;
      return null;
    }
    /** Everyone taking part, in player-id order. */
    list() {
      return [...this.bySidMap.values()].sort((a, b) => a.playerId - b.playerId);
    }
    on(handler) {
      this.handlers.push(handler);
    }
    /** Upkeep no event triggers. Called about once a second. */
    tend() {
      this.refresh();
    }
    idOf(sid) {
      const id = this.presence.extra(sid, "id");
      return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
    }
    claim() {
      let top = this.highWater;
      for (const who of this.presence.list()) {
        const id = this.idOf(who.sid);
        const hw = this.presence.extra(who.sid, "hw");
        if (id !== null && id > top) top = id;
        if (typeof hw === "number" && hw > top) top = hw;
      }
      this.myId = top + 1;
      this.highWater = this.myId;
      this.presence.setExtra("id", this.myId);
      this.presence.setExtra("hw", this.highWater);
      this.presence.flush();
    }
    refresh() {
      if (this.core.disposed) return;
      const clock = this.core.platform.clock;
      const now = clock.now();
      const me = this.core.me.sid;
      const present = this.presence.list();
      const holders = /* @__PURE__ */ new Map();
      let top = this.highWater;
      for (const who of present) {
        const id = this.idOf(who.sid);
        const hw = this.presence.extra(who.sid, "hw");
        if (typeof hw === "number" && hw > top) top = hw;
        if (id === null) {
          this.claims.delete(who.sid);
          continue;
        }
        if (id > top) top = id;
        const claim = this.claims.get(who.sid);
        if (!claim || claim.id !== id) this.claims.set(who.sid, { id, since: now });
        if (!holders.has(id)) holders.set(id, who.sid);
      }
      for (const sid of [...this.claims.keys()]) if (!this.presence.has(sid)) this.claims.delete(sid);
      if (this.myId > 0 && holders.get(this.myId) !== void 0 && holders.get(this.myId) !== me) {
        this.highWater = top;
        this.claim();
        return;
      }
      if (top > this.highWater) {
        this.highWater = top;
        if (this.myId > 0) this.presence.setExtra("hw", top);
      }
      const leaving = [];
      const joining = [];
      let nextCheck = Infinity;
      for (const player of this.bySidMap.values()) if (!this.presence.has(player.sid)) leaving.push(player);
      for (const who of present) {
        const claim = this.claims.get(who.sid);
        if (!claim || holders.get(claim.id) !== who.sid) continue;
        const existing = this.bySidMap.get(who.sid);
        if (existing) {
          existing.displayName = who.name;
          if (existing.playerId !== claim.id) {
            this.core.log("warn", `player ${existing.displayName} changed id ${existing.playerId} -> ${claim.id} after joining (two ids were claimed at once)`);
            existing.playerId = claim.id;
          }
          continue;
        }
        const ready = claim.since + ID_SETTLE_MS;
        const echoed = who.sid !== me || this.localEchoed();
        if (now >= ready && echoed) joining.push(this.make(who, claim.id));
        else nextCheck = Math.min(nextCheck, Math.max(ready, now + 50));
      }
      for (const player of leaving) {
        this.bySidMap.delete(player.sid);
        player._valid = false;
      }
      for (const player of joining) this.bySidMap.set(player.sid, player);
      for (const player of leaving) this.emit("leave", player);
      for (const player of joining.sort((a, b) => a.playerId - b.playerId)) this.emit("join", player);
      if (this.bySidMap.has(me)) this.localAssigned.resolve();
      if (this.recheck) this.core.scheduler.cancel(this.recheck);
      this.recheck = 0;
      if (nextCheck !== Infinity) {
        this.recheck = this.core.scheduler.after(nextCheck - now, () => {
          this.recheck = 0;
          this.refresh();
        });
      }
    }
    localEchoed() {
      const marker = safeParse(this.core.platform.userGet(this.core.me.sid, this.core.prefix + ".k"));
      return isRecord(marker) && isRecord(marker.x) && marker.x.id === this.myId;
    }
    make(who, id) {
      const player = new Player(who.sid, who.uid, who.name, who.isLocal, id);
      player._isMaster = () => this.referee.current()?.sid === player.sid;
      player.isSpaceAdmin = this.core.platform.players().find((p) => p.sid === who.sid)?.isAdmin === true;
      return player;
    }
    emit(kind, player) {
      for (const handler of this.handlers.slice()) this.core.guard("player handler", () => handler(kind, player));
    }
  };

  // portkit/src/presence.ts
  var Presence = class {
    constructor(core) {
      __publicField(this, "core");
      __publicField(this, "known", /* @__PURE__ */ new Map());
      __publicField(this, "extras", /* @__PURE__ */ new Map());
      __publicField(this, "texts", /* @__PURE__ */ new Map());
      /** Every public key each session has announced, kept after it leaves (a sealed box can outlive its sender's visit). */
      __publicField(this, "keysSeen", /* @__PURE__ */ new Map());
      __publicField(this, "handlers", []);
      __publicField(this, "extraHandlers", []);
      __publicField(this, "announced", null);
      __publicField(this, "localExtras", {});
      __publicField(this, "dirty", false);
      __publicField(this, "started", false);
      this.core = core;
    }
    get markerPath() {
      return this.core.prefix + ".k";
    }
    start() {
      if (this.started) return;
      this.started = true;
      const { platform } = this.core;
      this.core.own(platform.onPlayers(() => this.recompute()));
      this.core.own(
        platform.onUser(this.core.prefix + ".", (_sid, path) => {
          if (path === this.markerPath) this.recompute();
        })
      );
      this.recompute();
    }
    /** Publishes the local marker. From here on the local player is a participant. */
    announce(publicKey) {
      this.announced = publicKey;
      this.write();
      this.recompute();
    }
    /** Withdraws the marker, when the instance stops while its player stays in the room. */
    retire() {
      if (this.announced === null) return;
      this.announced = null;
      this.core.platform.userSet(this.markerPath, null);
    }
    /** Sets or (with undefined) removes one of the local player's published records. Sent at the end of the tick. */
    setExtra(name, value) {
      if (value === void 0) {
        if (!(name in this.localExtras)) return;
        delete this.localExtras[name];
      } else this.localExtras[name] = value;
      this.dirty = true;
      this.emitExtra(this.core.me.sid);
    }
    /** The local player's session id. */
    get localSid() {
      return this.core.me.sid;
    }
    /** A published record of any participant, from the mirror (the local player's own is read back at once). */
    extra(sid, name) {
      if (sid === this.core.me.sid) return this.localExtras[name];
      return this.extras.get(sid)?.[name];
    }
    /** Called when a participant's published records may have changed. */
    onExtra(handler) {
      this.extraHandlers.push(handler);
    }
    /** Looks again at who is here: a session id can change without an event. Called about once a second. */
    tend() {
      if (this.started) this.recompute();
    }
    /** Sends the marker if a record changed. Called once per tick. */
    flush() {
      if (!this.dirty || this.announced === null || this.core.disposed) return;
      this.write();
    }
    write() {
      this.dirty = false;
      const marker = { k: this.announced, v: 1 };
      if (Object.keys(this.localExtras).length) marker.x = this.localExtras;
      this.core.platform.userSet(this.markerPath, asciiJson(marker));
    }
    /** Participants ordered by user id, then session id: the order referee ranks and player ids follow. */
    list() {
      return [...this.known.values()].sort(compare);
    }
    has(sid) {
      return this.known.has(sid);
    }
    get(sid) {
      return this.known.get(sid);
    }
    /** The public key a session announced, now or before it left; undefined for a session never seen. */
    keyOf(sid) {
      return this.known.get(sid)?.publicKey ?? this.keysSeen.get(sid);
    }
    /** Position of `sid` in `list()`, or -1. */
    rank(sid) {
      return this.list().findIndex((p) => p.sid === sid);
    }
    on(handler) {
      this.handlers.push(handler);
    }
    recompute() {
      if (this.core.disposed) return;
      const { platform } = this.core;
      const now = /* @__PURE__ */ new Map();
      const changed = [];
      for (const player of platform.players()) {
        let key = null;
        if (player.isLocal) key = this.announced;
        else {
          const text = platform.userGet(player.sid, this.markerPath) ?? "";
          if (text !== this.texts.get(player.sid)) {
            this.texts.set(player.sid, text);
            const marker2 = safeParse(text);
            this.extras.set(player.sid, isRecord(marker2) && isRecord(marker2.x) ? marker2.x : {});
            changed.push(player.sid);
          }
          const marker = safeParse(text);
          if (isRecord(marker) && typeof marker.k === "string" && marker.k.length > 0) key = marker.k;
        }
        if (key === null) continue;
        now.set(player.sid, { sid: player.sid, uid: player.uid, name: player.name, isLocal: player.isLocal, publicKey: key });
      }
      const left = [];
      const joined = [];
      for (const [sid, who] of this.known) if (!now.has(sid)) left.push(who);
      for (const [sid, who] of now) {
        const before = this.known.get(sid);
        if (!before) joined.push(who);
        else {
          before.name = who.name;
          before.publicKey = who.publicKey;
        }
      }
      for (const who of now.values()) this.keysSeen.set(who.sid, who.publicKey);
      for (const who of left) {
        this.known.delete(who.sid);
        this.extras.delete(who.sid);
        this.texts.delete(who.sid);
      }
      for (const who of joined) this.known.set(who.sid, who);
      for (const who of left.sort(compare)) this.emit("leave", who);
      for (const who of joined.sort(compare)) this.emit("join", who);
      for (const sid of changed) if (this.known.has(sid)) this.emitExtra(sid);
    }
    emit(kind, who) {
      for (const handler of this.handlers.slice()) this.core.guard("presence handler", () => handler(kind, who));
    }
    emitExtra(sid) {
      for (const handler of this.extraHandlers.slice()) this.core.guard("presence record handler", () => handler(sid));
    }
  };
  function compare(a, b) {
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0;
  }

  // portkit/src/protect.ts
  var ProtectedValues = class {
    constructor(core) {
      __publicField(this, "core");
      /** Told when a protected value changed. */
      __publicField(this, "onChanged", () => {
      });
      this.core = core;
    }
    listen() {
      this.core.onState((key) => {
        if (key.startsWith("x.")) this.core.guard("OnProtectedChanged", () => this.onChanged(key.slice(2)));
      });
    }
    get CanWrite() {
      return this.core.platform.local().isAdmin;
    }
    Set(key, value) {
      if (!isPathSegment(key)) throw new Error(`a protected key must be 1-64 of A-Z a-z 0-9 _ - @, not '${key}'`);
      if (this.core.disposed) return;
      this.core.platform.stateSetProtected(`${this.core.prefix}.x.${key}`, asciiJson({ v: encodeValue(value) }));
    }
    Get(key, fallback) {
      const raw = safeParse(this.core.get(`x.${key}`));
      return raw && typeof raw === "object" && "v" in raw ? decodeValue(raw.v) : fallback;
    }
    Has(key) {
      const raw = safeParse(this.core.get(`x.${key}`));
      return !!raw && typeof raw === "object" && "v" in raw;
    }
  };

  // portkit/src/referee.ts
  var CROSSING_MS = 1500;
  var Referee = class {
    constructor(core, presence, rule) {
      __publicField(this, "core");
      __publicField(this, "presence");
      __publicField(this, "rule");
      __publicField(this, "handlers", []);
      __publicField(this, "judging", false);
      __publicField(this, "timer", 0);
      __publicField(this, "timerDue", -1);
      __publicField(this, "invalidSince", 0);
      __publicField(this, "claimAt", -Infinity);
      __publicField(this, "seen", null);
      __publicField(this, "lastEpoch", 0);
      __publicField(this, "declared", false);
      /** Counters for tests and diagnostics. */
      __publicField(this, "claims", 0);
      /** What this client found when it last claimed: a new epoch, or a game other participants were still running. */
      __publicField(this, "lastClaim", null);
      this.core = core;
      this.presence = presence;
      this.rule = rule;
    }
    start() {
      this.core.onState((key) => {
        if (key === "ref") this.check();
      });
      this.presence.on(() => this.check());
      this.presence.onExtra(() => this.check());
      this.invalidSince = this.core.platform.clock.now();
      this.check();
      this.core.scheduler.after(this.core.options.settleMs, () => {
        this.judging = true;
        this.invalidSince = this.core.platform.clock.now();
        this.check();
      });
    }
    /** The mirrored record, whether or not its session is still a candidate. */
    mirrored() {
      const raw = safeParse(this.core.get("ref"));
      if (!isRecord(raw) || typeof raw.sid !== "string" || typeof raw.uid !== "string") return null;
      if (typeof raw.term !== "number" || typeof raw.e !== "number") return null;
      return { sid: raw.sid, uid: raw.uid, term: raw.term, e: raw.e };
    }
    /** The referee, or null while there is none. */
    current() {
      const m = this.mirrored();
      return m && this.isCandidate(m.sid) ? m : null;
    }
    isMe() {
      return this.current()?.sid === this.core.me.sid;
    }
    /** The epoch of the last valid referee seen: records of any other epoch are ignored. 0 before the first. */
    get epoch() {
      return this.lastEpoch;
    }
    /** May this session be elected? */
    isCandidate(sid) {
      if (!this.presence.has(sid)) return false;
      return this.rule === "anyone" || this.presence.extra(sid, "rc") === 1;
    }
    /** Candidates in rank order. */
    candidates() {
      return this.presence.list().filter((p) => this.isCandidate(p.sid)).map((p) => p.sid);
    }
    /** Under the "declared" rule: offers the local player as referee, or withdraws the offer. */
    setCandidate(on) {
      if (this.declared === on) return;
      this.declared = on;
      this.presence.setExtra("rc", on ? 1 : void 0);
      this.presence.flush();
    }
    /** Tells the others which epoch this client is running in, so a claimant knows the game is still alive. */
    publishEpoch() {
      if (this.presence.extra(this.core.me.sid, "ep") === this.lastEpoch) return;
      this.presence.setExtra("ep", this.lastEpoch);
      this.presence.flush();
    }
    on(handler) {
      this.handlers.push(handler);
    }
    check() {
      if (this.core.disposed) return;
      const now = this.current();
      const before = this.seen;
      if (now) {
        this.cancelTimer();
        if (!before || before.sid !== now.sid || before.term !== now.term || before.e !== now.e) {
          const me2 = this.core.me.sid;
          if (before && before.sid === me2 && now.sid !== me2 && this.isCandidate(me2) && this.core.platform.clock.now() - this.claimAt > CROSSING_MS) {
            this.core.log("warn", `the referee seat was taken by session ${now.sid} (term ${now.term}) while this client was referee`);
          }
          this.lastEpoch = now.e;
          this.seen = now;
          this.publishEpoch();
          this.emit(now, before);
        }
        return;
      }
      if (before) {
        this.seen = null;
        this.invalidSince = this.core.platform.clock.now();
        this.claimAt = -Infinity;
        this.emit(null, before);
      }
      if (!this.judging) return;
      const me = this.core.me.sid;
      const rank = this.candidates().indexOf(me);
      if (rank < 0) {
        this.cancelTimer();
        return;
      }
      const earliest = Math.max(this.invalidSince + rank * this.core.options.claimStepMs, this.claimAt + this.core.options.claimRetryMs);
      if (this.timer && this.timerDue === earliest) return;
      this.cancelTimer();
      this.timerDue = earliest;
      this.timer = this.core.scheduler.after(Math.max(0, earliest - this.core.platform.clock.now()), () => {
        this.timer = 0;
        this.claim();
      });
    }
    claim() {
      if (this.core.disposed || this.current()) return;
      const me = this.core.me;
      if (!this.isCandidate(me.sid)) return;
      const old = this.mirrored();
      const alive = old !== null && this.presence.list().some((p) => this.presence.extra(p.sid, "ep") === old.e);
      const fresh = old === null || this.core.options.whenEmpty === "reset" && !alive;
      const record = { sid: me.sid, uid: me.uid, term: (old?.term ?? 0) + 1, e: (old?.e ?? 0) + (fresh ? 1 : 0) };
      this.claims++;
      this.lastClaim = { term: record.term, fresh, alive };
      this.claimAt = this.core.platform.clock.now();
      this.core.log("info", `claiming referee, term ${record.term}, epoch ${record.e}${fresh && old ? " (fresh start)" : ""}`);
      this.core.set("ref", asciiJson(record));
      this.check();
    }
    cancelTimer() {
      if (this.timer) this.core.scheduler.cancel(this.timer);
      this.timer = 0;
      this.timerDue = -1;
    }
    emit(now, before) {
      for (const handler of this.handlers.slice()) this.core.guard("referee handler", () => handler(now, before));
    }
  };

  // portkit/src/scheduler.ts
  var TICK_MS = 50;
  var TICK_SECONDS = TICK_MS / 1e3;
  var Scheduler = class {
    constructor(clock, onError) {
      __publicField(this, "clock");
      __publicField(this, "onError");
      __publicField(this, "delayed", /* @__PURE__ */ new Map());
      __publicField(this, "framed", []);
      __publicField(this, "nextHandle", 1);
      __publicField(this, "tickTimer", 0);
      __publicField(this, "running", false);
      __publicField(this, "stopped", false);
      __publicField(this, "startedAt", 0);
      __publicField(this, "lastTickAt", 0);
      __publicField(this, "tickCount", 0);
      /** Seconds the last tick covered (0 outside a tick's first run). */
      __publicField(this, "deltaTime", 0);
      this.clock = clock;
      this.onError = onError;
      this.startedAt = clock.now();
      this.lastTickAt = this.startedAt;
    }
    /** Seconds since the scheduler was made. */
    get time() {
      return (this.clock.now() - this.startedAt) / 1e3;
    }
    get ticks() {
      return this.tickCount;
    }
    /** Starts the tick. `onTick` runs every 50 ms; a page that stalled is not paid back with a burst of ticks. */
    start(onTick) {
      if (this.running || this.stopped) return;
      this.running = true;
      this.lastTickAt = this.clock.now();
      const step = () => {
        if (!this.running) return;
        const now = this.clock.now();
        const elapsed = now - this.lastTickAt;
        this.lastTickAt = now;
        this.tickCount++;
        this.deltaTime = Math.min(0.25, Math.max(1e-3, elapsed / 1e3));
        const due = this.framed.filter((f2) => --f2.ticks <= 0);
        if (due.length) this.framed = this.framed.filter((f2) => f2.ticks > 0);
        for (const f2 of due) this.guard("delayed frames", f2.fn);
        this.guard("tick", () => onTick(this.deltaTime));
        if (this.running) this.tickTimer = this.clock.setTimeout(step, TICK_MS);
      };
      this.tickTimer = this.clock.setTimeout(step, TICK_MS);
    }
    /** Runs `fn` once after `ms`. Returns a handle for `cancel`. */
    after(ms, fn) {
      const id = this.nextHandle++;
      if (this.stopped) return id;
      const timer = this.clock.setTimeout(
        () => {
          if (!this.delayed.delete(id)) return;
          this.guard("delayed event", fn);
        },
        Math.max(0, ms)
      );
      this.delayed.set(id, { timer });
      return id;
    }
    /** Runs `fn` at the start of the tick `ticks` ticks from now (at least the next one). */
    afterTicks(ticks, fn) {
      const id = this.nextHandle++;
      if (!this.stopped) this.framed.push({ id, ticks: Math.max(1, Math.floor(ticks)), fn });
      return id;
    }
    cancel(handle) {
      const d = this.delayed.get(handle);
      if (d) {
        this.clock.clearTimeout(d.timer);
        this.delayed.delete(handle);
        return;
      }
      this.framed = this.framed.filter((f2) => f2.id !== handle);
    }
    /** Cancels the tick and every pending delayed event. The scheduler cannot be started again. */
    stop() {
      this.running = false;
      this.stopped = true;
      this.clock.clearTimeout(this.tickTimer);
      for (const d of this.delayed.values()) this.clock.clearTimeout(d.timer);
      this.delayed.clear();
      this.framed = [];
    }
    get pending() {
      return this.delayed.size + this.framed.length;
    }
    guard(where, fn) {
      try {
        fn();
      } catch (error) {
        this.onError(where, error);
      }
    }
  };

  // portkit/src/sha256.ts
  var K = new Uint32Array([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  function sha256(message) {
    const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
    const length = message.length;
    const padded = new Uint8Array((length + 8 >> 6) + 1 << 6);
    padded.set(message);
    padded[length] = 128;
    const bits = length * 8;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bits / 4294967296));
    view.setUint32(padded.length - 4, bits >>> 0);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const a2 = w[i - 15];
        const b2 = w[i - 2];
        const s0 = (a2 >>> 7 | a2 << 25) ^ (a2 >>> 18 | a2 << 14) ^ a2 >>> 3;
        const s1 = (b2 >>> 17 | b2 << 15) ^ (b2 >>> 19 | b2 << 13) ^ b2 >>> 10;
        w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f2 = h[5], g = h[6], hh = h[7];
      for (let i = 0; i < 64; i++) {
        const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
        const ch = e & f2 ^ ~e & g;
        const t1 = hh + s1 + ch + K[i] + w[i] | 0;
        const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
        const maj = a & b ^ a & c ^ b & c;
        const t2 = s0 + maj | 0;
        hh = g;
        g = f2;
        f2 = e;
        e = d + t1 | 0;
        d = c;
        c = b;
        b = a;
        a = t1 + t2 | 0;
      }
      h[0] = h[0] + a | 0;
      h[1] = h[1] + b | 0;
      h[2] = h[2] + c | 0;
      h[3] = h[3] + d | 0;
      h[4] = h[4] + e | 0;
      h[5] = h[5] + f2 | 0;
      h[6] = h[6] + g | 0;
      h[7] = h[7] + hh | 0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
    return out;
  }
  function sha256Text(text) {
    return toBase64(sha256(utf8Encode(text)));
  }
  function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }

  // portkit/src/secrets.ts
  var Draw = class {
    constructor(seed) {
      __publicField(this, "seed");
      this.seed = seed;
    }
    /** An integer in [0, maxExclusive). `index` picks which of the draw's numbers: die 0, die 1, ... */
    Int(maxExclusive, index = 0) {
      const h = sha256(utf8Encode(`${this.seed}
${index}`));
      const n = h[0] * 2 ** 40 + h[1] * 2 ** 32 + h[2] * 2 ** 24 + h[3] * 2 ** 16 + h[4] * 2 ** 8 + h[5];
      return n % Math.max(1, Math.floor(maxExclusive));
    }
    Ints(count, maxExclusive) {
      const out = [];
      for (let i = 0; i < count; i++) out.push(this.Int(maxExclusive, i));
      return out;
    }
    /** In [0, 1). */
    Float(index = 0) {
      return this.Int(2 ** 32, index) / 2 ** 32;
    }
    toString() {
      return this.seed;
    }
  };
  var DRAW_KEEP_MS = 12e4;
  function parseDrawEntry(e) {
    if (!Array.isArray(e) || typeof e[0] !== "string" || typeof e[1] !== "string" || typeof e[2] !== "string") return null;
    return [e[0], e[1], e[2], typeof e[3] === "number" ? e[3] : 0, e[4] === 1 ? 1 : 0, typeof e[5] === "string" ? e[5] : ""];
  }
  var CURVE = { name: "ECDH", namedCurve: "P-256" };
  function parseDeal(raw) {
    if (!isRecord(raw) || typeof raw.l !== "string" || typeof raw.h !== "string" || !Array.isArray(raw.s)) return null;
    return { l: raw.l, h: raw.h, s: raw.s.filter((x) => typeof x === "string"), p: raw.p === 1 ? 1 : 0, r: typeof raw.r === "string" ? raw.r : void 0 };
  }
  function parseContribution(raw) {
    if (!isRecord(raw) || typeof raw.l !== "string" || typeof raw.h !== "string") return null;
    return { l: raw.l, h: raw.h, c: typeof raw.c === "string" ? raw.c : void 0 };
  }
  var Secrets = class {
    constructor(core, presence, referee, nowSeconds) {
      __publicField(this, "core");
      __publicField(this, "presence");
      __publicField(this, "referee");
      __publicField(this, "crypto");
      __publicField(this, "nowSeconds");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __publicField(this, "privateKey", null);
      __publicField(this, "publicKeyText", "");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __publicField(this, "derived", /* @__PURE__ */ new Map());
      __publicField(this, "mySecret", null);
      __publicField(this, "lastStates", /* @__PURE__ */ new Map());
      /** The referee's numbers and judgements, read from the referee's own user state. */
      __publicField(this, "numbers");
      __publicField(this, "pins", /* @__PURE__ */ new Map());
      __publicField(this, "pinsEpoch", -1);
      __publicField(this, "warnedPins", /* @__PURE__ */ new Set());
      __publicField(this, "goneSince", /* @__PURE__ */ new Map());
      __publicField(this, "drawStore", null);
      __publicField(this, "drawKey", "");
      __publicField(this, "restoring", null);
      /** The referee's own seed for its current deal. */
      __publicField(this, "dealSeed", null);
      /** This player's contribution to a deal. */
      __publicField(this, "myContribution", null);
      /** Commitments and contributions as first seen, per deal label and session (they outlive a player's visit). */
      __publicField(this, "dealSeen", /* @__PURE__ */ new Map());
      /** Told when a player's draw changes state. */
      __publicField(this, "onDrawChanged", () => {
      });
      this.core = core;
      this.presence = presence;
      this.referee = referee;
      this.crypto = core.platform.crypto;
      this.nowSeconds = nowSeconds;
      this.numbers = new RefereeTable(presence, referee, "fn", parseDrawEntry);
    }
    /** Starts following commitments, the referee's numbers and reveals. */
    listen() {
      this.presence.onExtra(() => this.review());
      this.presence.on(() => this.review());
      this.referee.on(() => this.review());
    }
    /** `n` bytes from the strong generator (WebCrypto; seeded in the fake room). */
    RandomBytes(n) {
      return this.crypto.getRandomValues(new Uint8Array(Math.max(0, Math.floor(n))));
    }
    // ---- commit / reveal ----------------------------------------------------------------------------------------
    commit(value) {
      const nonce = toBase64(this.crypto.getRandomValues(new Uint8Array(16)));
      const opening = { v: encodeValue(value), s: nonce };
      const hash = hashOpening(opening);
      return { hash, reveal: () => ({ v: opening.v, s: opening.s }) };
    }
    /** True when `opening` is what `hash` committed to. */
    verify(hash, opening) {
      if (!opening || typeof opening.s !== "string" || typeof hash !== "string") return false;
      return hashOpening(opening) === hash;
    }
    /** The value inside an opening, with value types rebuilt. Check it with `verify` first. */
    valueOf(opening) {
      return decodeValue(opening.v);
    }
    /** Publishes one of the local player's commitments under `label`, in their own user state. */
    publish(label, hash) {
      const all = { ...this.own("c") };
      all[label] = hash;
      this.presence.setExtra("c", all);
    }
    /** Takes a published commitment back (when its round is over). */
    retract(label) {
      const all = { ...this.own("c") };
      delete all[label];
      this.presence.setExtra("c", Object.keys(all).length ? all : void 0);
    }
    /** The commitment a participant published under `label`, or null. Only that player can have written it. */
    published(sid, label) {
      const all = this.presence.extra(sid, "c");
      return isRecord(all) && typeof all[label] === "string" ? all[label] : null;
    }
    own(name) {
      const value = this.presence.extra(this.core.me.sid, name);
      return isRecord(value) ? value : {};
    }
    // ---- fair draws ---------------------------------------------------------------------------------------------
    //
    // Where each part lives, so that nobody can change another player's part:
    //   x.fd  [label, hash]          the player's commitment, in the player's own user state
    //   x.fr  [label, secret]        the player's reveal, in the player's own user state
    //   x.fn  {e, m: {sid: entry}}   the referee's numbers and judgements, in the referee's own user state
    //                                (refrecord.ts); entry = [label, hash, number, deadline, forfeit, uid]
    // Each client also keeps the first hash and number it saw for a player's label in this epoch (`pins`): a later
    // table that changes them (a referee seat taken over by a modified client) is not believed.
    /** Starts a draw for the local player under `label` (a round name). It replaces their previous draw. */
    beginDraw(label) {
      const secret = toBase64(this.crypto.getRandomValues(new Uint8Array(16)));
      this.mySecret = { label, secret };
      this.restoring = null;
      this.saveDraw(false);
      this.presence.setExtra("fr", void 0);
      this.presence.setExtra("fd", [label, sha256Text(secret)]);
    }
    /** Publishes the local player's secret for `label`, so everyone can compute and check the draw. */
    revealDraw(label) {
      if (!this.mySecret || this.mySecret.label !== label) return;
      this.saveDraw(true);
      this.presence.setExtra("fr", [label, this.mySecret.secret]);
    }
    /** The referee starts the clock: draws under `label` not revealed within `seconds` are forfeit. */
    demandReveal(label, seconds2) {
      if (!this.referee.isMe()) return;
      const table = this.numbers.working();
      const deadline = this.nowSeconds() + seconds2;
      let changed = false;
      for (const sid of Object.keys(table)) {
        const entry = table[sid];
        if (entry[0] === label && entry[3] === 0 && entry[4] === 0) {
          entry[3] = deadline;
          changed = true;
        }
      }
      if (changed) this.numbers.write(table);
    }
    /** Where a participant's draw under `label` stands, and the draw itself once this client may know it. */
    drawOf(sid, label) {
      const entry = this.entryOf(sid);
      const committed = this.presence.extra(sid, "fd");
      const hasCommit = Array.isArray(committed) && committed[0] === label && typeof committed[1] === "string";
      if (!entry || entry[0] !== label) return { state: hasCommit ? "committed" : "none", draw: null };
      const [, hash, number, , forfeit] = entry;
      if (hasCommit && committed[1] !== hash) return { state: "rejected", draw: null };
      const revealed = this.presence.extra(sid, "fr");
      if (Array.isArray(revealed) && revealed[0] === label && typeof revealed[1] === "string") {
        if (sha256Text(revealed[1]) !== hash) return { state: "rejected", draw: null };
        if (forfeit) return { state: "forfeit", draw: null };
        return { state: "revealed", draw: new Draw(drawSeed(revealed[1], number, label)) };
      }
      if (forfeit) return { state: "forfeit", draw: null };
      if (sid === this.core.me.sid && this.mySecret && this.mySecret.label === label && sha256Text(this.mySecret.secret) === hash) {
        return { state: "numbered", draw: new Draw(drawSeed(this.mySecret.secret, number, label)) };
      }
      return { state: "numbered", draw: null };
    }
    /** The local player's own draw under `label`, as soon as the referee's number is in. */
    myDraw(label) {
      return this.drawOf(this.core.me.sid, label).draw;
    }
    /** A participant's entry in the referee's table, with the hash and number this client saw first. */
    entryOf(sid) {
      const entry = this.numbers.read()[sid];
      if (!entry) return null;
      const epoch = this.referee.epoch;
      if (this.pinsEpoch !== epoch) {
        this.pins.clear();
        this.pinsEpoch = epoch;
      }
      const key = `${entry[5]}
${entry[0]}`;
      const pin = this.pins.get(key);
      if (!pin) {
        this.pins.set(key, [entry[1], entry[2]]);
        return entry;
      }
      if (pin[0] !== entry[1] || pin[1] !== entry[2]) {
        if (!this.warnedPins.has(key)) {
          this.warnedPins.add(key);
          this.core.log("warn", `the referee's table changed the pinned commitment or number of a draw (${entry[0]}); keeping the first one seen`);
        }
        return [entry[0], pin[0], pin[1], entry[3], entry[4], entry[5]];
      }
      return entry;
    }
    /** Looks at every participant's draw: the referee answers and judges, and everyone reports changes. */
    review() {
      if (this.core.disposed) return;
      this.reviewDeal();
      this.restoreDraw();
      if (this.referee.isMe()) this.officiate();
      for (const who of this.presence.list()) {
        const committed = this.presence.extra(who.sid, "fd");
        const entry = this.entryOf(who.sid);
        const label = entry ? entry[0] : Array.isArray(committed) && typeof committed[0] === "string" ? committed[0] : null;
        if (label === null) continue;
        const status = this.drawOf(who.sid, label);
        const mark = `${label}
${status.state}`;
        if (this.lastStates.get(who.sid) === mark) continue;
        this.lastStates.set(who.sid, mark);
        this.core.guard("draw handler", () => this.onDrawChanged(who.sid, label, status));
      }
    }
    officiate() {
      const table = this.numbers.working();
      let changed = false;
      const now = this.nowSeconds();
      const clock = this.core.platform.clock.now();
      for (const sid of Object.keys(table)) {
        if (this.presence.has(sid)) {
          this.goneSince.delete(sid);
          continue;
        }
        const since = this.goneSince.get(sid) ?? clock;
        this.goneSince.set(sid, since);
        if (clock - since >= DRAW_KEEP_MS) {
          delete table[sid];
          this.goneSince.delete(sid);
          changed = true;
        }
      }
      for (const who of this.presence.list()) {
        const committed = this.presence.extra(who.sid, "fd");
        const entry = table[who.sid];
        if (Array.isArray(committed) && typeof committed[0] === "string" && typeof committed[1] === "string") {
          if (!entry || entry[0] !== committed[0]) {
            const before = Object.keys(table).find((sid) => {
              const e = table[sid];
              return !this.presence.has(sid) && e[5] === who.uid && e[0] === committed[0] && e[1] === committed[1];
            });
            if (before !== void 0) {
              table[who.sid] = table[before];
              delete table[before];
              this.goneSince.delete(before);
            } else table[who.sid] = [committed[0], committed[1], toBase64(this.crypto.getRandomValues(new Uint8Array(16))), 0, 0, who.uid];
            changed = true;
            continue;
          }
        }
        if (entry && entry[3] > 0 && entry[4] === 0 && now >= entry[3]) {
          const revealed = this.presence.extra(who.sid, "fr");
          const ok = Array.isArray(revealed) && revealed[0] === entry[0] && typeof revealed[1] === "string" && sha256Text(revealed[1]) === entry[1];
          if (!ok) {
            entry[4] = 1;
            changed = true;
          }
        }
      }
      if (changed) this.numbers.write(table);
    }
    saveDraw(revealed) {
      if (!this.drawStore || !this.mySecret) return;
      try {
        this.drawStore.set(this.drawKey, JSON.stringify({ e: this.referee.epoch, l: this.mySecret.label, s: this.mySecret.secret, r: revealed ? 1 : 0 }));
      } catch {
      }
    }
    /**
     * After a page reload: the secret this device saved comes back once the referee's table (as last mirrored)
     * still holds this user's entry for it; the commitment (and the reveal, if it was made) is published again and
     * the referee moves the entry to the new session.
     */
    restoreDraw() {
      const saved = this.restoring;
      if (!saved || this.mySecret) return;
      const epoch = this.referee.epoch;
      if (epoch === 0) return;
      if (saved.e !== 0 && saved.e !== epoch) {
        this.restoring = null;
        return;
      }
      const hash = sha256Text(saved.s);
      const table = this.numbers.read();
      const mine = Object.keys(table).map((sid) => table[sid]).filter((e) => e[5] === this.core.me.uid);
      if (mine.some((e) => e[0] === saved.l && e[1] === hash)) {
        this.restoring = null;
        this.mySecret = { label: saved.l, secret: saved.s };
        this.presence.setExtra("fd", [saved.l, hash]);
        if (saved.r) this.presence.setExtra("fr", [saved.l, saved.s]);
        this.core.log("info", `the draw '${saved.l}' came back after a reload`);
      } else if (mine.length) {
        this.restoring = null;
      }
    }
    // ---- dealt draws ---------------------------------------------------------------------------------------------
    //
    //   referee x.dl  {l: label, h: SHA-256(seed), s: [listed session ids], p: 0 committing | 1 revealing, r?: seed}
    //   player  x.dc  {l: label, h: SHA-256(contribution), c?: contribution}
    // The runtime answers for every listed player by itself (review), so game code only calls beginDeal, dealDraw,
    // revealDeal on the referee and verifyDeal anywhere.
    /** The referee starts a deal under `label` for the players with these session ids. Replaces its previous deal. */
    beginDeal(label, sids) {
      if (!this.referee.isMe()) return;
      const seed = toBase64(this.crypto.getRandomValues(new Uint8Array(16)));
      this.dealSeed = { label, seed };
      this.presence.setExtra("dl", { l: label, h: sha256Text(seed), s: sids.slice(), p: 0 });
      this.review();
    }
    /** Where the current referee's deal under `label` stands. */
    dealState(label) {
      const deal = this.currentDeal();
      if (!deal || deal.l !== label) return "none";
      const seen = this.dealSeen.get(label);
      if (deal.r !== void 0) return seen && sha256Text(deal.r) === seen.h ? "revealed" : "invalid";
      if (deal.p === 0) return "committing";
      return this.contributions(deal) ? "ready" : "revealing";
    }
    /**
     * The referee's deal, once every listed player still present has revealed a contribution (a listed player who
     * left counts as absent: say so in the game if it matters). Null before that, and on any other client.
     */
    dealDraw(label) {
      const deal = this.currentDeal();
      if (!this.referee.isMe() || !deal || deal.l !== label || !this.dealSeed || this.dealSeed.label !== label) return null;
      const parts = this.contributions(deal);
      return parts ? new Draw(dealSeedOf(this.dealSeed.seed, label, parts)) : null;
    }
    /** The referee publishes its seed (after the hand), so that everyone can check the deal. */
    revealDeal(label) {
      const deal = this.currentDeal();
      if (!this.referee.isMe() || !deal || deal.l !== label || !this.dealSeed || this.dealSeed.label !== label) return;
      this.presence.setExtra("dl", { ...deal, r: this.dealSeed.seed });
    }
    /** After revealDeal: the deal, recomputed here from the referee's seed and the contributions this client saw; null if it does not check out. */
    verifyDeal(label) {
      const deal = this.currentDeal();
      if (!deal || deal.l !== label || deal.r === void 0) return null;
      const seen = this.dealSeen.get(label);
      if (!seen || sha256Text(deal.r) !== seen.h) return null;
      const parts = this.contributions(deal);
      return parts ? new Draw(dealSeedOf(deal.r, label, parts)) : null;
    }
    currentDeal() {
      const ref = this.referee.current();
      return ref ? parseDeal(this.presence.extra(ref.sid, "dl")) : null;
    }
    /** Every listed contribution, revealed and matching its commitment ("-" for a listed player who left); null while one is missing. */
    contributions(deal) {
      const seen = this.dealSeen.get(deal.l);
      if (!seen) return null;
      const out = [];
      for (const sid of deal.s) {
        const part = seen.parts.get(sid);
        if (part && part.c !== void 0) out.push(part.c);
        else if (!this.presence.has(sid) && (!part || deal.p === 1)) out.push("-");
        else return null;
      }
      return out;
    }
    /** Follows the deal: records what is first seen, answers for the local player, and moves the referee's phase on. */
    reviewDeal() {
      const ref = this.referee.current();
      const deal = this.currentDeal();
      if (!ref || !deal) return;
      let seen = this.dealSeen.get(deal.l);
      if (!seen || seen.refSid !== ref.sid) {
        seen = { h: deal.h, refSid: ref.sid, parts: /* @__PURE__ */ new Map() };
        this.dealSeen.set(deal.l, seen);
        while (this.dealSeen.size > 8) this.dealSeen.delete(this.dealSeen.keys().next().value);
      }
      for (const sid of deal.s) {
        const part = parseContribution(this.presence.extra(sid, "dc"));
        if (!part || part.l !== deal.l) continue;
        const known = seen.parts.get(sid);
        if (!known) seen.parts.set(sid, { h: part.h });
        const entry = seen.parts.get(sid);
        if (part.c !== void 0 && entry.c === void 0 && entry.h === part.h && sha256Text(part.c) === entry.h) entry.c = part.c;
      }
      const me = this.core.me.sid;
      if (deal.s.includes(me)) {
        if (!this.myContribution || this.myContribution.label !== deal.l) {
          this.myContribution = { label: deal.l, c: toBase64(this.crypto.getRandomValues(new Uint8Array(16))) };
          this.presence.setExtra("dc", { l: deal.l, h: sha256Text(this.myContribution.c) });
        } else if (deal.p === 1) {
          const mine = parseContribution(this.presence.extra(me, "dc"));
          if (mine && mine.c === void 0) this.presence.setExtra("dc", { ...mine, c: this.myContribution.c });
        }
      }
      if (this.referee.isMe() && deal.p === 0 && this.dealSeed && this.dealSeed.label === deal.l) {
        const all = deal.s.every((sid) => seen.parts.has(sid) || !this.presence.has(sid));
        if (all) this.presence.setExtra("dl", { ...deal, p: 1 });
      }
    }
    // ---- seal / open --------------------------------------------------------------------------------------------
    /** The local public key (raw point, base64url). Empty before `init`. */
    get publicKey() {
      return this.publicKeyText;
    }
    /**
     * Makes the local key pair, or loads the one this device saved for this player and instance, so that a page
     * reload can still open what was sealed before it.
     */
    async init(store, storeKey, drawKey = "") {
      const subtle = this.crypto.subtle;
      if (store && drawKey) {
        this.drawStore = store;
        this.drawKey = drawKey;
        try {
          const saved = safeParse(store.get(drawKey));
          if (isRecord(saved) && typeof saved.l === "string" && typeof saved.s === "string") {
            this.restoring = { e: typeof saved.e === "number" ? saved.e : 0, l: saved.l, s: saved.s, r: saved.r === 1 ? 1 : 0 };
          }
        } catch {
        }
      }
      if (store) {
        try {
          const saved = safeParse(store.get(storeKey));
          if (isRecord(saved) && isRecord(saved.d) && typeof saved.p === "string") {
            this.privateKey = await subtle.importKey("jwk", saved.d, CURVE, false, ["deriveKey"]);
            this.publicKeyText = saved.p;
            return this.publicKeyText;
          }
        } catch {
        }
      }
      const pair = await subtle.generateKey(CURVE, true, ["deriveKey"]);
      this.privateKey = pair.privateKey;
      this.publicKeyText = toBase64(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
      if (store) {
        try {
          store.set(storeKey, JSON.stringify({ p: this.publicKeyText, d: await subtle.exportKey("jwk", pair.privateKey) }));
        } catch {
        }
      }
      return this.publicKeyText;
    }
    /** True once the player's public key is known, so `seal` for them can work. */
    canSealFor(sid) {
      return !!this.presence.get(sid)?.publicKey;
    }
    /**
     * Encrypts `value` for one participant. The result is text that can go anywhere (a synced field, a network
     * event): only that player's key opens it.
     */
    async seal(forSid, value) {
      if (!this.privateKey) throw new Error("secrets are not ready");
      const target = this.presence.get(forSid);
      if (!target || !target.publicKey) throw new Error(`no public key known for player session ${forSid}`);
      const key = await this.sharedKey(target.publicKey);
      const iv = this.crypto.getRandomValues(new Uint8Array(12));
      const me = this.core.me;
      const aad = utf8Encode(`${this.core.prefix}
${me.sid}
${forSid}`);
      const plain = utf8Encode(canonicalJson(encodeValue(value)));
      const cipher = new Uint8Array(await this.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plain));
      return JSON.stringify({ f: me.sid, t: forSid, u: target.uid, p: this.publicKeyText, i: toBase64(iv), c: toBase64(cipher) });
    }
    /**
     * Opens a box sealed for the local player. Throws when it is for someone else, was changed on the way, or
     * claims a sender whose announced key is not the one it was sealed with.
     */
    async open(box) {
      if (!this.privateKey) throw new Error("secrets are not ready");
      const b = safeParse(box);
      if (!isRecord(b) || typeof b.f !== "string" || typeof b.t !== "string" || typeof b.p !== "string" || typeof b.i !== "string" || typeof b.c !== "string") {
        throw new Error("not a sealed box");
      }
      const me = this.core.me;
      if (b.t !== me.sid && b.u !== me.uid) throw new Error("this box is sealed for another player");
      const senderKey = this.presence.keyOf(b.f);
      if (senderKey !== b.p) throw new Error("the box does not come from the player it names");
      const key = await this.sharedKey(b.p);
      const aad = utf8Encode(`${this.core.prefix}
${b.f}
${b.t}`);
      let plain;
      try {
        plain = await this.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(b.i), additionalData: aad }, key, fromBase64(b.c));
      } catch {
        throw new Error("the box could not be opened (wrong key or changed contents)");
      }
      return decodeValue(JSON.parse(utf8Decode(new Uint8Array(plain))));
    }
    /**
     * Seals one value per participant into a single text, for one synced field that is rewritten as a whole.
     *
     * A box written for one player at a telling moment names its reader even though nobody else can open it. Here
     * every participant gets an entry every time, each padded to `slotBytes` before encryption, in session-id
     * order: the text has the same size and shape whoever it really concerns. `valueFor` returns undefined for a
     * participant who gets nothing; their entry is filled with padding.
     */
    async sealAll(valueFor, slotBytes = 256) {
      if (!this.privateKey) throw new Error("secrets are not ready");
      const me = this.core.me;
      const entries = {};
      const everyone = this.presence.list().map((p) => p.sid).sort();
      for (const sid of everyone) {
        const target = this.presence.get(sid);
        if (!target || !target.publicKey) continue;
        const value = valueFor(sid);
        const text = value === void 0 ? "{}" : canonicalJson({ v: encodeValue(value) });
        const bytes = utf8Encode(text);
        if (bytes.length > slotBytes) throw new Error(`sealAll: the value for one player needs ${bytes.length} bytes, more than the slot of ${slotBytes}`);
        const padded = new Uint8Array(slotBytes).fill(32);
        padded.set(bytes);
        const key = await this.sharedKey(target.publicKey);
        const iv = this.crypto.getRandomValues(new Uint8Array(12));
        const aad = utf8Encode(`${this.core.prefix}
${me.sid}
${sid}
all`);
        const cipher = new Uint8Array(await this.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, padded));
        entries[sid] = [toBase64(iv), toBase64(cipher)];
      }
      return asciiJson({ f: me.sid, p: this.publicKeyText, n: slotBytes, m: entries });
    }
    /**
     * Opens the local player's entry of a `sealAll` text. Resolves null when the entry holds nothing for them,
     * or there is none (they arrived after it was written).
     */
    async openMine(bundle) {
      if (!this.privateKey) throw new Error("secrets are not ready");
      const b = safeParse(bundle);
      if (!isRecord(b) || typeof b.f !== "string" || typeof b.p !== "string" || !isRecord(b.m)) throw new Error("not a sealed bundle");
      const me = this.core.me;
      const entry = b.m[me.sid];
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") return null;
      if (this.presence.keyOf(b.f) !== b.p) throw new Error("the bundle does not come from the player it names");
      const key = await this.sharedKey(b.p);
      const aad = utf8Encode(`${this.core.prefix}
${b.f}
${me.sid}
all`);
      let plain;
      try {
        plain = await this.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(entry[0]), additionalData: aad }, key, fromBase64(entry[1]));
      } catch {
        throw new Error("the entry could not be opened (wrong key or changed contents)");
      }
      const parsed = safeParse(utf8Decode(new Uint8Array(plain)).trimEnd());
      return isRecord(parsed) && "v" in parsed ? decodeValue(parsed.v) : null;
    }
    /**
     * Opens a box sealed for the local player and says who sealed it (a session id whose announced key the box was
     * sealed with). A game that takes a dealt value as authority checks that the sender is the referee.
     */
    async openWithSender(box) {
      const value = await this.open(box);
      return { value, from: String(safeParse(box).f) };
    }
    /** True when `box` names the local player as its reader. */
    isForMe(box) {
      const b = safeParse(box);
      return isRecord(b) && (b.t === this.core.me.sid || b.u === this.core.me.uid);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sharedKey(theirPublic) {
      let key = this.derived.get(theirPublic);
      if (!key) {
        const subtle = this.crypto.subtle;
        key = (async () => {
          const pub = await subtle.importKey("raw", fromBase64(theirPublic), CURVE, false, []);
          return subtle.deriveKey({ name: "ECDH", public: pub }, this.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        })();
        this.derived.set(theirPublic, key);
        key.catch(() => this.derived.delete(theirPublic));
      }
      return key;
    }
  };
  function hashOpening(opening) {
    return sha256Text(opening.s + "\n" + canonicalJson(opening.v));
  }
  function dealSeedOf(seed, label, parts) {
    return toHex(sha256(utf8Encode(`${seed}
${label}
${parts.join("\n")}`)));
  }
  function drawSeed(secret, number, label) {
    return toHex(sha256(utf8Encode(`${secret}
${number}
${label}`)));
  }

  // portkit/src/leaf.ts
  var LEAF_MARGIN = 96;
  var TOMBSTONE = "";
  function headKey(id) {
    return `v.${id}`;
  }
  function chunkKey(id, index) {
    return `c.${id}.${index}`;
  }
  function encodeLeaf(id, record, maxLeafBytes, previousChunks) {
    const budget = Math.max(256, maxLeafBytes - LEAF_MARGIN);
    const whole = asciiJson({ e: record.e, g: record.g, n: record.n, w: record.w, d: record.d });
    const bytes = jsonLeafBytes(whole);
    const writes = [];
    let chunks = 0;
    if (bytes <= budget) {
      writes.push([headKey(id), whole]);
    } else {
      const pieces = splitByLeafBytes(whole, budget - 32);
      chunks = pieces.length;
      for (let i = 0; i < pieces.length; i++) writes.push([chunkKey(id, i), `${record.n}.${i}~${pieces[i]}`]);
      writes.push([headKey(id), asciiJson({ e: record.e, g: record.g, n: record.n, w: record.w, c: chunks })]);
    }
    for (let i = chunks; i < previousChunks; i++) writes.push([chunkKey(id, i), TOMBSTONE]);
    return { writes, chunks, bytes };
  }
  function splitByLeafBytes(text, budget) {
    const pieces = [];
    let start = 0;
    let size = 0;
    for (let i = 0; i < text.length; i++) {
      const add = leafCharBytes(text, i);
      const lowHalf = (text.charCodeAt(i) & 64512) === 56320;
      if (size + add > budget && i > start && !lowHalf) {
        pieces.push(text.slice(start, i));
        start = i;
        size = 0;
      }
      size += add;
    }
    if (start < text.length) pieces.push(text.slice(start));
    return pieces;
  }
  function decodeLeaf(id, get) {
    const head = get(headKey(id));
    if (head === void 0 || head === TOMBSTONE) return { kind: "none" };
    const parsed = safeParse(head);
    if (!isRecord(parsed) || !isCount(parsed.e) || !isCount(parsed.g) || !isCount(parsed.n) || typeof parsed.w !== "string") return { kind: "bad" };
    const e = parsed.e;
    const g = parsed.g;
    const n = parsed.n;
    const w = parsed.w;
    if (parsed.c === void 0) return { kind: "value", record: { e, g, n, w, d: parsed.d }, chunks: 0 };
    if (!isCount(parsed.c) || parsed.c < 1 || parsed.c > 512) return { kind: "bad" };
    const chunks = parsed.c;
    let whole = "";
    for (let i = 0; i < chunks; i++) {
      const piece = get(chunkKey(id, i));
      const tag = `${n}.${i}~`;
      if (piece === void 0 || !piece.startsWith(tag)) return { kind: "pending", e, g, n, w, chunks };
      whole += piece.slice(tag.length);
    }
    const full = safeParse(whole);
    if (!isRecord(full) || full.e !== e || full.g !== g || full.n !== n || full.w !== w) return { kind: "bad" };
    return { kind: "value", record: { e, g, n, w, d: full.d }, chunks };
  }
  function isCount(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
  function leafOwnerOf(key) {
    if (key.startsWith("v.")) return key.indexOf(".", 2) < 0 ? key.slice(2) : null;
    if (key.startsWith("c.")) {
      const end = key.indexOf(".", 2);
      return end > 2 ? key.slice(2, end) : null;
    }
    return null;
  }

  // portkit/src/sync.ts
  var Sync = class {
    constructor(core, presence, referee, players) {
      __publicField(this, "core");
      __publicField(this, "presence");
      __publicField(this, "referee");
      __publicField(this, "players");
      __publicField(this, "slots", /* @__PURE__ */ new Map());
      __publicField(this, "byBehaviour", /* @__PURE__ */ new Map());
      __publicField(this, "stats", { writes: 0, applied: 0, repairs: 0, claims: 0, lostRaces: 0, rejected: 0, reverted: 0 });
      /** False until behaviours have started: data applied before then is reported once, afterwards. */
      __publicField(this, "started", false);
      __publicField(this, "epochSeen", 0);
      __publicField(this, "warnedIdle", false);
      /** Told when the local player becomes or stops being the owner of a slot (to move its synced objects). */
      __publicField(this, "onLocalOwnership", () => {
      });
      this.core = core;
      this.presence = presence;
      this.referee = referee;
      this.players = players;
    }
    get me() {
      return this.core.me.sid;
    }
    /** Registers a behaviour. With `group`, it shares the leaf and the owner of every other behaviour of that group. */
    add(behaviour, id, fields, mode, callbacks, group) {
      const slotId = group ? `@${group}` : id;
      let slot = this.slots.get(slotId);
      if (!slot) {
        slot = {
          id: slotId,
          grouped: !!group,
          members: [],
          mode,
          snapshotOwed: false,
          mo: null,
          topG: 0,
          pending: null,
          applied: null,
          seenN: 0,
          lastValid: null,
          unconfirmed: null,
          dirty: false,
          chunks: 0,
          lastSent: null,
          lastContinuousAt: -Infinity,
          ownerView: null,
          warnedNotOwner: false,
          onApplied: null
        };
        this.slots.set(slotId, slot);
      } else if (mode === "continuous" || slot.mode === "none" && mode !== "none") slot.mode = mode;
      slot.members.push({ id, behaviour, fields, callbacks: callbacks && Object.keys(callbacks).length ? callbacks : void 0, lastPart: null, owed: false });
      this.byBehaviour.set(behaviour, slot);
      return slot;
    }
    slotOf(behaviour) {
      return this.byBehaviour.get(behaviour) ?? null;
    }
    /** Subscribes to the mirror and reads the owner records. Data is applied by `applySnapshot`, after Start. */
    attach() {
      this.core.onState((key) => this.onLeaf(key));
      this.presence.on(() => this.onPeopleChanged());
      this.presence.onExtra(() => this.onPeopleChanged());
      this.referee.on(() => this.onPeopleChanged());
      this.epochSeen = this.referee.epoch;
      for (const slot of this.slots.values()) {
        this.readOwner(slot);
        slot.ownerView = this.ownerSid(slot);
      }
    }
    /** Applies whatever counts in the mirror to every behaviour. Runs after Start, so stored data wins over it. */
    applySnapshot() {
      for (const slot of this.slots.values()) {
        this.markParts(slot);
        slot.snapshotOwed = decodeLeaf(slot.id, (key) => this.core.get(key)).kind === "pending";
        this.evaluate(slot, true);
      }
    }
    /** True when the mirror held a value for any behaviour when this client started. */
    hasData() {
      for (const slot of this.slots.values()) if (slot.applied !== null) return true;
      return false;
    }
    /** Marks the behaviours as started and calls OnDeserialization once on each that already has data. */
    begin() {
      this.started = true;
      for (const slot of this.slots.values()) {
        for (const member of slot.members) {
          if (!member.owed) continue;
          member.owed = false;
          this.core.guard(`${member.id}.OnDeserialization`, () => member.behaviour.OnDeserialization({ isSnapshot: true, isRollback: false }));
        }
      }
    }
    /** The slot a leaf key belongs to (`o.<slot>`, `v.<slot>`, `c.<slot>.<i>`), for reporting a refused write. */
    slotForKey(key) {
      const id = key.startsWith("o.") ? key.slice(2) : leafOwnerOf(key);
      return id === null ? null : this.slots.get(id) ?? null;
    }
    // ---- ownership ----------------------------------------------------------------------------------------------
    ownerSid(slot) {
      if (slot.pending) return slot.pending.sid;
      if (slot.mo && this.presence.has(slot.mo.s)) return slot.mo.s;
      return this.referee.current()?.sid ?? null;
    }
    owner(slot) {
      const sid = this.ownerSid(slot);
      return sid === null ? null : this.players.bySid(sid);
    }
    isOwner(slot, sid = this.me) {
      return this.ownerSid(slot) === sid;
    }
    setOwner(slot, sid, uid) {
      if (this.core.disposed) return;
      if (this.referee.epoch === 0) {
        if (!this.warnedIdle) {
          this.warnedIdle = true;
          this.core.log("warn", `${slot.id}: SetOwner ignored, the instance has no referee yet`);
        }
        return;
      }
      const recorded = slot.pending ? slot.pending.sid : slot.mo ? slot.mo.s : null;
      if (recorded === sid) return;
      const g = Math.max(slot.topG, slot.pending ? slot.pending.g : 0) + 1;
      const record = { e: this.referee.epoch, g, s: sid, u: uid };
      if (slot.pending) this.core.scheduler.cancel(slot.pending.timer);
      const timer = this.core.scheduler.after(this.core.options.ownerClaimTimeoutMs, () => {
        if (slot.pending && slot.pending.g === g) {
          this.core.log("warn", `ownership claim for ${slot.id} never came back; giving it up`);
          slot.pending = null;
          this.settleLostClaim(slot);
        }
      });
      slot.pending = { g, sid, timer };
      this.stats.claims++;
      this.core.set(`o.${slot.id}`, asciiJson(record));
      this.noteOwner(slot);
    }
    readOwner(slot) {
      const raw = safeParse(this.core.get(`o.${slot.id}`));
      let record = null;
      if (isRecord(raw) && typeof raw.e === "number" && typeof raw.g === "number" && typeof raw.s === "string") {
        record = { e: raw.e, g: raw.g, s: raw.s, u: typeof raw.u === "string" ? raw.u : "" };
        if (record.g > slot.topG) slot.topG = record.g;
      }
      slot.mo = record && record.e === this.referee.epoch ? record : null;
    }
    onOwnerLeaf(slot) {
      this.readOwner(slot);
      const mo = slot.mo;
      if (slot.pending && mo && mo.s === slot.pending.sid && mo.g === slot.pending.g) {
        this.core.scheduler.cancel(slot.pending.timer);
        slot.pending = null;
        if (slot.unconfirmed) slot.lastValid = slot.unconfirmed;
        slot.unconfirmed = null;
      }
      this.noteOwner(slot);
      this.evaluate(slot, false);
    }
    /** The claim never reached the room: whatever was changed for it is put back. */
    settleLostClaim(slot) {
      this.stats.lostRaces++;
      const touched = slot.unconfirmed !== null || slot.dirty;
      slot.unconfirmed = null;
      slot.dirty = false;
      if (touched) {
        if (slot.lastValid) {
          slot.applied = slot.lastValid.marker;
          this.markParts(slot);
          this.deserialized(slot, this.assign(slot, slot.lastValid.d), true);
        } else slot.applied = null;
      }
      this.noteOwner(slot);
      this.evaluate(slot, false);
    }
    /** Records what each member of a group holds now, so that the next value only reports real changes. */
    markParts(slot) {
      if (!slot.grouped) return;
      for (const member of slot.members) {
        const bag = member.behaviour;
        member.lastPart = canonicalJson(member.fields.map((field) => encodeValue(bag[field])));
      }
    }
    noteOwner(slot) {
      const now = this.ownerSid(slot);
      if (now === slot.ownerView) return;
      const before = slot.ownerView;
      slot.ownerView = now;
      if (now === this.me || before === this.me) this.core.guard("ownership hook", () => this.onLocalOwnership(slot, now === this.me));
      if (!this.started || now === null) return;
      const player = this.players.bySid(now);
      if (!player) return;
      for (const member of slot.members) this.core.guard(`${member.id}.OnOwnershipTransferred`, () => member.behaviour.OnOwnershipTransferred(player));
    }
    onPeopleChanged() {
      if (this.core.disposed) return;
      if (this.referee.epoch !== this.epochSeen) this.adoptEpoch();
      for (const slot of this.slots.values()) this.noteOwner(slot);
      this.takeOver();
    }
    /**
     * A referee of another epoch appeared: a client that started while there was none joins the game in progress,
     * or the game was started afresh. Everything known about owners and values is read again from the mirror, and
     * values found there are reported as a snapshot.
     */
    adoptEpoch() {
      this.epochSeen = this.referee.epoch;
      for (const slot of this.slots.values()) {
        if (slot.pending) this.core.scheduler.cancel(slot.pending.timer);
        slot.pending = null;
        slot.unconfirmed = null;
        slot.lastValid = null;
        slot.applied = null;
        slot.dirty = false;
        this.readOwner(slot);
        slot.snapshotOwed = true;
        this.evaluate(slot, true);
        slot.snapshotOwed = decodeLeaf(slot.id, (key) => this.core.get(key)).kind === "pending";
      }
    }
    /** The referee records itself as owner of whatever an absent player owned. */
    takeOver() {
      if (!this.started || !this.referee.isMe()) return;
      for (const slot of this.slots.values()) {
        if (slot.pending || !slot.mo || this.presence.has(slot.mo.s)) continue;
        this.setOwner(slot, this.me, this.core.me.uid);
      }
    }
    // ---- data ---------------------------------------------------------------------------------------------------
    requestSerialization(slot) {
      if (slot.mode === "none") return;
      if (!this.isOwner(slot)) {
        if (!slot.warnedNotOwner) {
          slot.warnedNotOwner = true;
          this.core.log("warn", `${slot.id}: RequestSerialization by a player who is not the owner is ignored`);
        }
        return;
      }
      slot.dirty = true;
    }
    /** Writes every dirty slot the local player owns. Called once per tick. */
    flush() {
      if (this.core.disposed || !this.started) return;
      const now = this.core.platform.clock.now();
      for (const slot of this.slots.values()) {
        if (slot.mode === "none") continue;
        if (slot.mode === "continuous" && now - slot.lastContinuousAt >= this.core.options.continuousIntervalMs && this.isOwner(slot)) {
          slot.lastContinuousAt = now;
          if (canonicalJson(this.read(slot)) !== slot.lastSent) slot.dirty = true;
        }
        if (!slot.dirty) continue;
        slot.dirty = false;
        if (this.isOwner(slot)) this.write(slot);
        else this.revert(slot);
      }
    }
    /**
     * The fields were changed by the owner, and ownership went to someone else before the change could be sent.
     * Nobody else will ever see it, so it is taken back.
     */
    revert(slot) {
      if (!slot.lastValid) return;
      slot.applied = slot.lastValid.marker;
      this.markParts(slot);
      const changed = this.assign(slot, slot.lastValid.d);
      this.stats.reverted++;
      this.deserialized(slot, changed, true);
    }
    /** Serialises one slot now (used when an event must follow its state). Returns the marker of what it holds. */
    flushOne(slot) {
      if (slot.dirty && this.started && this.isOwner(slot)) {
        slot.dirty = false;
        this.write(slot);
      }
      return slot.applied;
    }
    write(slot) {
      const named = slot.pending ? slot.pending.sid === this.me : slot.mo !== null && slot.mo.s === this.me;
      if (!named) this.setOwner(slot, this.me, this.core.me.uid);
      if (!slot.pending && !slot.mo) return;
      const g = slot.pending ? slot.pending.g : slot.mo.g;
      for (const member of slot.members) this.core.guard(`${member.id}.OnPreSerialization`, () => member.behaviour.OnPreSerialization());
      const d = this.read(slot);
      const n = ++slot.seenN;
      const encoded = encodeLeaf(slot.id, { e: this.referee.epoch, g, n, w: this.me, d }, this.core.platform.limits.maxLeafBytes, slot.chunks);
      for (const [key, value] of encoded.writes) this.core.set(key, value);
      slot.chunks = encoded.chunks;
      slot.applied = { g, n, w: this.me };
      slot.lastSent = canonicalJson(d);
      if (slot.grouped) for (const member of slot.members) member.lastPart = canonicalJson(d[member.id] ?? null);
      const kept = { d, marker: slot.applied };
      if (slot.pending) slot.unconfirmed = kept;
      else slot.lastValid = kept;
      this.stats.writes++;
      const result = { success: true, byteCount: encoded.bytes };
      for (const member of slot.members) this.core.guard(`${member.id}.OnPostSerialization`, () => member.behaviour.OnPostSerialization(result));
    }
    read(slot) {
      if (!slot.grouped) return readFields(slot.members[0].behaviour, slot.members[0].fields);
      const out = {};
      for (const member of slot.members) {
        const bag = member.behaviour;
        out[member.id] = member.fields.map((field) => encodeValue(bag[field]));
      }
      return out;
    }
    /** Puts data into the behaviours. Returns the members whose part was new to them. */
    assign(slot, d) {
      if (!slot.grouped) {
        const member = slot.members[0];
        this.core.guard(`${member.id} field change callback`, () => assignFields(member.behaviour, member.fields, d, member.callbacks));
        return [member];
      }
      const changed = [];
      if (!isRecord(d)) return changed;
      for (const member of slot.members) {
        const part = d[member.id];
        if (!Array.isArray(part)) continue;
        const text = canonicalJson(part);
        if (text === member.lastPart) continue;
        member.lastPart = text;
        const asFields = {};
        member.fields.forEach((field, i) => {
          if (i < part.length) asFields[field] = part[i];
        });
        this.core.guard(`${member.id} field change callback`, () => assignFields(member.behaviour, member.fields, asFields, member.callbacks));
        changed.push(member);
      }
      return changed;
    }
    onLeaf(key) {
      if (this.core.disposed) return;
      if (key.startsWith("o.")) {
        const slot2 = this.slots.get(key.slice(2));
        if (slot2) this.onOwnerLeaf(slot2);
        return;
      }
      const id = leafOwnerOf(key);
      if (id === null) return;
      const slot = this.slots.get(id);
      if (slot) this.evaluate(slot, slot.snapshotOwed);
    }
    /**
     * Looks at the mirrored value of one slot and applies it, ignores it, or repairs it. `asSnapshot`: the value
     * was already stored when this client came to the game, so it is taken whoever wrote it.
     */
    evaluate(slot, asSnapshot) {
      this.consider(slot, asSnapshot);
      if (slot.onApplied && this.started) this.core.guard("held events", slot.onApplied);
    }
    consider(slot, asSnapshot) {
      const decoded = decodeLeaf(slot.id, (key) => this.core.get(key));
      if (decoded.kind === "pending") {
        if (decoded.n > slot.seenN) slot.seenN = decoded.n;
        return;
      }
      if (decoded.kind !== "value") return;
      const x = decoded.record;
      if (x.n > slot.seenN) slot.seenN = x.n;
      slot.chunks = decoded.chunks;
      if (x.e !== this.referee.epoch) return;
      const a = slot.applied;
      if (a && x.n === a.n && x.w === a.w && x.g === a.g) return;
      if (x.w === this.me && a && a.w === this.me && x.n <= a.n) return;
      const mo = slot.mo;
      if (asSnapshot || mo !== null && x.w === mo.s) {
        slot.applied = { g: x.g, n: x.n, w: x.w };
        slot.lastValid = { d: x.d, marker: slot.applied };
        slot.lastSent = null;
        this.stats.applied++;
        this.deserialized(slot, this.assign(slot, x.d), false);
        return;
      }
      this.stats.rejected++;
      if (mo !== null && mo.s === this.me && !slot.pending) {
        this.stats.repairs++;
        slot.dirty = true;
      }
    }
    deserialized(slot, changed, isRollback) {
      if (!this.started) {
        for (const member of changed) member.owed = true;
        return;
      }
      const isSnapshot = slot.snapshotOwed && !isRollback;
      slot.snapshotOwed = false;
      for (const member of changed) {
        this.core.guard(`${member.id}.OnDeserialization`, () => member.behaviour.OnDeserialization({ isSnapshot, isRollback }));
      }
    }
    /** Canonical text of every synced field of every behaviour: equal on two clients that agree. */
    snapshotText() {
      const all = {};
      for (const slot of this.slots.values()) {
        if (slot.mode === "none") continue;
        for (const member of slot.members) if (member.fields.length) all[member.id] = readFields(member.behaviour, member.fields);
      }
      return canonicalJson(all);
    }
  };

  // portkit/src/instance.ts
  var OBJECT_EVENTS = [
    "click",
    "grab",
    "drop",
    "triggerEnter",
    "triggerExit",
    "collisionEnter",
    "collisionExit",
    "uiButton",
    "uiSlider",
    "uiToggle",
    "heldTrigger",
    "heldPrimary",
    "heldSecondary",
    "field"
  ];
  var MAX_EARLY_EVENTS = 256;
  var GameInstance = class {
    constructor(platform, game2, bindings, element, inst, shared = {}) {
      __publicField(this, "platform");
      __publicField(this, "game");
      __publicField(this, "bindings");
      __publicField(this, "element");
      __publicField(this, "inst");
      __publicField(this, "core");
      __publicField(this, "scheduler");
      __publicField(this, "presence");
      __publicField(this, "referee");
      __publicField(this, "players");
      __publicField(this, "sync");
      __publicField(this, "events");
      __publicField(this, "commands");
      __publicField(this, "perUser");
      __publicField(this, "secrets");
      __publicField(this, "protectedValues");
      __publicField(this, "host");
      __publicField(this, "clockSync");
      __publicField(this, "storage");
      __publicField(this, "networking");
      __publicField(this, "settings", /* @__PURE__ */ new Map());
      __publicField(this, "objects", /* @__PURE__ */ new Map());
      /** Set when the instance has started its behaviours. */
      __publicField(this, "started", false);
      /** Resolves when behaviours have started (or the instance was disposed first). */
      __publicField(this, "ready", deferred());
      __publicField(this, "rule");
      __publicField(this, "kit", null);
      __publicField(this, "ordinary", []);
      __publicField(this, "byId", /* @__PURE__ */ new Map());
      __publicField(this, "addresses", /* @__PURE__ */ new Map());
      __publicField(this, "templates", []);
      __publicField(this, "playerBehaviourMap", /* @__PURE__ */ new Map());
      __publicField(this, "objectHandlers", /* @__PURE__ */ new Map());
      __publicField(this, "hostWired", /* @__PURE__ */ new Set());
      __publicField(this, "graphHandlers", /* @__PURE__ */ new Map());
      __publicField(this, "pendingLeaves", []);
      __publicField(this, "earlyGraphEvents", []);
      __publicField(this, "buttons", /* @__PURE__ */ new Set());
      __publicField(this, "keys", /* @__PURE__ */ new Set());
      __publicField(this, "sticks", [new Vector2(), new Vector2()]);
      __publicField(this, "triggers", [0, 0]);
      __publicField(this, "abilitiesOff", /* @__PURE__ */ new Set());
      __publicField(this, "blocksOn", /* @__PURE__ */ new Set());
      __publicField(this, "poses", null);
      __publicField(this, "triggerAt", [-Infinity, -Infinity]);
      __publicField(this, "lastClickSide", null);
      __publicField(this, "vr", null);
      __publicField(this, "reachOverride", /* @__PURE__ */ new Map());
      __publicField(this, "position", null);
      __publicField(this, "startKindValue", "idle");
      __publicField(this, "lastClockAsk", -Infinity);
      __publicField(this, "timeView");
      __publicField(this, "randomView");
      __publicField(this, "debugView");
      __publicField(this, "inputView");
      /** The page-wide object every instance of this game shares (GameRuntime.shared). */
      __publicField(this, "shared");
      this.shared = shared;
      this.platform = platform;
      this.game = game2;
      this.bindings = bindings;
      this.element = element;
      this.inst = inst;
      this.rule = game2.referee ?? "anyone";
      const options = { ...DEFAULT_OPTIONS, ...game2.options ?? {} };
      this.scheduler = new Scheduler(platform.clock, (where, error) => this.core.error(where, error));
      this.core = new Core(platform, game2.slug, inst, options, this.scheduler);
      for (const name of element.attributeNames()) this.settings.set(name, element.getAttribute(name) ?? "");
      this.presence = new Presence(this.core);
      this.referee = new Referee(this.core, this.presence, this.rule);
      this.players = new Players(this.core, this.presence, this.referee);
      this.sync = new Sync(this.core, this.presence, this.referee, this.players);
      this.clockSync = new ClockSync(platform.clock);
      this.host = new RelayHost(platform, game2.slug, inst, bindings.refs);
      this.storage = new Persistence(platform.storage, game2.slug, inst, platform.local().uid);
      this.secrets = new Secrets(this.core, this.presence, this.referee, () => this.clockSync.seconds());
      this.protectedValues = new ProtectedValues(this.core);
      this.events = new NetEvents(this.core, this.sync, {
        behaviour: (id) => this.byId.get(id) ?? null,
        playerBehaviour: (sid, id) => this.playerBehaviourMap.get(sid)?.get(id) ?? null,
        address: (behaviour) => this.addresses.get(behaviour) ?? null,
        refused: (behaviour, code, name) => this.refuse(behaviour, { kind: "event", code, key: name, final: true })
      });
      this.commands = new Commands(this.core, this.presence, this.referee, {
        resolve: (id, playerSid) => playerSid ? this.playerBehaviourMap.get(playerSid)?.get(id) ?? null : this.byId.get(id) ?? null,
        address: (behaviour) => this.addresses.get(behaviour) ?? null,
        invoke: (behaviour, name, args, fromSid) => this.events.invoke(behaviour, name, args, fromSid),
        acknowledged: (behaviour, number) => behaviour.OnCommandAcknowledged(number),
        refused: (behaviour, code, name) => this.refuse(behaviour, { kind: "event", code, key: name, final: true })
      });
      this.perUser = new PerUser(this.core, this.storage, {
        restored: (player) => this.each("OnPlayerRestored", (b) => b.OnPlayerRestored(player)),
        dataUpdated: (player, keys) => this.each("OnPlayerDataUpdated", (b) => b.OnPlayerDataUpdated(player, keys)),
        deserialized: (behaviour) => this.core.guard("OnDeserialization", () => behaviour.OnDeserialization({ isSnapshot: false, isRollback: false })),
        refused: (kind, code, key, behaviour) => this.refuse(behaviour, { kind, code, key, final: true })
      });
      this.networking = new Networking(this);
      const scheduler = this.scheduler;
      this.timeView = {
        get time() {
          return scheduler.time;
        },
        get deltaTime() {
          return scheduler.deltaTime;
        },
        get frameCount() {
          return scheduler.ticks;
        }
      };
      this.randomView = {
        get value() {
          return platform.random();
        },
        Range: (min, max) => min + (max - min) * platform.random(),
        RangeInt: (min, max) => Math.floor(min) + Math.floor((Math.floor(max) - Math.floor(min)) * platform.random()),
        Bytes: (n) => platform.crypto.getRandomValues(new Uint8Array(Math.max(0, Math.floor(n))))
      };
      const say = (level) => (message) => this.core.log(level, typeof message === "string" ? message : String(message));
      this.debugView = { Log: say("info"), LogWarning: say("warn"), LogError: say("error") };
      const owner = this;
      this.inputView = {
        GetButton: (button, side) => this.buttons.has(`${side}/${button}`),
        GetThumbstick: (side) => this.sticks[side].clone(),
        GetTrigger: (side) => this.triggers[side],
        GetKey: (key) => this.keys.has(key),
        get Poses() {
          return owner.poses;
        },
        get Position() {
          return owner.position ? owner.position.clone() : null;
        },
        Haptic: (side, strength, seconds2) => platform.haptic(side, strength, seconds2),
        get LastClickSide() {
          return owner.lastClickSide;
        },
        get IsVR() {
          return owner.vr;
        },
        InReach: (point, metres) => !(metres > 0) || this.nearestDistance(point) <= metres,
        TeleportTo: (position, yDegrees, stopMovement = true) => {
          this.position = position.clone();
          platform.teleport(position, yDegrees, stopMovement);
        },
        SetAbility: (ability, allowed) => {
          if (allowed) this.abilitiesOff.delete(ability);
          else this.abilitiesOff.add(ability);
          platform.setAbility(ability, allowed);
        },
        SetBlock: (control, blocked) => {
          if (blocked) this.blocksOn.add(control);
          else this.blocksOn.delete(control);
          platform.setBlock(control, blocked);
        }
      };
    }
    // ---- starting -----------------------------------------------------------------------------------------------
    /** Runs the start gate: platform, kit, snapshot, clock, keys, an id, a referee; then starts the behaviours. */
    async start() {
      const { platform, core } = this;
      try {
        await platform.whenReady();
        if (core.disposed) return;
        core.me = platform.local();
        core.listen();
        core.own(
          platform.onRelay(relayKey(core.slug, core.inst), {
            clock: (requestId, seconds2) => this.host.onClockReply(requestId, seconds2),
            event: (name, args) => this.onGraphEvent(name, args)
          })
        );
        core.own(platform.onPose((poses) => this.onPose(poses)));
        void platform.isVR().then((vr) => this.vr = vr, () => this.vr = false);
        core.own(platform.onInput((event) => this.onInput(event)));
        core.own(platform.onStateError(core.prefix + ".", (path, code, final) => this.onRefusedPath(path.slice(core.prefix.length + 1), code, final)));
        await this.loadKit();
        if (core.disposed) return;
        const snapshot = await platform.whenSnapshot(core.options.snapshotTimeoutMs);
        if (core.disposed) return;
        if (!snapshot) core.log("warn", "no full state snapshot arrived in time; starting from what is mirrored");
        await this.askClock(true);
        if (core.disposed) return;
        const saved = storagePrefix(core.slug, core.inst, core.me.uid);
        const publicKey = await this.secrets.init(platform.storage, saved + "ecdh", saved + "draw");
        if (core.disposed) return;
        this.players.on((kind, player) => this.onPlayer(kind, player));
        this.referee.on((now, before) => this.onReferee(now?.sid ?? null, before?.sid ?? null));
        this.presence.start();
        this.presence.announce(publicKey);
        this.referee.start();
        this.players.start();
        this.secrets.listen();
        this.commands.listen();
        this.perUser.listen();
        this.protectedValues.listen();
        this.events.listen();
        this.secrets.onDrawChanged = (sid, label, status) => {
          const player = this.players.bySid(sid);
          if (player && this.started) this.each("OnDrawChanged", (b) => b.OnDrawChanged(player, label, status.state));
        };
        this.protectedValues.onChanged = (key) => {
          if (this.started) this.each("OnProtectedChanged", (b) => b.OnProtectedChanged(key));
        };
        const warn = this.scheduler.after(core.options.admitWarnMs, () => {
          core.log("warn", `still waiting to start: ${this.players.local ? "no referee has been elected" : "the local player's id has not settled"}`);
        });
        await this.players.whenLocalAssigned();
        if (this.rule === "anyone") await this.whenReferee();
        this.scheduler.cancel(warn);
        if (core.disposed) return;
        this.begin();
      } catch (error) {
        core.error("start", error);
      } finally {
        this.ready.resolve(this.started);
      }
    }
    whenReferee() {
      if (this.referee.current()) return Promise.resolve();
      const gate = deferred();
      this.referee.on((now) => {
        if (now) gate.resolve();
      });
      return gate.promise;
    }
    async loadKit() {
      const { core, bindings, element } = this;
      const address = (attr, fallback) => {
        const value = (element.getAttribute(attr) ?? "").trim();
        return /^https?:\/\//i.test(value) ? value : fallback;
      };
      const released = this.platform.bundles(core.slug);
      const windows = address("windows", released?.windows || bindings.bundles.windows);
      const android = address("android", released?.android || bindings.bundles.android);
      const keys = Object.keys(bindings.objects);
      if (windows || android) {
        const spec = {
          holderName: holderName(core.slug, core.inst),
          rootName: (bindings.root ?? bindings.slug) + "(Clone)",
          windows,
          android,
          position: triple(element.getAttribute("position"), false),
          rotation: triple(element.getAttribute("rotation"), false),
          scale: triple(element.getAttribute("scale"), true),
          objects: keys.map((key) => {
            const o = bindings.objects[key];
            const synced = o.sync === "transform" || o.seat;
            return { key, path: o.path, networkId: synced ? networkId(core.slug, core.inst, key) : "", sync: o.sync, grab: o.grab, click: o.click, seat: o.seat };
          })
        };
        try {
          this.kit = await this.platform.loadKit(spec);
          if (this.kit.missing.length) core.log("error", `kit objects not found: ${this.kit.missing.join(", ")}`);
        } catch (error) {
          core.error("the kit did not load", error);
        }
      } else if (keys.length) core.log("warn", "no bundle address for this kit (bindings.bundles is empty and the element names none): running without objects");
      if (core.disposed) {
        this.kit?.destroy();
        this.kit = null;
        return;
      }
      for (const key of keys) {
        const path = bindings.objects[key].path;
        const subscribe2 = (kind, handler) => this.addObjectHandler(key, kind, handler);
        this.objects.set(key, new GameObject(key, path.slice(path.lastIndexOf("/") + 1), this.kit?.objects.get(key) ?? null, this.host, subscribe2));
      }
      this.host.fallbackActive = (key, active) => {
        const object = this.kit?.objects.get(key);
        if (!object) return false;
        object.setActive(active);
        return true;
      };
      let hidden = 0;
      for (const key of keys) {
        if (bindings.objects[key].active !== false) continue;
        this.objects.get(key).SetActive(false);
        hidden++;
      }
      if (hidden) this.host.flush();
      this.host.fallbackClip = (key, index) => {
        const object = this.kit?.objects.get(key);
        if (!object) return false;
        object.playClip(index);
        return true;
      };
      if (!this.kit) return;
      const reads = keys.map((key) => this.objects.get(key).transform.Refresh().catch(() => void 0));
      const waited = deferred();
      const limit = this.scheduler.after(3e3, () => waited.resolve());
      await Promise.race([Promise.all(reads), waited.promise]);
      this.scheduler.cancel(limit);
      for (const key of keys) {
        const o = bindings.objects[key];
        const hostObject = this.kit.objects.get(key);
        if (!hostObject || !(o.grab || o.sync === "transform")) continue;
        const transform = this.objects.get(key).transform;
        core.own(hostObject.watchTransform((pose2) => transform._report(pose2.position, pose2.rotation)));
      }
    }
    async askClock(first) {
      const sentAt = this.platform.clock.now();
      this.lastClockAsk = sentAt;
      const answer = this.host.requestClock().then((seconds2) => {
        if (!this.core.disposed) this.clockSync.accept(seconds2, sentAt);
        return true;
      });
      if (!first) return;
      const gate = deferred();
      const timer = this.scheduler.after(this.core.options.clockTimeoutMs, () => gate.resolve(false));
      const ok = await Promise.race([answer, gate.promise]);
      this.scheduler.cancel(timer);
      if (!ok) this.core.log("warn", "the synced clock did not answer; using this device's clock until it does");
    }
    begin() {
      const { core } = this;
      this.createBehaviours();
      this.wireEvents();
      this.sync.onLocalOwnership = (slot, mine) => {
        if (!mine) return;
        for (const member of slot.members) {
          const key = this.addresses.get(member.behaviour) ? member.behaviour.gameObject.key : "";
          if (key && this.bindings.objects[key]?.sync === "transform") member.behaviour.gameObject.TakeOwnership();
        }
      };
      this.sync.attach();
      for (const behaviour of this.ordinary) core.guard(`${this.idOf(behaviour)}.Start`, () => behaviour.Start());
      this.sync.applySnapshot();
      this.startKindValue = this.computeStartKind();
      this.sync.begin();
      this.commands.started = true;
      this.perUser.started = true;
      this.started = true;
      this.perUser.dataEnabled = this.perUser.dataEnabled || this.anyOverrides("OnPlayerRestored") || this.anyOverrides("OnPlayerDataUpdated");
      this.perUser.restoreLocal();
      for (const behaviour of this.ordinary) core.guard(`${this.idOf(behaviour)}.OnInstanceStart`, () => behaviour.OnInstanceStart(this.startKindValue));
      for (const player of this.players.list()) this.deliverJoin(player);
      this.sync.takeOver();
      this.secrets.review();
      this.commands.review();
      for (const early of this.earlyGraphEvents.splice(0)) this.onGraphEvent(early.name, early.args);
      this.scheduler.start(() => this.tick());
      this.tick();
      let extra = {};
      if (this.game.debug) core.guard("debug hooks", () => extra = this.game.debug(this));
      this.platform.expose(relayKey(core.slug, core.inst), {
        ...extra,
        digest: () => this.digest(),
        state: () => JSON.parse(this.sync.snapshotText()),
        referee: () => this.referee.current(),
        players: () => this.players.list().map((p) => ({ id: p.playerId, name: p.displayName, sid: p.sid }))
      });
      core.log("info", `started (${this.startKindValue}) as ${this.players.local}, ${this.ordinary.length} behaviours`);
    }
    computeStartKind() {
      const ref = this.referee.current();
      if (!ref) return "idle";
      const claim = this.referee.lastClaim;
      if (ref.sid !== this.core.me.sid || !claim || claim.term !== ref.term) return "joined";
      if (claim.fresh) return "fresh";
      return claim.alive ? "joined" : "resumed";
    }
    // ---- behaviours ---------------------------------------------------------------------------------------------
    createBehaviours() {
      const { core, bindings } = this;
      const made = [];
      for (const binding of bindings.behaviours) {
        const cls = this.game.behaviours[binding.type];
        if (!cls) {
          core.log("error", `bindings name behaviour type '${binding.type}' (${binding.id}), which the game does not define`);
          continue;
        }
        if (binding.perPlayer === true || cls.perPlayer === true) {
          this.templates.push({ binding, cls });
          continue;
        }
        const behaviour = new cls();
        linkBehaviour(behaviour, this.makeLink(behaviour, binding, null));
        this.addresses.set(behaviour, { id: binding.id, type: binding.type, playerSid: null });
        this.byId.set(binding.id, behaviour);
        this.ordinary.push(behaviour);
        made.push({ behaviour, binding, cls });
      }
      this.perUser.declareTypes(this.templates.map((t) => t.binding.id));
      for (const { behaviour, binding, cls } of made) {
        this.assignBindingFields(behaviour, binding, null);
        const fields = cls.synced ?? [];
        for (const field of fields) if (!(field in behaviour)) core.log("warn", `${binding.id}: synced field '${field}' is not a field of ${binding.type}`);
        this.sync.add(behaviour, binding.id, fields, fields.length ? cls.syncMode ?? "manual" : "none", cls.fieldChangeCallbacks, binding.group);
      }
    }
    makePlayerBehaviours(player) {
      if (!this.templates.length || this.playerBehaviourMap.has(player.sid)) return;
      const mine = /* @__PURE__ */ new Map();
      this.playerBehaviourMap.set(player.sid, mine);
      const made = [];
      for (const template of this.templates) {
        const behaviour = new template.cls();
        linkBehaviour(behaviour, this.makeLink(behaviour, template.binding, player));
        this.addresses.set(behaviour, { id: template.binding.id, type: template.binding.type, playerSid: player.sid });
        mine.set(template.binding.id, behaviour);
        made.push({ behaviour, template });
      }
      for (const { behaviour, template } of made) this.assignBindingFields(behaviour, template.binding, mine);
      for (const { behaviour, template } of made) {
        const id = template.binding.id;
        this.core.guard(`${id}.Start`, () => behaviour.Start());
        const hasData = this.perUser.adopt(player, id, behaviour, template.cls.synced ?? [], template.cls.persistent === true, template.cls.fieldChangeCallbacks);
        if (hasData) this.core.guard(`${id}.OnDeserialization`, () => behaviour.OnDeserialization({ isSnapshot: true, isRollback: false }));
      }
    }
    makeLink(behaviour, binding, player) {
      const gameObject = (binding.object ? this.objects.get(binding.object) : void 0) ?? new GameObject("", binding.id, null, null);
      const instance = this;
      return {
        id: binding.id,
        gameObject,
        networking: this.networking,
        time: this.timeView,
        random: this.randomView,
        debug: this.debugView,
        secrets: this.secrets,
        storage: this.storage,
        host: this.host,
        settings: this.settings,
        playerData: this.perUser,
        input: this.inputView,
        protectedValues: this.protectedValues,
        player,
        instanceKey: this.inst,
        shared: this.shared,
        reach: this.reachOverride,
        requestSerialization() {
          if (player) {
            if (player.isLocal) instance.perUser.requestSerialization(behaviour);
            return;
          }
          const slot = instance.sync.slotOf(behaviour);
          if (slot) instance.sync.requestSerialization(slot);
        },
        sendNetworkEvent(target, name, args) {
          instance.events.send(behaviour, target, name, args);
        },
        sendCommand(name, args) {
          return instance.commands.send(behaviour, name, args);
        },
        delaySeconds(name, seconds2) {
          instance.scheduler.after(seconds2 * 1e3, () => instance.callByName(behaviour, name));
        },
        delayFrames(name, frames) {
          instance.scheduler.afterTicks(frames, () => instance.callByName(behaviour, name));
        },
        find: (id) => {
          const sibling = player ? this.playerBehaviourMap.get(player.sid)?.get(id) : void 0;
          return sibling ?? this.byId.get(id) ?? null;
        },
        findByType: (type) => this.ordinary.filter((b) => this.addresses.get(b)?.type === type),
        playerBehaviour: (who, type) => this.playerBehaviourOf(who, type),
        playerBehaviours: (type) => this.players.list().map((p) => this.playerBehaviourOf(p, type)).filter((b) => b !== null),
        raycast: (origin, direction, maxDistance, layerMask) => this.platform.raycast(origin, direction, maxDistance, layerMask),
        onGraphEvent: (name, method) => this.addGraphHandler(name, behaviour, method)
      };
    }
    playerBehaviourOf(player, type) {
      const mine = this.playerBehaviourMap.get(player.sid);
      if (!mine) return null;
      for (const behaviour of mine.values()) if (this.addresses.get(behaviour)?.type === type) return behaviour;
      return mine.get(type) ?? null;
    }
    callByName(behaviour, name) {
      if (this.core.disposed) return;
      const fn = behaviour[name];
      if (typeof fn === "function") this.core.guard(name, () => fn.call(behaviour));
      else this.core.log("warn", `${this.idOf(behaviour)} has no method '${name}' for a delayed event`);
    }
    assignBindingFields(behaviour, binding, siblings) {
      if (!binding.fields) return;
      const bag = behaviour;
      for (const name of Object.keys(binding.fields)) bag[name] = this.resolveField(binding.fields[name], siblings, `${binding.id}.${name}`, binding.object ?? null);
    }
    /** Turns a bindings field value into what the behaviour holds: objects, behaviours, component proxies, values. */
    resolveField(value, siblings, where, ownObject) {
      if (Array.isArray(value)) return value.map((v, i) => this.resolveField(v, siblings, `${where}[${i}]`, ownObject));
      if (!isRecord(value)) return value;
      if (typeof value.$obj === "string") return this.objects.get(value.$obj) ?? null;
      if (typeof value.$beh === "string") {
        const found = siblings?.get(value.$beh) ?? this.byId.get(value.$beh) ?? null;
        if (!found) this.core.log("warn", `${where}: behaviour '${value.$beh}' is per-player or missing, so the field is null`);
        return found;
      }
      if (typeof value.$comp === "string") {
        const object = this.objects.get(value.$comp);
        return object ? makeComponent(String(value.kind ?? "Transform"), object, this.host) : null;
      }
      if (typeof value.$clip === "number") return new AudioClipRef(value.$clip, typeof value.on === "string" ? value.on : null);
      if (Object.keys(value).some((key) => key.startsWith("$"))) return decodeValue(value);
      const out = {};
      for (const key of Object.keys(value)) out[key] = this.resolveField(value[key], siblings, `${where}.${key}`, ownObject);
      return out;
    }
    idOf(behaviour) {
      return this.addresses.get(behaviour)?.id ?? "?";
    }
    all() {
      const out = this.ordinary.slice();
      for (const mine of this.playerBehaviourMap.values()) for (const behaviour of mine.values()) out.push(behaviour);
      return out;
    }
    overrides(behaviour, method) {
      return behaviour[method] !== Behaviour.prototype[method];
    }
    anyOverrides(method) {
      if (this.ordinary.some((b) => this.overrides(b, method))) return true;
      return this.templates.some((t) => t.cls.prototype[method] !== Behaviour.prototype[method]);
    }
    /** Calls a callback on every behaviour that overrides it. */
    each(method, call) {
      if (!this.started || this.core.disposed) return;
      for (const behaviour of this.all()) {
        if (this.overrides(behaviour, method)) this.core.guard(`${this.idOf(behaviour)}.${String(method)}`, () => call(behaviour));
      }
    }
    // ---- players and referee ------------------------------------------------------------------------------------
    onPlayer(kind, player) {
      if (!this.started || this.core.disposed) return;
      if (kind === "join") {
        this.deliverJoin(player);
        return;
      }
      if (!this.referee.current()) {
        this.pendingLeaves.push(player);
        if (this.rule === "anyone") this.scheduler.after(5e3, () => this.flushLeaves());
        return;
      }
      this.deliverLeave(player);
    }
    flushLeaves() {
      for (const player of this.pendingLeaves.splice(0)) this.deliverLeave(player);
    }
    deliverJoin(player) {
      this.makePlayerBehaviours(player);
      this.each("OnPlayerJoined", (b) => b.OnPlayerJoined(player));
      this.perUser.playerDelivered(player);
    }
    deliverLeave(player) {
      this.each("OnPlayerLeft", (b) => b.OnPlayerLeft(player));
      const gone = this.perUser.playerGone(player.sid);
      const mine = this.playerBehaviourMap.get(player.sid);
      this.playerBehaviourMap.delete(player.sid);
      for (const behaviour of mine ? mine.values() : gone) {
        this.core.guard("OnDestroy", () => behaviour.OnDestroy());
        this.addresses.delete(behaviour);
      }
    }
    onReferee(now, before) {
      if (!this.started || this.core.disposed) return;
      if (now !== before) {
        const wasIdle = this.startKindValue === "idle";
        if (wasIdle && now !== null) {
          this.startKindValue = this.computeStartKind();
          this.each("OnInstanceStart", (b) => b.OnInstanceStart(this.startKindValue));
        }
        const player = now === null ? null : this.players.bySid(now);
        if (player || now === null && this.referee.candidates().length === 0) this.each("OnMasterTransferred", (b) => b.OnMasterTransferred(player));
      }
      if (now !== null) this.flushLeaves();
    }
    // NetHost
    localPlayer() {
      const local = this.players.local;
      if (!local) throw new Error("the local player is not known before the instance has started");
      return local;
    }
    isReferee() {
      return this.referee.isMe();
    }
    owner(target) {
      const address = this.addresses.get(target);
      if (address?.playerSid) return this.players.bySid(address.playerSid);
      const slot = this.sync.slotOf(target);
      return slot ? this.sync.owner(slot) : null;
    }
    isOwner(target, player) {
      const address = this.addresses.get(target);
      if (address?.playerSid) return address.playerSid === player.sid;
      const slot = this.sync.slotOf(target);
      return slot ? this.sync.isOwner(slot, player.sid) : false;
    }
    setOwner(target, player) {
      if (this.addresses.get(target)?.playerSid) {
        this.core.log("warn", `${this.idOf(target)} is a per-player behaviour: its owner cannot change`);
        return;
      }
      const slot = this.sync.slotOf(target);
      if (slot) this.sync.setOwner(slot, player.sid, player.uid);
    }
    behavioursOn(object) {
      return this.ordinary.filter((b) => b.gameObject === object);
    }
    serverSeconds() {
      return this.clockSync.seconds();
    }
    playerList() {
      return this.players.list();
    }
    playerById(id) {
      return this.players.byId(id);
    }
    callingPlayer() {
      return this.events.callingSid === null ? null : this.players.bySid(this.events.callingSid);
    }
    callingSession() {
      const sid = this.events.callingSid;
      if (sid === null) return null;
      const who = this.platform.players().find((p) => p.sid === sid);
      return { sid, uid: who ? who.uid : "" };
    }
    setCandidate(on) {
      if (this.rule !== "declared") {
        this.core.log("warn", 'SetRefereeCandidate only matters in a game whose definition says referee: "declared"');
        return;
      }
      this.referee.setCandidate(on);
    }
    isCandidate(player) {
      return this.referee.isCandidate(player.sid);
    }
    startKind() {
      return this.startKindValue;
    }
    refereePlayer() {
      const ref = this.referee.current();
      return ref ? this.players.bySid(ref.sid) : null;
    }
    // ---- events from objects, graphs and input ------------------------------------------------------------------
    wireEvents() {
      const explicit = /* @__PURE__ */ new Set();
      const mine = (id) => () => this.playerBehaviourMap.get(this.core.me.sid)?.get(id) ?? null;
      for (const event of this.bindings.events) {
        if (!event.behaviour || !event.method) continue;
        const ordinary = this.byId.get(event.behaviour);
        const perPlayer = !ordinary && this.templates.some((t) => t.binding.id === event.behaviour);
        if (!ordinary && !perPlayer) continue;
        const target = ordinary ?? mine(event.behaviour);
        if (event.kind === "graph") {
          this.addGraphHandler(event.name ?? "", target, event.method);
          continue;
        }
        explicit.add(`${event.object}/${event.kind}/${event.behaviour}`);
        this.addObjectHandler(event.object, event.kind, (detail) => {
          const behaviour = typeof target === "function" ? target() : target;
          if (behaviour) this.callBound(behaviour, event, detail);
        });
      }
      for (const template of this.templates) {
        const key = template.binding.object;
        const object = key ? this.bindings.objects[key] : void 0;
        if (!key || !object) continue;
        const id = template.binding.id;
        const proto = template.cls.prototype;
        const base = Behaviour.prototype;
        if (object.click && proto.Interact !== base.Interact && !explicit.has(`${key}/click/${id}`)) {
          this.addObjectHandler(key, "click", (detail) => {
            const behaviour = mine(id)();
            if (behaviour && this.withinReach(behaviour, void 0, template.cls.interactReach ?? 0, detail)) this.core.guard(`${id}.Interact`, () => behaviour.Interact());
          });
        }
        if (object.grab && proto.OnPickup !== base.OnPickup && !explicit.has(`${key}/grab/${id}`)) {
          this.addObjectHandler(key, "grab", () => mine(id)()?.OnPickup());
        }
        if (object.grab && proto.OnDrop !== base.OnDrop && !explicit.has(`${key}/drop/${id}`)) {
          this.addObjectHandler(key, "drop", () => mine(id)()?.OnDrop());
        }
      }
      for (const behaviour of this.ordinary) {
        const key = behaviour.gameObject.key;
        const object = key ? this.bindings.objects[key] : void 0;
        if (!object) continue;
        const id = this.idOf(behaviour);
        const cls = behaviour.constructor;
        if (object.click && this.overrides(behaviour, "Interact") && !explicit.has(`${key}/click/${id}`)) {
          this.addObjectHandler(key, "click", (detail) => {
            if (this.withinReach(behaviour, void 0, cls.interactReach ?? 0, detail)) this.core.guard(`${id}.Interact`, () => behaviour.Interact());
          });
        }
        if (object.grab && this.overrides(behaviour, "OnPickup") && !explicit.has(`${key}/grab/${id}`)) {
          this.addObjectHandler(key, "grab", () => this.core.guard(`${id}.OnPickup`, () => behaviour.OnPickup()));
        }
        if (object.grab && this.overrides(behaviour, "OnDrop") && !explicit.has(`${key}/drop/${id}`)) {
          this.addObjectHandler(key, "drop", () => this.core.guard(`${id}.OnDrop`, () => behaviour.OnDrop()));
        }
      }
    }
    callBound(behaviour, event, detail) {
      const cls = behaviour.constructor;
      if (event.kind === "click" && !this.withinReach(behaviour, event.reach, cls.interactReach ?? 0, detail)) return;
      const fn = behaviour[event.method];
      if (typeof fn !== "function") {
        this.core.log("warn", `${event.behaviour} has no method '${event.method}' (bound to ${event.kind} of ${event.object})`);
        return;
      }
      let argument = detail;
      if (event.kind === "uiSlider") argument = Number(detail.arg ?? "0");
      else if (event.kind === "uiToggle") argument = detail.arg === "1" || detail.arg === "true" || detail.arg === "True";
      else if (event.kind === "field") argument = detail.arg ?? "";
      this.core.guard(`${event.behaviour}.${event.method}`, () => fn.call(behaviour, argument));
    }
    /**
     * True when a click is close enough to count: measured from the nearest of the local head and hands. The reach is
     * the behaviour's own (InteractReach), else the binding's, else the class's, else the game's. With no pose
     * reported yet, every click counts.
     */
    withinReach(behaviour, eventReach, classReach, detail) {
      const own = this.reachOverride.get(behaviour);
      const reach = own !== void 0 ? own : eventReach !== void 0 ? eventReach : classReach > 0 ? classReach : this.game.interactReach ?? 0;
      if (!(reach > 0)) return true;
      const transform = behaviour.gameObject.transform;
      const point = detail.point ?? (transform.known ? transform.position : null);
      if (!point) return true;
      return this.nearestDistance(point) <= reach;
    }
    /** Metres from `point` to the nearest of the local head and hands; 0 when no pose or position is known. */
    nearestDistance(point) {
      const poses = this.poses;
      const from = poses ? [poses.head.position, poses.leftHand.position, poses.rightHand.position] : this.position ? [this.position] : [];
      if (!from.length) return 0;
      let nearest = Infinity;
      for (const p of from) nearest = Math.min(nearest, Vector3.Distance(p, point));
      return nearest;
    }
    /** The hand that clicked: the one whose trigger went down in the last second, else the one nearest the point. */
    clickSide(point) {
      const now = this.platform.clock.now();
      const [left, right] = this.triggerAt;
      const recent = Math.max(left, right);
      if (now - recent <= 1e3) return right >= left ? 1 : 0;
      if (!this.poses || !point) return null;
      return Vector3.Distance(this.poses.rightHand.position, point) <= Vector3.Distance(this.poses.leftHand.position, point) ? 1 : 0;
    }
    addObjectHandler(objKey, kind, handler) {
      let kinds = this.objectHandlers.get(objKey);
      if (!kinds) this.objectHandlers.set(objKey, kinds = /* @__PURE__ */ new Map());
      let list = kinds.get(kind);
      if (!list) kinds.set(kind, list = []);
      list.push(handler);
      const wire = `${objKey}/${kind}`;
      const hostObject = this.kit?.objects.get(objKey);
      if (hostObject && !this.hostWired.has(wire)) {
        this.hostWired.add(wire);
        this.core.own(hostObject.on(kind, (detail) => this.dispatchObject(objKey, kind, detail)));
      }
    }
    /** Delivers an object's event to what is bound to it. Also the entry point for events a graph raised. */
    dispatchObject(objKey, kind, detail) {
      if (!this.started || this.core.disposed) return;
      if (kind === "click") {
        if (detail.side === void 0) {
          const side = this.clickSide(detail.point);
          if (side !== null) detail.side = side;
        }
        this.lastClickSide = detail.side === 0 || detail.side === 1 ? detail.side : null;
      }
      const handlers = this.objectHandlers.get(objKey)?.get(kind);
      if (!handlers || !handlers.length) return;
      const run = () => {
        if (this.core.disposed) return;
        for (const handler of handlers.slice()) this.core.guard(`${objKey} ${kind}`, () => handler(detail));
      };
      const object = this.objects.get(objKey);
      if (kind === "drop" && object && object.host) {
        object.transform.Refresh().then(run, run);
        return;
      }
      run();
    }
    addGraphHandler(name, behaviour, method) {
      if (!name) return;
      let list = this.graphHandlers.get(name);
      if (!list) this.graphHandlers.set(name, list = []);
      list.push({ behaviour, method });
    }
    onGraphEvent(name, args) {
      if (this.core.disposed) return;
      if (!this.started) {
        if (this.earlyGraphEvents.length < MAX_EARLY_EVENTS) this.earlyGraphEvents.push({ name, args });
        return;
      }
      if (OBJECT_EVENTS.indexOf(name) >= 0) {
        const key = this.keyOfTarget(args[0] ?? "");
        if (!key) return;
        const detail = { arg: args[1], args: args.slice(1) };
        if (name.startsWith("collision") || name.startsWith("trigger")) {
          const n = args.slice(2, 8).map(Number);
          if (args[1] !== void 0) detail.otherName = args[1];
          if (n.length >= 3 && n.slice(0, 3).every(Number.isFinite)) detail.point = new Vector3(n[0], n[1], n[2]);
          if (n.length >= 6 && n.slice(3, 6).every(Number.isFinite)) detail.normal = new Vector3(n[3], n[4], n[5]);
        }
        if (name.startsWith("held") && args[1] === "left") detail.side = 0;
        else if (name.startsWith("held") && args[1] === "right") detail.side = 1;
        this.dispatchObject(key, name, detail);
        return;
      }
      const handlers = this.graphHandlers.get(name);
      if (!handlers) return;
      for (const handler of handlers.slice()) {
        const behaviour = typeof handler.behaviour === "function" ? handler.behaviour() : handler.behaviour;
        const method = handler.method;
        if (!behaviour) continue;
        const fn = behaviour[method];
        if (typeof fn === "function") this.core.guard(`${this.idOf(behaviour)}.${method}`, () => fn.apply(behaviour, args));
      }
    }
    /** A relay target ("3", "@Board/Cup") or a binding key, as a binding key. */
    keyOfTarget(target) {
      if (target.startsWith("@")) {
        const path = target.slice(1);
        for (const key of Object.keys(this.bindings.objects)) if (this.bindings.objects[key].path === path) return key;
        return null;
      }
      if (/^\d+$/.test(target)) return this.bindings.refs[Number(target)] ?? null;
      return target in this.bindings.objects ? target : null;
    }
    onPose(poses) {
      this.poses = poses;
      this.position = poses.head.position;
    }
    onInput(event) {
      if (this.core.disposed) return;
      if (event.type === "button") {
        const id = `${event.side}/${event.button}`;
        if (event.pressed && event.button === 0) this.triggerAt[event.side] = this.platform.clock.now();
        if (event.pressed) this.buttons.add(id);
        else this.buttons.delete(id);
        const { button, side } = event;
        if (event.pressed) this.each("OnButtonPressed", (b) => b.OnButtonPressed(button, side));
        else this.each("OnButtonReleased", (b) => b.OnButtonReleased(button, side));
      } else if (event.type === "thumbstick") {
        this.sticks[event.side] = new Vector2(event.x, event.y);
      } else if (event.type === "trigger") {
        this.triggers[event.side] = event.value;
      } else {
        const key = event.key;
        if (event.pressed) this.keys.add(key);
        else this.keys.delete(key);
        if (event.pressed) this.each("OnKeyPressed", (b) => b.OnKeyPressed(key));
        else this.each("OnKeyReleased", (b) => b.OnKeyReleased(key));
      }
    }
    // ---- the tick -----------------------------------------------------------------------------------------------
    tick() {
      const { core } = this;
      if (core.disposed) return;
      for (const behaviour of this.all()) {
        if (this.overrides(behaviour, "Update")) core.guard(`${this.idOf(behaviour)}.Update`, () => behaviour.Update());
      }
      this.sync.flush();
      this.perUser.flush();
      this.presence.flush();
      this.host.flush();
      if (this.scheduler.ticks % 20 === 0) {
        this.presence.tend();
        this.players.tend();
        this.secrets.review();
        this.commands.review();
        this.sync.takeOver();
        if (this.platform.clock.now() - this.lastClockAsk >= core.options.clockResyncMs) void this.askClock(false);
      }
    }
    // ---- refused writes -----------------------------------------------------------------------------------------
    onRefusedPath(key, code, final) {
      if (this.core.disposed) return;
      this.core.log(final ? "error" : "warn", `the room ${final ? "refused" : "is holding back"} a write to ${key}: ${code}`);
      if (key === "d" || /^p[0-3]$/.test(key)) {
        this.refuse(null, { kind: key === "d" ? "playerData" : "playerObject", code, key, final });
        return;
      }
      if (key.startsWith("x.")) {
        this.refuse(null, { kind: "protected", code, key: key.slice(2), final });
        return;
      }
      const slot = this.sync.slotForKey(key);
      if (!slot) {
        this.refuse(null, { kind: "state", code, key, final });
        return;
      }
      for (const member of slot.members) {
        if (final && !key.startsWith("o.")) this.core.guard("OnPostSerialization", () => member.behaviour.OnPostSerialization({ success: false, byteCount: 0 }));
        this.core.guard("OnWriteRefused", () => member.behaviour.OnWriteRefused({ kind: "state", code, key, final }));
      }
    }
    /** Reports a refusal to the behaviour it belongs to, or to every behaviour that listens and to the game. */
    refuse(behaviour, refusal) {
      if (behaviour) {
        this.core.guard("OnWriteRefused", () => behaviour.OnWriteRefused(refusal));
        return;
      }
      this.each("OnWriteRefused", (b) => b.OnWriteRefused(refusal));
      if (this.game.onWriteRefused) this.core.guard("onWriteRefused", () => this.game.onWriteRefused(refusal));
    }
    // ---- inspection and teardown --------------------------------------------------------------------------------
    /** An ordinary behaviour by its bindings id (for tests and for the page registry). */
    behaviour(id) {
      const found = this.byId.get(id);
      if (!found) throw new Error(`no behaviour '${id}' in ${this.core.slug}:${this.inst}`);
      return found;
    }
    /** A per-player behaviour: the copy of `id` that belongs to the player with session `sid`. */
    playerBehaviour(sid, id) {
      return this.playerBehaviourMap.get(sid)?.get(id) ?? null;
    }
    /** A short hash of every synced field: equal on clients that agree. */
    digest() {
      return fnv1a(this.sync.snapshotText());
    }
    dispose() {
      const { core } = this;
      if (core.disposed) return;
      if (this.started) for (const behaviour of this.all()) core.guard("OnDestroy", () => behaviour.OnDestroy());
      for (const ability of this.abilitiesOff) this.platform.setAbility(ability, true);
      for (const control of this.blocksOn) this.platform.setBlock(control, false);
      this.presence.retire();
      this.perUser.retire();
      this.host.abandonClock();
      this.platform.expose(relayKey(core.slug, core.inst), null);
      core.dispose();
      this.kit?.destroy();
      this.kit = null;
      this.ready.resolve(false);
    }
  };
  function triple(text, uniform) {
    if (!text) return null;
    const parts = text.trim().split(/\s+/).map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 3) return new Vector3(parts[0], parts[1], parts[2]);
    if (uniform && parts.length === 1) return new Vector3(parts[0], parts[0], parts[0]);
    return null;
  }

  // portkit/src/boot.ts
  var RUNTIME_VERSION = "0.1.0";
  var GameRuntime = class {
    constructor(platform, game2, bindings) {
      __publicField(this, "platform");
      __publicField(this, "game");
      __publicField(this, "bindings");
      /** Running instances by instance key. */
      __publicField(this, "instances", /* @__PURE__ */ new Map());
      /** One object for every instance of this game on the page (Behaviour.Shared): page memory, not synced or saved. */
      __publicField(this, "shared", {});
      __publicField(this, "stopped", false);
      __publicField(this, "unsubs", []);
      this.platform = platform;
      this.game = game2;
      this.bindings = bindings;
    }
    /** Waits for the page, then serves every element of this game, now and later. */
    async start() {
      await this.platform.whenReady();
      if (this.stopped) return;
      this.unsubs.push(this.platform.onSnippetsChanged(() => this.scan()));
      this.unsubs.push(
        this.platform.onSessionChanged(() => {
          this.platform.log("warn", `[${this.game.slug}] the session changed; restarting every instance`);
          for (const instance of this.instances.values()) instance.dispose();
          this.instances.clear();
          this.scan();
        })
      );
      this.scan();
    }
    /** Brings the running instances in line with the elements on the page. */
    scan() {
      if (this.stopped) return;
      const wanted = /* @__PURE__ */ new Map();
      for (const element of this.platform.snippets(this.game.slug)) {
        if (!element.connected || !element.active) continue;
        const key = instanceKeyFor({ room: element.getAttribute("room"), instance: element.getAttribute("instance") }, element.index);
        if (wanted.has(key)) {
          this.platform.log("warn", `[${this.game.slug}] two elements resolve to instance '${key}' (same room or instance attribute); the second is ignored`);
          continue;
        }
        wanted.set(key, element);
      }
      for (const [key, instance] of [...this.instances]) {
        if (wanted.get(key) === instance.element) continue;
        instance.dispose();
        this.instances.delete(key);
      }
      for (const [key, element] of wanted) {
        if (this.instances.has(key)) continue;
        const instance = new GameInstance(this.platform, this.game, this.bindings, element, key, this.shared);
        this.instances.set(key, instance);
        void instance.start();
      }
    }
    instance(key) {
      return this.instances.get(key);
    }
    stop() {
      this.stopped = true;
      for (const unsub of this.unsubs.splice(0)) unsub();
      for (const instance of this.instances.values()) instance.dispose();
      this.instances.clear();
    }
  };
  function boot(platform, game2, rawBindings) {
    if (!isValidSlug(game2.slug)) throw new Error(`'${game2.slug}' is not a valid slug`);
    const bindings = validateBindings(rawBindings);
    if (bindings.slug !== game2.slug) throw new Error(`bindings.json is for '${bindings.slug}', the game is '${game2.slug}'`);
    if (!platform.claimGame(game2.slug, { runtime: RUNTIME_VERSION, bindings: bindings.hash ?? "" })) return null;
    const runtime = new GameRuntime(platform, game2, bindings);
    runtime.start().catch((error) => platform.log("error", `[${game2.slug}] could not start: ${error instanceof Error ? error.message : String(error)}`));
    return runtime;
  }

  // portkit/src/types.ts
  var DEFAULT_LIMITS = {
    maxLeafBytes: 16384,
    maxRoomKeys: 2048,
    oneShotMaxBytes: 4089,
    maxUserKeys: 64
  };

  // src/GameTypes.ts
  var Role = { Unassigned: 0, Technician: 1, Saboteur: 2, Observer: 3 };
  var MatchState = { Lobby: 0, Playing: 1, Muster: 2, Ended: 3 };
  var Team = { None: 0, Technicians: 1, Saboteurs: 2 };
  var Fault = { None: 0, Blackout: 1, Breach: 2, Jam: 3, Scrubber: 4 };
  var Interaction = { None: 0, Job: 1, Reset: 2 };
  var JobKind = { Hold: 0, Tap: 1, Timing: 2 };
  var Announcement = { None: 0, MusterResult: 1, MatchResult: 2 };
  var Btn = { Eliminate: 0, Alarm: 1, Vote: 2, Use: 3, Fault: 4, Hatch: 5 };
  var ABSTAIN = -1;
  var ROLE_NAMES = { 0: "Unassigned", 1: "Technician", 2: "Saboteur", 3: "Observer" };
  var TEAM_NAMES = { 0: "Nobody", 1: "The technicians", 2: "The saboteurs" };
  var FAULT_NAMES = { 0: "", 1: "Blackout", 2: "Ballast breach", 3: "Sonar jam", 4: "Scrubber fault" };
  var FAULT_IDS = { blackout: Fault.Blackout, breach: Fault.Breach, jam: Fault.Jam, scrubber: Fault.Scrubber };
  var JOB_KIND_IDS = { hold: JobKind.Hold, tap: JobKind.Tap, timing: JobKind.Timing };
  var JOB_KIND_NAMES = { 0: "Hold", 1: "Tap", 2: "Timing" };
  var DEFAULT_SETTINGS = {
    minPlayers: 4,
    maxPlayers: 10,
    saboteurs: 1,
    bots: 0,
    startBy: "anyone",
    jobsPerPlayer: 5,
    jobWaves: 2,
    firstWaveSeconds: 30,
    waveIntervalSeconds: 45,
    shiftSeconds: 180,
    shiftFailSeconds: 4,
    eliminateCooldown: 10,
    eliminateRange: 1.45,
    reportRange: 1.7,
    jobRange: 1.1,
    holdSeconds: 1.35,
    tapCount: 4,
    timingCycleSeconds: 2.2,
    timingBand: [0.7, 0.82],
    faultRange: 1.2,
    faultCooldown: 18,
    firstFaultSeconds: 4,
    breachSeconds: 45,
    scrubberSeconds: 45,
    resetSeconds: 2,
    hatchRange: 0.9,
    musterRange: 1.15,
    musterCooldown: 25,
    musterSeconds: 30,
    announceSeconds: 4.5,
    returnAfterMuster: true,
    visionRange: 0,
    blackoutVision: 4.8,
    rangeSlack: 0.5,
    botMoveSpeed: 1.6,
    botVoteDelay: 1.5,
    botVoteInterval: 0.45,
    botTaskPause: 3.5,
    botThinkSeconds: 0.9,
    botFaultChance: 0.3
  };
  var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function readSettings(attributes) {
    const s = { ...DEFAULT_SETTINGS, timingBand: [...DEFAULT_SETTINGS.timingBand] };
    const num = (name, fallback, lo, hi) => {
      const raw = attributes.get(name);
      if (raw === void 0 || raw.trim() === "") return fallback;
      const v = Number(raw);
      return Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
    };
    const int = (name, fallback, lo, hi) => Math.round(num(name, fallback, lo, hi));
    s.minPlayers = int("min-players", s.minPlayers, 2, 10);
    s.maxPlayers = int("max-players", s.maxPlayers, 2, 10);
    if (s.maxPlayers < s.minPlayers) s.maxPlayers = s.minPlayers;
    s.saboteurs = int("saboteurs", s.saboteurs, 1, 3);
    s.bots = int("bots", s.bots, 0, 9);
    s.startBy = attributes.get("start-by") === "admin" ? "admin" : "anyone";
    s.jobsPerPlayer = int("jobs-per-player", s.jobsPerPlayer, 1, 10);
    s.jobWaves = int("job-waves", s.jobWaves, 0, 5);
    s.firstWaveSeconds = num("first-wave-seconds", s.firstWaveSeconds, 1, 600);
    s.waveIntervalSeconds = num("wave-interval-seconds", s.waveIntervalSeconds, 1, 600);
    s.shiftSeconds = num("shift-seconds", s.shiftSeconds, 30, 3600);
    s.shiftFailSeconds = num("shift-fail-seconds", s.shiftFailSeconds, 1, 30);
    s.eliminateCooldown = num("eliminate-cooldown", s.eliminateCooldown, 0, 120);
    s.eliminateRange = num("eliminate-range", s.eliminateRange, 0.5, 5);
    s.reportRange = num("report-range", s.reportRange, 0.5, 5);
    s.jobRange = num("job-range", s.jobRange, 0.5, 5);
    s.holdSeconds = num("hold-seconds", s.holdSeconds, 0.1, 30);
    s.tapCount = int("pulse-count", s.tapCount, 1, 20);
    s.timingCycleSeconds = num("timing-cycle-seconds", s.timingCycleSeconds, 0.5, 30);
    const band = (attributes.get("timing-band") ?? "").trim().split(/\s+/).map(Number);
    if (band.length === 2 && band.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && band[0] < band[1]) s.timingBand = [band[0], band[1]];
    s.faultRange = num("fault-range", s.faultRange, 0.5, 5);
    s.faultCooldown = num("fault-cooldown", s.faultCooldown, 0, 600);
    s.breachSeconds = num("surge-seconds", num("breach-seconds", s.breachSeconds, 5, 600), 5, 600);
    s.scrubberSeconds = num("scrubber-seconds", s.scrubberSeconds, 0, 600);
    s.resetSeconds = num("reset-seconds", s.resetSeconds, 0.1, 30);
    s.hatchRange = num("hatch-range", s.hatchRange, 0.3, 5);
    s.musterRange = num("muster-range", s.musterRange, 0.5, 5);
    s.musterCooldown = num("muster-cooldown", s.musterCooldown, 0, 600);
    s.musterSeconds = num("muster-seconds", s.musterSeconds, 5, 600);
    s.announceSeconds = num("announce-seconds", s.announceSeconds, 1, 60);
    s.returnAfterMuster = attributes.get("return-after-muster") !== "false";
    s.visionRange = num("vision-range", s.visionRange, 0, 100);
    s.blackoutVision = num("blackout-vision", s.blackoutVision, 1, 100);
    s.rangeSlack = num("range-slack", s.rangeSlack, 0, 3);
    return s;
  }

  // src/Beat.ts
  var BEAT_CHARS = 360;
  var SECRET_CHARS = 160;
  var MAX_EDGES = 8;
  var EDGE_WINDOW = 1;
  var BEAT_TICKS = 5;
  var round3 = (v) => Math.round(v * 1e3) / 1e3;
  var round2 = (v) => Math.round(v * 100) / 100;
  function pad(text, length) {
    if (text.length > length) throw new Error(`a sealed message needs ${text.length} characters, more than ${length}`);
    return text + " ".repeat(length - text.length);
  }
  function encodeBeat(beat) {
    const edges = beat.e.slice(-MAX_EDGES).map((e) => [e[0], e[1], round3(e[2]), e[3]]);
    for (; ; ) {
      const text = JSON.stringify({ m: beat.m, q: beat.q, t: round3(beat.t), p: [round2(beat.p[0]), round2(beat.p[1])], h: beat.h, e: edges });
      if (text.length <= BEAT_CHARS) return pad(text, BEAT_CHARS);
      edges.shift();
    }
  }
  function decodeBeat(text) {
    if (typeof text !== "string") return null;
    try {
      const b = JSON.parse(text.trimEnd());
      if (typeof b.m !== "number" || typeof b.q !== "number" || typeof b.t !== "number" || !Array.isArray(b.p) || !Array.isArray(b.e)) return null;
      const p = [Number(b.p[0]), Number(b.p[1])];
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(b.t)) return null;
      const e = [];
      for (const raw of b.e.slice(0, MAX_EDGES)) {
        if (!Array.isArray(raw)) continue;
        const button = Number(raw[0]);
        const t = Number(raw[2]);
        if (!Number.isInteger(button) || button < 0 || button > Btn.Hatch || !Number.isFinite(t)) continue;
        e.push([button, raw[1] ? 1 : 0, t, Number.isFinite(Number(raw[3])) ? Number(raw[3]) : 0]);
      }
      return { m: b.m, q: b.q, t: b.t, p, h: Number(b.h) | 0, e };
    } catch {
      return null;
    }
  }
  function encodeSecret(secret) {
    return pad(JSON.stringify({ ...secret, k: round2(secret.k), s: round2(secret.s) }), SECRET_CHARS);
  }
  function decodeSecret(value) {
    if (typeof value !== "string") return null;
    try {
      const s = JSON.parse(value.trimEnd());
      return typeof s.n === "number" && typeof s.r === "number" ? s : null;
    } catch {
      return null;
    }
  }

  // src/Dealer.ts
  var Dealer = class extends Behaviour {
    constructor() {
      super(...arguments);
      /** {r: match number, s: [one sealed entry per slot, "" for a bot or a player whose key is not known yet]} */
      __publicField(this, "box", "");
      /** The local player's own entry, once opened. */
      __publicField(this, "mine", null);
      /** The match number of the last entry opened. */
      __publicField(this, "openedRound", -1);
      /** How many entries this client has opened (tests). */
      __publicField(this, "opens", 0);
      /** Told when the local player's entry changes. */
      __publicField(this, "onMine", () => {
      });
      __publicField(this, "opening", 0);
      __publicField(this, "sealing", false);
    }
    OnDeserialization() {
      void this.OpenMine();
    }
    /** The referee writes a new box: `entries` are the plain secrets per slot, `players` who each slot is now. */
    async Deal(round, entries, players) {
      if (!this.Networking.IsReferee || this.sealing) return;
      this.sealing = true;
      try {
        const sealed = await Promise.all(
          entries.map(async (secret, slot) => {
            const p = players[slot];
            if (!secret || !p || !this.Secrets.canSealFor(p.sid)) return "";
            try {
              return await this.Secrets.seal(p.sid, encodeSecret(secret));
            } catch {
              return "";
            }
          })
        );
        if (!this.Networking.IsReferee) return;
        this.box = JSON.stringify({ r: round, s: sealed });
        this.RequestSerialization();
        void this.OpenMine();
      } finally {
        this.sealing = false;
      }
    }
    Clear() {
      if (!this.Networking.IsReferee || this.box === "") return;
      this.box = "";
      this.RequestSerialization();
    }
    /** Opens the local player's entry, if there is one for them. */
    async OpenMine() {
      const ticket = ++this.opening;
      let parsed;
      try {
        parsed = JSON.parse(this.box || "{}");
      } catch {
        return;
      }
      if (!Array.isArray(parsed.s)) return;
      for (const entry of parsed.s) {
        if (typeof entry !== "string" || entry === "" || !this.Secrets.isForMe(entry)) continue;
        try {
          const { value: text, from } = await this.Secrets.openWithSender(entry);
          if (ticket !== this.opening) return;
          const match = this.FindBehaviour("match");
          if (!match || from !== match.m.d) return;
          const secret = decodeSecret(text);
          if (!secret) return;
          this.opens++;
          this.mine = secret;
          this.openedRound = secret.n;
          this.onMine(secret);
        } catch {
        }
        return;
      }
    }
  };
  __publicField(Dealer, "synced", ["box"]);

  // src/ShipMapData.ts
  var f = Math.fround;
  var Rect = class _Rect {
    constructor(x, y, width, height) {
      __publicField(this, "x");
      __publicField(this, "y");
      __publicField(this, "width");
      __publicField(this, "height");
      this.x = f(x);
      this.y = f(y);
      this.width = f(width);
      this.height = f(height);
    }
    get xMin() {
      return this.x;
    }
    get yMin() {
      return this.y;
    }
    get xMax() {
      return f(this.x + this.width);
    }
    get yMax() {
      return f(this.y + this.height);
    }
    get center() {
      return new Vector2(f(this.x + f(this.width / 2)), f(this.y + f(this.height / 2)));
    }
    Contains(p) {
      return p.x >= this.xMin && p.x < this.xMax && p.y >= this.yMin && p.y < this.yMax;
    }
    static fromArray(a) {
      return new _Rect(a[0], a[1], a[2], a[3]);
    }
  };
  var clampF = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var ShipMapGeometry = {
    WalkableEdgeInset: f(0.015),
    Inflate(rect, amount) {
      const a = f(amount);
      return new Rect(f(rect.xMin - a), f(rect.yMin - a), f(rect.width + f(a * 2)), f(rect.height + f(a * 2)));
    },
    Inset(rect, amount) {
      const clamped = clampF(f(amount), 0, f(Math.min(rect.width, rect.height) * f(0.45)));
      return new Rect(f(rect.xMin + clamped), f(rect.yMin + clamped), f(rect.width - f(clamped * 2)), f(rect.height - f(clamped * 2)));
    },
    /** The inset the walkable test uses for a body of `radius`: min(0.015, radius x 0.1). */
    InsetFor(radius) {
      return Math.min(ShipMapGeometry.WalkableEdgeInset, f(Math.max(0, f(radius)) * f(0.1)));
    }
  };
  function v2(a) {
    return new Vector2(f(a[0]), f(a[1]));
  }

  // src/station-map.json
  var station_map_default = {
    schema: 1,
    note: "Generated by tools/convert-map.ts from the upstream runtime map: geometry kept, every name replaced. Units: u, 1 u = 1 m.",
    name: "Hollow Reef",
    playBounds: [-75, -58, 150, 116],
    rooms: [
      { id: "commons", name: "Commons", rect: [-16, -12, 32, 24], label: [0, 0] },
      { id: "decompression", name: "Decompression Bay", rect: [-59, 3.5, 22, 17], label: [-48, 12] },
      { id: "wet-lab", name: "Wet Lab", rect: [-50, 28, 24, 18], label: [-38, 37] },
      { id: "gallery", name: "Viewing Gallery", rect: [-10, 40, 20, 14], label: [0, 47] },
      { id: "sonar", name: "Sonar Room", rect: [26, 28, 18, 14], label: [35, 35] },
      { id: "dive-locker", name: "Dive Locker", rect: [41, 4.5, 18, 15], label: [50, 12] },
      { id: "pump-hall", name: "Pump Hall", rect: [36, -26, 26, 18], label: [49, -17] },
      { id: "ballast", name: "Ballast Control", rect: [24, -54, 26, 22], label: [37, -43] },
      { id: "battery", name: "Battery Bay", rect: [-2, -51.5, 18, 15], label: [7, -44] },
      { id: "kelp-store", name: "Kelp Store", rect: [-34, -40, 30, 22], label: [-19, -29] },
      { id: "scrubbers", name: "Scrubber Room", rect: [-61, -26, 22, 16], label: [-50, -18] }
    ],
    corridors: [
      [15.95, -47.05, 8.1, 1.1],
      [-4.05, -43.05, 4.1, 1.1],
      [13.95, -46.05, 12.1, 4.1],
      [-5.05, -42.05, 5.1, 1.1],
      [15.95, -42.05, 8.1, 1.1],
      [-7.05, -41.05, 7.1, 1.1],
      [-8.05, -40.05, 8.1, 1.1],
      [-9.05, -39.05, 8.1, 1.1],
      [5.95, -38.05, 2.1, 1.1],
      [-9.05, -38.05, 7.1, 1.1],
      [-9.05, -37.05, 5.1, 1.1],
      [-9.05, -36.05, 4.1, 1.1],
      [39.95, -35.05, 4.1, 1.1],
      [39.95, -34.05, 5.1, 2.1],
      [39.95, -32.05, 6.1, 1.1],
      [40.95, -31.05, 6.1, 2.1],
      [-36.05, -29.05, 4.1, 1.1],
      [41.95, -29.05, 6.1, 1.1],
      [-37.05, -28.05, 5.1, 1.1],
      [-39.05, -27.05, 7.1, 1.1],
      [42.95, -28.05, 5.1, 2.1],
      [43.95, -26.05, 4.1, 1.1],
      [-40.05, -26.05, 8.1, 1.1],
      [-41.05, -25.05, 8.1, 1.1],
      [-41.05, -24.05, 7.1, 1.1],
      [-41.05, -23.05, 5.1, 1.1],
      [-41.05, -22.05, 4.1, 1.1],
      [-14.05, -21.05, 4.1, 1.1],
      [4.95, -37.05, 4.1, 18.1],
      [-15.05, -20.05, 6.1, 2.1],
      [3.95, -19.05, 5.1, 1.1],
      [-15.05, -18.05, 7.1, 1.1],
      [-15.05, -17.05, 8.1, 1.1],
      [-40.05, -16.05, 4.1, 1.1],
      [-14.05, -16.05, 8.1, 1.1],
      [-13.05, -15.05, 8.1, 1.1],
      [-40.05, -15.05, 7.1, 1.1],
      [-12.05, -14.05, 8.1, 1.1],
      [-39.05, -14.05, 9.1, 1.1],
      [-11.05, -13.05, 7.1, 1.1],
      [-36.05, -13.05, 8.1, 1.1],
      [-34.05, -12.05, 9.1, 1.1],
      [3.95, -18.05, 4.1, 7.1],
      [4.95, -11.05, 2.1, 1.1],
      [-52.05, -12.05, 4.1, 2.1],
      [-31.05, -11.05, 9.1, 1.1],
      [-10.05, -12.05, 6.1, 2.1],
      [-28.05, -10.05, 8.1, 1.1],
      [-9.05, -10.05, 4.1, 1.1],
      [-25.05, -9.05, 7.1, 1.1],
      [47.95, -10.05, 4.1, 2.1],
      [-23.05, -8.05, 7.1, 1.1],
      [-21.05, -7.05, 6.1, 1.1],
      [-19.05, -6.05, 4.1, 1.1],
      [-52.05, -10.05, 5.1, 13.1],
      [46.95, -8.05, 6.1, 12.1],
      [-21.05, 3.95, 7.1, 1.1],
      [-51.05, 2.95, 4.1, 2.1],
      [13.95, 3.95, 7.1, 1.1],
      [-26.05, 4.95, 12.1, 1.1],
      [13.95, 4.95, 12.1, 1.1],
      [47.95, 3.95, 4.1, 2.1],
      [13.95, 5.95, 17.1, 1.1],
      [-30.05, 5.95, 16.1, 1.1],
      [13.95, 6.95, 27.1, 1.1],
      [-37.05, 6.95, 23.1, 1.1],
      [15.95, 7.95, 27.1, 1.1],
      [-39.05, 7.95, 23.1, 1.1],
      [20.95, 8.95, 22.1, 1.1],
      [-39.05, 8.95, 19.1, 1.1],
      [25.95, 9.95, 17.1, 1.1],
      [-39.05, 9.95, 14.1, 1.1],
      [30.95, 10.95, 12.1, 1.1],
      [-39.05, 10.95, 9.1, 1.1],
      [44.95, 17.95, 4.1, 1.1],
      [-48.05, 17.95, 4.1, 2.1],
      [43.95, 18.95, 5.1, 2.1],
      [42.95, 20.95, 6.1, 1.1],
      [41.95, 21.95, 6.1, 2.1],
      [-48.05, 19.95, 5.1, 4.1],
      [40.95, 23.95, 6.1, 2.1],
      [39.95, 25.95, 6.1, 1.1],
      [-47.05, 23.95, 5.1, 4.1],
      [39.95, 26.95, 5.1, 2.1],
      [-46.05, 27.95, 4.1, 2.1],
      [39.95, 28.95, 4.1, 1.1],
      [-13.05, 29.95, 39.1, 1.1],
      [-25.05, 30.95, 52.1, 1.1],
      [-26.05, 31.95, 53.1, 1.1],
      [-26.05, 32.95, 14.1, 1.1],
      [21.95, 37.95, 5.1, 1.1],
      [19.95, 38.95, 7.1, 1.1],
      [-27.05, 39.95, 6.1, 1.1],
      [16.95, 39.95, 10.1, 1.1],
      [14.95, 40.95, 12.1, 1.1],
      [-27.05, 40.95, 10.1, 1.1],
      [11.95, 41.95, 13.1, 1.1],
      [-27.05, 41.95, 14.1, 1.1],
      [9.95, 42.95, 13.1, 1.1],
      [-27.05, 42.95, 17.1, 1.1],
      [7.95, 43.95, 12.1, 1.1],
      [-25.05, 43.95, 17.1, 1.1],
      [7.95, 44.95, 10.1, 1.1],
      [-22.05, 44.95, 14.1, 1.1],
      [7.95, 45.95, 7.1, 1.1],
      [-18.05, 45.95, 10.1, 1.1],
      [7.95, 46.95, 5.1, 1.1],
      [-14.05, 46.95, 6.1, 1.1]
    ],
    doorways: [],
    cuts: [
      [24, -54, 4, 1],
      [46, -54, 4, 1],
      [24, -53, 3, 1],
      [47, -53, 3, 1],
      [48, -52, 2, 1],
      [24, -52, 2, 1],
      [49, -51, 1, 1],
      [24, -51, 1, 1],
      [-34, -40, 20, 1],
      [-34, -39, 7, 1],
      [24, -36, 1, 1],
      [49, -36, 1, 1],
      [48, -35, 2, 1],
      [24, -35, 2, 1],
      [47, -34, 3, 1],
      [24, -34, 3, 1],
      [46, -33, 4, 1],
      [24, -33, 4, 1],
      [-42, -26, 2, 1],
      [-61, -26, 3, 1],
      [-61, -25, 2, 1],
      [-61, -24, 1, 1],
      [58, -26, 4, 3],
      [36, -26, 5, 4],
      [-34, -22, 1, 1],
      [-34, -21, 2, 1],
      [-34, -20, 3, 1],
      [-34, -19, 4, 1],
      [-40, -13, 1, 1],
      [-61, -13, 1, 1],
      [11, -12, 5, 1],
      [-16, -12, 5, 1],
      [-41, -12, 2, 1],
      [-61, -12, 2, 1],
      [-42, -11, 3, 1],
      [-61, -11, 3, 1],
      [-16, -11, 4, 1],
      [12, -11, 4, 1],
      [13, -10, 3, 1],
      [-16, -10, 3, 1],
      [57, -12, 5, 4],
      [14, -9, 2, 1],
      [-16, -9, 2, 1],
      [15, -8, 1, 1],
      [-16, -8, 1, 1],
      [-59, 3, 2, 5],
      [14, 8, 2, 1],
      [-16, 8, 2, 1],
      [13, 9, 3, 1],
      [-16, 9, 3, 1],
      [54, 4, 5, 7],
      [12, 10, 4, 1],
      [-16, 10, 4, 1],
      [11, 11, 5, 1],
      [-16, 11, 5, 1],
      [-59, 8, 1, 8],
      [-38, 12, 1, 4],
      [-39, 16, 2, 4],
      [26, 28, 2, 3],
      [26, 33, 1, 5],
      [43, 32, 1, 7],
      [42, 39, 2, 3],
      [9, 42, 1, 2],
      [-10, 42, 1, 2],
      [-50, 38, 8, 8],
      [8, 48, 2, 2],
      [-10, 48, 2, 2],
      [-10, 50, 3, 4],
      [7, 50, 3, 4]
    ],
    props: [
      { name: "Pressure chamber", rect: [-53.5, 10.699999809265137, 7.199999809265137, 2.200000047683716] },
      { name: "Gauge cabinet", rect: [-58, 15.100000381469727, 2.799999952316284, 4.199999809265137] },
      { name: "Bunk pod", rect: [-43.79999923706055, 5.400000095367432, 3.799999952316284, 2.4000000953674316] },
      { name: "Specimen tank", rect: [-45.79999923706055, 33.79999923706055, 5.199999809265137, 8.399999618530273] },
      { name: "Dissection bench", rect: [-35, 40.70000076293945, 6.199999809265137, 2] },
      { name: "Window console", rect: [-5.5, 49.79999923706055, 11, 1.600000023841858] },
      { name: "Sonar desk", rect: [32.20000076293945, 36.099998474121094, 5.599999904632568, 2] },
      { name: "Server rack", rect: [40.599998474121094, 30.600000381469727, 2.299999952316284, 5] },
      { name: "Locker wall", rect: [50, 16.200000762939453, 8.399999618530273, 1.7999999523162842] },
      { name: "Lamp bench", rect: [43.70000076293945, 9, 3.200000047683716, 4.599999904632568] },
      { name: "Main pump", rect: [45, -20.700000762939453, 9.5, 7.199999809265137] },
      { name: "Impeller casing", rect: [56.5, -20.899999618530273, 4.800000190734863, 6.199999809265137] },
      { name: "Tool wall", rect: [38.29999923706055, -12.300000190734863, 4.599999904632568, 3.200000047683716] },
      { name: "Ballast column", rect: [36.400001525878906, -46, 6.800000190734863, 10.199999809265137] },
      { name: "Trim tanks", rect: [27.600000381469727, -47.79999923706055, 3.200000047683716, 7.199999809265137] },
      { name: "Flood barrier", rect: [44.20000076293945, -38.5, 4.400000095367432, 2.4000000953674316] },
      { name: "West cell racks", rect: [-0.8999999761581421, -47.5, 2.200000047683716, 7.800000190734863] },
      { name: "East cell racks", rect: [13.699999809265137, -46.5, 2, 7.199999809265137] },
      { name: "Transformer", rect: [6.099999904632568, -48.599998474121094, 4.199999809265137, 2.799999952316284] },
      { name: "Bin stack A", rect: [-29.200000762939453, -34.099998474121094, 6.300000190734863, 4.800000190734863] },
      { name: "Bin stack B", rect: [-17, -26.799999237060547, 7.199999809265137, 4] },
      { name: "Bin stack C", rect: [-8.699999809265137, -37.29999923706055, 4.199999809265137, 4.800000190734863] },
      { name: "Low shelf", rect: [-25.799999237060547, -21.200000762939453, 5.199999809265137, 2] },
      { name: "Scrubber canisters", rect: [-56.400001525878906, -20.5, 3.200000047683716, 7.199999809265137] },
      { name: "Filter bank", rect: [-47.599998474121094, -23.200000762939453, 4.800000190734863, 2.5999999046325684] },
      { name: "Valve bank", rect: [-59.5, -13.100000381469727, 3.799999952316284, 2] }
    ],
    waypoints: [
      [0, 0],
      [-49.5, 13.5],
      [-38, 37],
      [0, 47],
      [35, 35],
      [50, 12],
      [44.5, -21.5],
      [35.5, -44.5],
      [7, -44],
      [-19, -29],
      [-50, -18],
      [-46, 20],
      [-44, 28],
      [-25, 42],
      [-10, 46],
      [10, 46],
      [25, 40],
      [42, 28],
      [47, 20],
      [50, 4],
      [50, -8],
      [46, -27],
      [42, -33],
      [24, -44],
      [16.75, -44.75],
      [-2, -41],
      [-8.5, -38.5],
      [-34, -27],
      [-39, -23],
      [-50, -10],
      [-49, 3],
      [-16, 6],
      [-30, 9],
      [-37, 10],
      [16, 6],
      [31, 9],
      [41, 10],
      [-7, -12],
      [-12, -18],
      [6, -12],
      [7, -25],
      [7, -36],
      [-25, 33],
      [0, 31],
      [26, 32],
      [-39, -15],
      [-25, -10],
      [-16, -6]
    ],
    spawns: [
      [-8, 3],
      [-4, 5],
      [0, 6],
      [4, 5],
      [8, 3],
      [-8, -3],
      [-4, -5],
      [0, -6],
      [4, -5],
      [8, -3],
      [-11, 0],
      [11, 0],
      [-6, 0],
      [6, 0],
      [0, 0]
    ],
    jobs: [
      { id: 0, name: "Sign the shift ledger", room: "commons", kind: "hold", at: [-10, 7] },
      { id: 1, name: "Bleed the chamber gauge", room: "decompression", kind: "hold", at: [-53.5, 7] },
      { id: 2, name: "Set the recompression valve", room: "decompression", kind: "timing", at: [-42, 17] },
      { id: 3, name: "Trim tank pressure", room: "wet-lab", kind: "timing", at: [-46, 32] },
      { id: 4, name: "Log the specimen tray", room: "wet-lab", kind: "hold", at: [-31, 40] },
      { id: 5, name: "Focus the floodlights", room: "gallery", kind: "timing", at: [0, 43] },
      { id: 6, name: "Send the surface packet", room: "sonar", kind: "hold", at: [29, 36] },
      { id: 7, name: "Trim hydrophone gain", room: "sonar", kind: "timing", at: [39.5, 29.5] },
      { id: 8, name: "Charge the dive lamps", room: "dive-locker", kind: "hold", at: [43.25, 8.25] },
      { id: 9, name: "Tag the wetsuit racks", room: "dive-locker", kind: "tap", at: [53.25, 15.25] },
      { id: 10, name: "Balance the main pump", room: "pump-hall", kind: "timing", at: [39, -13] },
      { id: 11, name: "Prime the bilge line", room: "pump-hall", kind: "tap", at: [50, -10] },
      { id: 12, name: "Check the impeller housing", room: "pump-hall", kind: "hold", at: [59, -22] },
      { id: 13, name: "Level the trim tanks", room: "ballast", kind: "timing", at: [28, -36] },
      { id: 14, name: "Seat the flood dampers", room: "ballast", kind: "tap", at: [45, -50] },
      { id: 15, name: "Re-route feeder B", room: "battery", kind: "tap", at: [2, -38] },
      { id: 16, name: "Cycle the bus ties", room: "battery", kind: "tap", at: [8, -39] },
      { id: 17, name: "Ping the cable run", room: "battery", kind: "tap", at: [13, -45] },
      { id: 18, name: "Weigh the harvest bins", room: "kelp-store", kind: "hold", at: [-31, -22] },
      { id: 19, name: "Strap loose crates", room: "kelp-store", kind: "tap", at: [-8.75, -31.25] },
      { id: 20, name: "Purge the condensate trap", room: "scrubbers", kind: "tap", at: [-57.75, -13.75] },
      { id: 21, name: "Read the reserve bottles", room: "scrubbers", kind: "hold", at: [-43, -19] }
    ],
    panels: [
      { fault: "breach", name: "Ballast breach", countdown: true, room: "ballast", at: [30, -36] },
      { fault: "blackout", name: "Blackout", countdown: false, room: "battery", at: [8, -38] },
      { fault: "jam", name: "Sonar jam", countdown: false, room: "sonar", at: [35, 33] },
      { fault: "scrubber", name: "Scrubber fault", countdown: true, room: "scrubbers", at: [-47, -13] }
    ],
    hatches: [
      { group: "north", room: "decompression", at: [-55.5, 7] },
      { group: "north", room: "wet-lab", at: [-32, 40] },
      { group: "north", room: "sonar", at: [30, 31] },
      { group: "east", room: "dive-locker", at: [55, 15.5] },
      { group: "east", room: "pump-hall", at: [40, -21] },
      { group: "east", room: "ballast", at: [45, -50] },
      { group: "south", room: "scrubbers", at: [-57, -22] },
      { group: "south", room: "kelp-store", at: [-27, -22] },
      { group: "south", room: "battery", at: [12, -40.5] }
    ],
    muster: [0, 0]
  };

  // src/ShipMap.ts
  function Dist(a, b) {
    const dx = f(a.x - b.x);
    const dy = f(a.y - b.y);
    return f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
  }
  function LerpF(a, b, t) {
    const k = t < 0 ? 0 : t > 1 ? 1 : f(t);
    return new Vector2(f(a.x + f(f(b.x - a.x) * k)), f(a.y + f(f(b.y - a.y) * k)));
  }
  var CELL = 4;
  var MARGIN = 0.75;
  var ShipMap = class _ShipMap {
    constructor(file) {
      __publicField(this, "MapName");
      __publicField(this, "PlayBounds");
      __publicField(this, "Rooms");
      __publicField(this, "RoomBounds");
      __publicField(this, "Corridors");
      __publicField(this, "Doorways");
      __publicField(this, "Obstacles");
      __publicField(this, "ObstacleNames");
      __publicField(this, "NavigationWaypoints");
      __publicField(this, "SpawnPoints");
      __publicField(this, "JobStations");
      __publicField(this, "FaultPanels");
      __publicField(this, "Hatches");
      __publicField(this, "MeetingPoint");
      __publicField(this, "walkGrid", /* @__PURE__ */ new Map());
      __publicField(this, "obstacleGrid", /* @__PURE__ */ new Map());
      __publicField(this, "grids", /* @__PURE__ */ new Map());
      this.MapName = file.name;
      this.PlayBounds = Rect.fromArray(file.playBounds);
      if (this.PlayBounds.width <= 0 || this.PlayBounds.height <= 0) this.PlayBounds = new Rect(-8, -5, 16, 10);
      this.Rooms = file.rooms.map((r) => ({ Id: r.id, Name: r.name, Bounds: Rect.fromArray(r.rect), LabelPosition: v2(r.label) }));
      this.RoomBounds = this.Rooms.map((r) => r.Bounds);
      this.Corridors = file.corridors.map((c) => Rect.fromArray(c));
      this.Doorways = file.doorways.map((d) => Rect.fromArray(d));
      this.Obstacles = [...file.cuts.map((c) => Rect.fromArray(c)), ...file.props.map((p) => Rect.fromArray(p.rect))];
      this.ObstacleNames = [...file.cuts.map(() => ""), ...file.props.map((p) => p.name)];
      this.NavigationWaypoints = file.waypoints.map(v2);
      this.SpawnPoints = file.spawns.map(v2);
      this.JobStations = file.jobs.map((j, i) => ({ Id: i, Name: j.name, Room: j.room, Kind: JOB_KIND_IDS[j.kind] ?? i % 3, Position: v2(j.at) }));
      this.FaultPanels = file.panels.map((p) => ({ Type: FAULT_IDS[p.fault] ?? 1, Name: p.name, Room: p.room, Position: v2(p.at), HasCountdown: p.countdown }));
      this.Hatches = file.hatches.map((h, i) => ({ Index: i, Name: `${this.roomName(h.room)} hatch`, GroupId: h.group, Position: v2(h.at) }));
      this.MeetingPoint = v2(file.muster);
      const walk = [...this.RoomBounds, ...this.Corridors, ...this.Doorways];
      walk.forEach((rect, order) => this.index(this.walkGrid, rect, order));
      this.Obstacles.forEach((rect, order) => this.index(this.obstacleGrid, rect, order));
    }
    roomName(id) {
      return this.Rooms.find((r) => r.Id === id)?.Name ?? id;
    }
    static key(cx, cy) {
      return (cx + 1e3) * 4096 + (cy + 1e3);
    }
    index(grid, rect, order) {
      const x0 = Math.floor((rect.xMin - MARGIN) / CELL);
      const x1 = Math.floor((rect.xMax + MARGIN) / CELL);
      const y0 = Math.floor((rect.yMin - MARGIN) / CELL);
      const y1 = Math.floor((rect.yMax + MARGIN) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = _ShipMap.key(cx, cy);
          let list = grid.get(k);
          if (!list) grid.set(k, list = []);
          list.push({ rect, order });
        }
      }
    }
    near(grid, p) {
      return grid.get(_ShipMap.key(Math.floor(p.x / CELL), Math.floor(p.y / CELL))) ?? [];
    }
    /** ShipMapGeometry.IsBlocked over this map's rectangles. */
    IsBlocked(position, radius) {
      const inset = ShipMapGeometry.InsetFor(radius);
      let inside = false;
      for (const w of this.near(this.walkGrid, position)) {
        if (ShipMapGeometry.Inset(w.rect, inset).Contains(position)) {
          inside = true;
          break;
        }
      }
      if (!inside) return true;
      for (const o of this.near(this.obstacleGrid, position)) {
        if (ShipMapGeometry.Inflate(o.rect, radius).Contains(position)) return true;
      }
      return false;
    }
    /** The same test without the grid, exactly as upstream loops (for the tests that prove the grid changes nothing). */
    IsBlockedSlow(position, radius) {
      const inset = ShipMapGeometry.InsetFor(radius);
      const any = (rects) => rects.some((r) => ShipMapGeometry.Inset(r, inset).Contains(position));
      if (!any(this.RoomBounds) && !any(this.Corridors) && !any(this.Doorways)) return true;
      return this.Obstacles.some((o) => ShipMapGeometry.Inflate(o, radius).Contains(position));
    }
    ResolveMove(current, delta, radius) {
      const currentOpen = this.ClampToWalkable(current, radius);
      let afterX = this.ClampToBounds(new Vector2(f(currentOpen.x + f(delta.x)), currentOpen.y), radius);
      if (this.IsBlocked(afterX, radius)) afterX = currentOpen;
      let afterY = this.ClampToBounds(new Vector2(afterX.x, f(afterX.y + f(delta.y))), radius);
      if (this.IsBlocked(afterY, radius)) afterY = afterX;
      return afterY;
    }
    /**
     * A move as the bots and test walkers make it: straight along `delta` when that line is clear, else ResolveMove's
     * one axis at a time. Not upstream: axis-separated moves alone stick in some corridor mouths (PORT.md D15).
     */
    MoveToward(current, delta, radius) {
      const target = new Vector2(f(current.x + f(delta.x)), f(current.y + f(delta.y)));
      if (!this.IsBlocked(current, radius) && this.ClearFine(current, target, radius)) return this.ClampToBounds(target, radius);
      return this.ResolveMove(current, delta, radius);
    }
    ClampToWalkable(position, radius) {
      const clamped = this.ClampToBounds(position, radius);
      return this.IsBlocked(clamped, radius) ? this.FindNearestOpenPosition(clamped, radius) : clamped;
    }
    GetRandomWalkablePosition(random) {
      const rooms = this.Rooms;
      for (let attempts = 0; attempts < 32 && rooms.length > 0; attempts++) {
        const area = rooms[random.RangeInt(0, rooms.length)].Bounds;
        const candidate = new Vector2(
          f(random.Range(f(area.xMin + f(0.4)), f(area.xMax - f(0.4)))),
          f(random.Range(f(area.yMin + f(0.4)), f(area.yMax - f(0.4))))
        );
        if (!this.IsBlocked(candidate, 0.28)) return candidate;
      }
      return this.MeetingPoint.clone();
    }
    GetSpawnPoint(playerIndex, fallback) {
      const spawnPoints = this.SpawnPoints;
      if (spawnPoints.length === 0) return this.ClampToWalkable(fallback, 0.32);
      return this.ClampToWalkable(spawnPoints[Math.abs(playerIndex) % spawnPoints.length], 0.32);
    }
    GetNavigationTarget(current, destination) {
      const currentOpen = this.ClampToWalkable(current, 0.22);
      const destinationOpen = this.ClampToWalkable(destination, 0.22);
      if (this.HasClearWalkableSegment(currentOpen, destinationOpen, 0.22)) return destinationOpen;
      let bestWaypoint = destinationOpen;
      let bestScore = Number.MAX_VALUE;
      let found = false;
      for (const waypoint of this.NavigationWaypoints) {
        if (this.IsBlocked(waypoint, 0.22) || !this.HasClearWalkableSegment(currentOpen, waypoint, 0.22)) continue;
        const canSeeDestination = this.HasClearWalkableSegment(waypoint, destinationOpen, 0.22);
        const score = f(f(Dist(currentOpen, waypoint) + Dist(waypoint, destinationOpen)) + (canSeeDestination ? 0 : f(2.5)));
        if (score < bestScore) {
          bestWaypoint = waypoint;
          bestScore = score;
          found = true;
        }
      }
      return found ? bestWaypoint : destinationOpen;
    }
    /**
     * The next point to steer for on the way to `destination`: the destination itself when the line is clear, else the
     * farthest visible point of a shortest route over a 1 u grid of open floor. Not upstream: the map's own waypoints
     * do not form a connected graph (props cut four rooms off), and GetNavigationTarget's greedy pick strands a bot on a
     * waypoint for good (seen in the tests). The bots and the test walkers use this instead (PORT.md D15). Every test
     * is made at the walker's own `radius`, so a route it is given is one it can walk.
     */
    NextStep(current, destination, radius = 0.5) {
      const from = this.ClampToWalkable(current, radius);
      const to = this.ClampToWalkable(destination, radius);
      if (this.ClearFine(from, to, radius)) return to;
      const g = this.Grid(radius);
      const start = this.NearestNode(g, from, radius);
      const goal = this.NearestNode(g, to, radius);
      if (start < 0 || goal < 0) return this.GetNavigationTarget(current, destination);
      const n = g.nodes.length;
      const cost = new Float64Array(n).fill(Infinity);
      const prev = new Int32Array(n).fill(-1);
      const closed = new Uint8Array(n);
      const heap = [];
      const push = (node, f2) => {
        heap.push([f2, node]);
        let i = heap.length - 1;
        while (i > 0) {
          const parent = i - 1 >> 1;
          if (heap[parent][0] <= heap[i][0]) break;
          [heap[parent], heap[i]] = [heap[i], heap[parent]];
          i = parent;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let i = 0;
          for (; ; ) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top[1];
      };
      const h = (i) => Vector2.Distance(g.nodes[i], g.nodes[goal]);
      cost[start] = 0;
      push(start, h(start));
      while (heap.length) {
        const u = pop();
        if (closed[u]) continue;
        closed[u] = 1;
        if (u === goal) break;
        for (const v of g.links[u]) {
          const c = cost[u] + Vector2.Distance(g.nodes[u], g.nodes[v]);
          if (c < cost[v]) {
            cost[v] = c;
            prev[v] = u;
            push(v, c + h(v));
          }
        }
      }
      if (!closed[goal]) return this.GetNavigationTarget(current, destination);
      const path = [];
      for (let i = goal; i >= 0; i = prev[i]) path.push(i);
      path.reverse();
      let pick = path[0];
      for (let k = 1; k < Math.min(path.length, 16); k++) {
        if (this.ClearFine(from, g.nodes[path[k]], radius)) pick = path[k];
        else break;
      }
      return g.nodes[pick].clone();
    }
    /** A straight line a body of `radius` can walk: sampled every 0.05. */
    ClearFine(a, b, radius) {
      const d = Vector2.Distance(a, b);
      const steps = Math.max(1, Math.ceil(d / 0.05));
      for (let i = 1; i <= steps; i++) if (this.IsBlocked(Vector2.Lerp(a, b, i / steps), radius)) return false;
      return true;
    }
    /** The open grid point nearest to `p` (a body stuck on a corner is put there). */
    NearestOpen(p, radius) {
      const g = this.Grid(radius);
      const n = this.NearestNode(g, p, radius);
      return n >= 0 ? g.nodes[n].clone() : this.ClampToWalkable(p, radius);
    }
    Grid(radius) {
      const cached = this.grids.get(radius);
      if (cached) return cached;
      const b = this.PlayBounds;
      const x0 = Math.floor(b.xMin);
      const y0 = Math.floor(b.yMin);
      const nodes = [];
      const index = /* @__PURE__ */ new Map();
      for (let x = x0; x < b.xMax; x++) {
        for (let y = y0; y < b.yMax; y++) {
          const p = new Vector2(x + 0.5, y + 0.5);
          if (this.IsBlocked(p, radius)) continue;
          index.set((x - x0) * 4096 + (y - y0), nodes.length);
          nodes.push(p);
        }
      }
      const links = nodes.map((p) => {
        const out = [];
        const gx = Math.floor(p.x) - x0;
        const gy = Math.floor(p.y) - y0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const j = index.get((gx + dx) * 4096 + (gy + dy));
            if (j !== void 0 && this.HasClearWalkableSegment(p, nodes[j], radius)) out.push(j);
          }
        }
        return out;
      });
      const grid = { nodes, index, links, x0, y0 };
      this.grids.set(radius, grid);
      return grid;
    }
    NearestNode(g, p, radius) {
      let best = -1;
      let bestD = Infinity;
      const gx = Math.floor(p.x) - g.x0;
      const gy = Math.floor(p.y) - g.y0;
      for (let r = 0; r <= 3 && best < 0; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            const j = g.index.get((gx + dx) * 4096 + (gy + dy));
            if (j === void 0) continue;
            const d = Vector2.Distance(p, g.nodes[j]);
            if (d < bestD && this.ClearFine(p, g.nodes[j], radius)) {
              best = j;
              bestD = d;
            }
          }
        }
      }
      return best;
    }
    /** The room's name, "Corridor", "Doorway" or "Station" (upstream: the room, "Hallway", "Doorway", "Ship"). */
    GetRoomName(position) {
      for (const room of this.Rooms) if (room.Bounds.Contains(position)) return room.Name;
      for (const c of this.Corridors) if (c.Contains(position)) return "Corridor";
      for (const d of this.Doorways) if (d.Contains(position)) return "Doorway";
      return "Station";
    }
    /** The room id at a point, or "" outside every room. */
    GetRoomId(position) {
      for (const room of this.Rooms) if (room.Bounds.Contains(position)) return room.Id;
      return "";
    }
    HasClearWalkableSegment(start, end, radius) {
      const distance = Dist(start, end);
      const steps = Math.max(1, Math.ceil(f(distance / f(0.18))));
      for (let i = 1; i <= steps; i++) {
        const sample = LerpF(start, end, f(i / steps));
        if (this.IsBlocked(sample, radius)) return false;
      }
      return true;
    }
    FindNearestOpenPosition(position, radius) {
      const step = f(0.2);
      for (let ring = 1; ring <= 48; ring++) {
        for (let x = -ring; x <= ring; x++) {
          for (let y = -ring; y <= ring; y++) {
            if (Math.abs(x) !== ring && Math.abs(y) !== ring) continue;
            const candidate = this.ClampToBounds(new Vector2(f(position.x + f(x * step)), f(position.y + f(y * step))), radius);
            if (!this.IsBlocked(candidate, radius)) return candidate;
          }
        }
      }
      return this.MeetingPoint.clone();
    }
    ClampToBounds(position, radius) {
      const r = f(radius);
      const b = this.PlayBounds;
      const cx = Math.min(Math.max(position.x, f(b.xMin + r)), f(b.xMax - r));
      const cy = Math.min(Math.max(position.y, f(b.yMin + r)), f(b.yMax - r));
      return new Vector2(cx, cy);
    }
    // ---- stations (BasicSpawner's lookups, which only read the map) ----------------------------------------------
    /** TryGetSabotageStation */
    PanelFor(type) {
      return this.FaultPanels.find((p) => p.Type === type) ?? null;
    }
    /** TryGetNearestSabotageStation */
    NearestPanel(position) {
      let best = null;
      let distance = Number.MAX_VALUE;
      for (const p of this.FaultPanels) {
        const d = Dist(position, p.Position);
        if (d < distance) {
          best = p;
          distance = d;
        }
      }
      return best ? { panel: best, distance } : null;
    }
    /** TryGetNearestVent */
    NearestHatch(position) {
      let best = null;
      let distance = Number.MAX_VALUE;
      for (const h of this.Hatches) {
        const d = Dist(position, h.Position);
        if (d < distance) {
          best = h;
          distance = d;
        }
      }
      return best ? { hatch: best, distance } : null;
    }
    /** GetNextVent: the next hatch of the same group in data order, wrapping round. */
    GetNextHatch(current) {
      if (this.Hatches.length === 0) return current;
      const group = this.Hatches.filter((h) => h.GroupId === current.GroupId);
      if (group.length <= 1) return current;
      let currentIndex = 0;
      for (let i = 0; i < group.length; i++) {
        if (Dist(group[i].Position, current.Position) < f(0.01)) {
          currentIndex = i;
          break;
        }
      }
      return group[(currentIndex + 1) % group.length];
    }
    /** GetTaskStationIdAt */
    JobIdAt(position) {
      for (const s of this.JobStations) if (Dist(s.Position, position) < f(0.01)) return s.Id;
      return -1;
    }
  };
  var STATION = new ShipMap(station_map_default);

  // src/Bots.ts
  var STEER_SECONDS = 0.25;
  var COLLISION_RADIUS = 0.3;
  var BotBrains = class {
    constructor(rules) {
      __publicField(this, "r");
      __publicField(this, "targets", /* @__PURE__ */ new Map());
      __publicField(this, "taskCooldowns", /* @__PURE__ */ new Map());
      __publicField(this, "actionCooldowns", /* @__PURE__ */ new Map());
      __publicField(this, "steering", /* @__PURE__ */ new Map());
      __publicField(this, "stuck", /* @__PURE__ */ new Map());
      __publicField(this, "nextBotVoteAt", 0);
      this.r = rules;
    }
    Clear() {
      this.targets.clear();
      this.taskCooldowns.clear();
      this.actionCooldowns.clear();
      this.steering.clear();
      this.stuck.clear();
    }
    /** The bot lines of StartRound (Spawner:1289-1294), in the same order of random draws. */
    Seed(bot) {
      const r = this.r;
      this.targets.set(bot.PlayerNumber, this.GetNextBotTarget(bot));
      this.taskCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(1, r.s.botTaskPause));
      this.actionCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(0.5, 2));
    }
    MeetingStarted() {
      this.nextBotVoteAt = this.r.time + this.r.s.botVoteDelay;
    }
    bots() {
      return this.r.Spawned().filter((p) => p.isBot);
    }
    /** UpdateBots */
    UpdateBots(dt) {
      const r = this.r;
      for (const bot of this.bots()) {
        if (!bot.isAlive || bot.state !== MatchState.Playing) continue;
        if (bot.role === Role.Saboteur) {
          this.UpdateBotSaboteur(bot, dt);
          continue;
        }
        if (bot.role === Role.Technician && r.activeFault !== Fault.None) {
          const panel = r.map.PanelFor(r.activeFault);
          if (panel) {
            if (Dist(bot.position, panel.Position) <= r.s.faultRange) {
              const next = this.taskCooldowns.get(bot.PlayerNumber);
              if (next === void 0 || r.time >= next) {
                const previous = r.activeFault;
                r.UpdateHeldInteract(bot, dt, true);
                if (previous !== r.activeFault) this.taskCooldowns.set(bot.PlayerNumber, r.time + r.s.botTaskPause);
              } else {
                r.CancelHeldInteract(bot);
              }
              continue;
            }
            r.CancelHeldInteract(bot);
            this.MoveBotToward(bot, panel.Position, dt);
            continue;
          }
        }
        if (bot.role === Role.Technician && !bot.AllTasksComplete) {
          const near = r.TryGetNearestIncompleteTask(bot);
          if (near) {
            if (near.distance <= r.s.jobRange) {
              const next = this.taskCooldowns.get(bot.PlayerNumber);
              if (next === void 0 || r.time >= next) {
                const before = bot.CompletedTaskCount;
                r.UpdateHeldInteract(bot, dt, true);
                if (bot.CompletedTaskCount > before) {
                  this.taskCooldowns.set(bot.PlayerNumber, r.time + r.s.botTaskPause);
                  this.targets.set(bot.PlayerNumber, this.GetNextBotTarget(bot));
                }
              } else {
                r.CancelHeldInteract(bot);
              }
              continue;
            }
            let target2 = this.targets.get(bot.PlayerNumber);
            if (!target2 || bot.HasCompletedTask(r.map.JobIdAt(target2)) || Dist(bot.position, target2) < f(0.2)) {
              target2 = near.station.Position;
              this.targets.set(bot.PlayerNumber, target2);
            }
            r.CancelHeldInteract(bot);
            this.MoveBotToward(bot, target2, dt);
            continue;
          }
        }
        r.CancelHeldInteract(bot);
        let target = this.targets.get(bot.PlayerNumber);
        if (!target || Dist(bot.position, target) < f(0.2)) {
          target = this.GetNextBotTarget(bot);
          this.targets.set(bot.PlayerNumber, target);
        }
        this.MoveBotToward(bot, target, dt);
      }
    }
    /** The upstream bot routine for the hidden role (Spawner:1810-1868). */
    UpdateBotSaboteur(bot, dt) {
      const r = this.r;
      r.CancelHeldInteract(bot);
      if (bot.IsKillReady(r.time) && r.FindKillTarget(bot) !== null && r.TryUseKill(bot)) {
        this.actionCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(0.8, 1.8));
        return;
      }
      const nextThink = this.actionCooldowns.get(bot.PlayerNumber);
      if (nextThink === void 0 || r.time >= nextThink) {
        this.actionCooldowns.set(bot.PlayerNumber, r.time + Math.max(0.1, r.s.botThinkSeconds));
        if (r.activeFault === Fault.None && r.time >= r.nextFaultAllowedAt && r.random.value <= r.s.botFaultChance) {
          this.targets.set(bot.PlayerNumber, this.GetRandomSabotageTarget());
        }
      }
      if (r.activeFault === Fault.None && r.time >= r.nextFaultAllowedAt) {
        const near = r.map.NearestPanel(bot.position);
        if (near && near.distance <= r.s.faultRange && r.random.value <= 0.55) {
          r.TryStartSabotage(bot);
          this.actionCooldowns.set(bot.PlayerNumber, r.time + r.random.Range(3, 6));
          return;
        }
      }
      if (bot.KillCooldownRemaining(r.time) > 2) {
        const hatch = r.map.NearestHatch(bot.position);
        if (hatch && hatch.distance <= r.s.hatchRange && r.random.value <= 0.01) {
          const to = r.TryUseHatch(bot, bot.position, hatch.hatch.Index);
          if (to) {
            bot.position = to;
            this.steering.delete(bot.PlayerNumber);
          }
          return;
        }
      }
      const crew = this.TryGetClosestAliveTechnician(bot);
      if (crew) {
        this.MoveBotToward(bot, crew.position, dt);
        return;
      }
      let target = this.targets.get(bot.PlayerNumber);
      if (!target || Dist(bot.position, target) < f(0.2)) {
        target = this.GetRandomBotTarget();
        this.targets.set(bot.PlayerNumber, target);
      }
      this.MoveBotToward(bot, target, dt);
    }
    /** UpdateBotVoting: one bot votes every 0.45 s, the first 1.5 s into the muster. */
    UpdateBotVoting() {
      const r = this.r;
      if (r.time < this.nextBotVoteAt) return;
      this.nextBotVoteAt = r.time + r.s.botVoteInterval;
      for (const bot of this.bots()) {
        if (!bot.CanVote || r.votes.has(bot.PlayerNumber)) continue;
        r.TrySubmitVote(bot, this.PickBotVoteTarget(bot));
        break;
      }
    }
    /** MoveBotToward, with the steering point kept for STEER_SECONDS. */
    MoveBotToward(bot, target, dt) {
      const r = this.r;
      if (!bot.CanMove) return;
      const before = bot.position;
      let steer = this.steering.get(bot.PlayerNumber);
      if (!steer || r.time >= steer.until || !steer.goal.equals(target) || Dist(bot.position, steer.point) < f(0.2)) {
        steer = { goal: target.clone(), point: r.map.NextStep(bot.position, target, COLLISION_RADIUS), until: r.time + STEER_SECONDS };
        this.steering.set(bot.PlayerNumber, steer);
      }
      let direction = steer.point.sub(bot.position);
      if (direction.sqrMagnitude > 1) direction = direction.normalized;
      bot.position = r.map.MoveToward(bot.position, direction.scale(r.s.botMoveSpeed * dt), COLLISION_RADIUS);
      if (direction.sqrMagnitude <= 0.01 || Dist(before, bot.position) > 0.01) {
        this.stuck.set(bot.PlayerNumber, 0);
        return;
      }
      const stuck = (this.stuck.get(bot.PlayerNumber) ?? 0) + 1;
      this.stuck.set(bot.PlayerNumber, stuck);
      if (stuck >= 10) {
        this.stuck.set(bot.PlayerNumber, 0);
        bot.position = r.map.NearestOpen(bot.position, COLLISION_RADIUS);
        this.steering.delete(bot.PlayerNumber);
        return;
      }
      let sidestep = new Vector2(-direction.y, direction.x);
      if (r.random.value < 0.5) sidestep = sidestep.scale(-1);
      bot.position = r.map.ResolveMove(bot.position, sidestep.scale(r.s.botMoveSpeed * dt), COLLISION_RADIUS);
      this.steering.delete(bot.PlayerNumber);
    }
    /** GetNextBotTarget */
    GetNextBotTarget(bot) {
      if (bot.role === Role.Technician && !bot.AllTasksComplete) {
        const station = this.TryGetRandomIncompleteTask(bot);
        if (station) return station;
      }
      return this.GetRandomBotTarget();
    }
    GetRandomBotTarget() {
      return this.r.map.GetRandomWalkablePosition(this.r.random);
    }
    GetRandomSabotageTarget() {
      const panels = this.r.map.FaultPanels;
      if (panels.length === 0) return this.GetRandomBotTarget();
      return panels[this.r.random.RangeInt(0, panels.length)].Position;
    }
    TryGetRandomIncompleteTask(p) {
      const stations = this.r.map.JobStations.filter((s) => p.HasAssignedTask(s.Id) && !p.HasCompletedTask(s.Id));
      if (stations.length === 0) return null;
      return stations[this.r.random.RangeInt(0, stations.length)].Position;
    }
    TryGetClosestAliveTechnician(seeker) {
      let target = null;
      let closest = Number.MAX_VALUE;
      for (const p of this.r.Spawned()) {
        if (p === seeker || !p.isAlive || p.role !== Role.Technician) continue;
        const d = Dist(seeker.position, p.position);
        if (d < closest) {
          target = p;
          closest = d;
        }
      }
      return target;
    }
    /** PickBotVoteTarget: 25% abstain, else a random living other participant. */
    PickBotVoteTarget(voter) {
      const candidates = this.r.Spawned().filter((p) => p !== voter && p.isAlive && p.role !== Role.Observer);
      if (candidates.length === 0 || this.r.random.value < 0.25) return ABSTAIN;
      return candidates[this.r.random.RangeInt(0, candidates.length)].PlayerNumber;
    }
  };

  // src/Player.ts
  var Participant = class {
    constructor(slot, uid, name, isBot, position, killCooldownSeconds) {
      /** 0-based slot on the match roster; the upstream PlayerNumber is slot + 1. */
      __publicField(this, "slot");
      __publicField(this, "uid");
      __publicField(this, "name");
      __publicField(this, "isBot");
      /** NetworkedPosition: as last reported (a person) or as moved by the referee (a bot). */
      __publicField(this, "position");
      __publicField(this, "role", Role.Unassigned);
      __publicField(this, "state", MatchState.Lobby);
      __publicField(this, "winningTeam", Team.None);
      __publicField(this, "isAlive", true);
      __publicField(this, "isReportableBody", false);
      /** Where the body lies (the position when eliminated). */
      __publicField(this, "bodyPosition", null);
      __publicField(this, "hasVoted", false);
      __publicField(this, "votedTargetNumber", ABSTAIN);
      __publicField(this, "assignedTaskCount", 0);
      __publicField(this, "assignedTaskMask", 0);
      __publicField(this, "completedTaskMask", 0);
      __publicField(this, "lastAssignedTaskId", -1);
      __publicField(this, "taskDeadlineFailed", false);
      /** Synced seconds of the last elimination this player made. */
      __publicField(this, "lastKillTime");
      /** The player has left the world (upstream despawns them; the slot stays so numbers keep their meaning). */
      __publicField(this, "gone", false);
      /** Seconds the referee waits before trusting a position that jumped (PORT.md C11). */
      __publicField(this, "unsettledUntil", -Infinity);
      __publicField(this, "killCooldownSeconds");
      this.slot = slot;
      this.uid = uid;
      this.name = name;
      this.isBot = isBot;
      this.position = position.clone();
      this.killCooldownSeconds = killCooldownSeconds;
      this.lastKillTime = -killCooldownSeconds;
    }
    get PlayerNumber() {
      return this.slot + 1;
    }
    get DisplayName() {
      return this.name;
    }
    get IsSaboteur() {
      return this.role === Role.Saboteur;
    }
    /** Player.CanVote */
    get CanVote() {
      return this.state === MatchState.Muster && this.isAlive && this.role !== Role.Observer && !this.taskDeadlineFailed && !this.gone;
    }
    /** Player.CanDoTasks */
    get CanDoTasks() {
      return this.state === MatchState.Playing && this.isAlive && (this.role === Role.Technician || this.role === Role.Saboteur) && this.assignedTaskCount > 0 && !this.taskDeadlineFailed;
    }
    /** Player.CanMove */
    get CanMove() {
      return this.state === MatchState.Lobby || this.state === MatchState.Playing && this.isAlive && !this.taskDeadlineFailed;
    }
    KillCooldownRemaining(now) {
      return Math.max(0, this.killCooldownSeconds - (now - this.lastKillTime));
    }
    IsKillReady(now) {
      return this.KillCooldownRemaining(now) <= 0;
    }
    /** The synced time at which the next elimination is allowed. */
    KillReadyAt() {
      return this.lastKillTime + this.killCooldownSeconds;
    }
    get CompletedTaskCount() {
      return CountTasks(this.completedTaskMask & this.assignedTaskMask);
    }
    get AllTasksComplete() {
      return this.assignedTaskCount > 0 && this.CompletedTaskCount >= this.assignedTaskCount;
    }
    ReturnToLobby(spawnPosition) {
      this.position = spawnPosition.clone();
      this.role = Role.Unassigned;
      this.state = MatchState.Lobby;
      this.winningTeam = Team.None;
      this.isAlive = true;
      this.isReportableBody = false;
      this.bodyPosition = null;
      this.hasVoted = false;
      this.votedTargetNumber = ABSTAIN;
      this.assignedTaskCount = 0;
      this.assignedTaskMask = 0;
      this.completedTaskMask = 0;
      this.lastAssignedTaskId = -1;
      this.taskDeadlineFailed = false;
      this.lastKillTime = -this.killCooldownSeconds;
    }
    BeginRound(role, spawnPosition, taskMask) {
      this.position = spawnPosition.clone();
      this.role = role;
      this.state = MatchState.Playing;
      this.winningTeam = Team.None;
      this.isAlive = role !== Role.Observer;
      this.isReportableBody = false;
      this.bodyPosition = null;
      this.hasVoted = false;
      this.votedTargetNumber = ABSTAIN;
      this.assignedTaskMask = role === Role.Technician || role === Role.Saboteur ? taskMask & 1073741823 : 0;
      this.assignedTaskCount = CountTasks(this.assignedTaskMask);
      this.completedTaskMask = 0;
      this.lastAssignedTaskId = -1;
      this.taskDeadlineFailed = false;
    }
    EnterMeeting() {
      this.state = MatchState.Muster;
      this.hasVoted = false;
      this.votedTargetNumber = ABSTAIN;
    }
    ResumeAfterMeeting() {
      if (this.state !== MatchState.Ended) this.state = MatchState.Playing;
      this.hasVoted = false;
      this.votedTargetNumber = ABSTAIN;
    }
    EndRound(winningTeam) {
      this.state = MatchState.Ended;
      this.winningTeam = winningTeam;
      this.hasVoted = false;
    }
    /** Player.Kill: down where they stand, a body to report. */
    Kill() {
      this.isAlive = false;
      this.isReportableBody = true;
      this.bodyPosition = this.position.clone();
    }
    /** Player.Exile: locked out by the vote, no body. */
    Exile() {
      this.isAlive = false;
      this.isReportableBody = false;
    }
    MarkBodyReported() {
      this.isReportableBody = false;
    }
    MarkVoted(targetNumber) {
      this.hasVoted = true;
      this.votedTargetNumber = targetNumber;
    }
    MarkKillUsed(now) {
      this.lastKillTime = now;
    }
    HasAssignedTask(taskId) {
      return taskId >= 0 && taskId < 30 && (this.assignedTaskMask & 1 << taskId) !== 0;
    }
    HasCompletedTask(taskId) {
      return this.HasAssignedTask(taskId) && (this.completedTaskMask & 1 << taskId) !== 0;
    }
    CompleteTask(taskId) {
      if (!this.CanDoTasks || !this.HasAssignedTask(taskId) || this.HasCompletedTask(taskId)) return false;
      this.completedTaskMask |= 1 << taskId;
      return true;
    }
    AssignTask(taskId) {
      if (this.role !== Role.Technician || taskId < 0 || taskId >= 30 || this.HasAssignedTask(taskId)) return false;
      this.assignedTaskMask |= 1 << taskId;
      this.assignedTaskCount = CountTasks(this.assignedTaskMask);
      this.lastAssignedTaskId = taskId;
      return true;
    }
    SetTaskFailureCutIn() {
      this.taskDeadlineFailed = true;
      if (this.state === MatchState.Muster) this.ResumeAfterMeeting();
    }
  };
  function CountTasks(taskMask) {
    let count = 0;
    for (let taskId = 0; taskId < 30; taskId++) if ((taskMask & 1 << taskId) !== 0) count++;
    return count;
  }

  // src/BasicSpawner.ts
  var CALIBRATION_START = f(0.7);
  function GetEjectedPlayerNumber(votes) {
    if (votes.size === 0) return ABSTAIN;
    const counts = /* @__PURE__ */ new Map();
    for (const target of votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    let topTargetNumber = ABSTAIN;
    let topVotes = 0;
    let tied = false;
    for (const [target, count] of counts) {
      if (count > topVotes) {
        topTargetNumber = target;
        topVotes = count;
        tied = false;
      } else if (count === topVotes) {
        tied = true;
      }
    }
    return tied ? ABSTAIN : topTargetNumber;
  }
  function Shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
      const swapIndex = random.RangeInt(0, i + 1);
      const t = items[i];
      items[i] = items[swapIndex];
      items[swapIndex] = t;
    }
  }
  function CreateTaskAssignmentMask(random, count, stations) {
    const available = Math.min(stations, 30);
    const assigned = Math.max(0, Math.min(count, available));
    const ids = [];
    for (let id = 0; id < available; id++) ids.push(id);
    for (let i = 0; i < assigned; i++) {
      const selected = random.RangeInt(i, ids.length);
      const t = ids[i];
      ids[i] = ids[selected];
      ids[selected] = t;
    }
    let mask = 0;
    for (let i = 0; i < assigned; i++) mask |= 1 << ids[i];
    return mask;
  }
  function SaboteurCount(setting, count) {
    const most = Math.max(1, Math.ceil(count / 2) - 1);
    return Math.max(1, Math.min(setting, most, count));
  }
  var MatchRules = class {
    constructor(settings, map, random, quirks = {}, log = () => {
    }) {
      __publicField(this, "s");
      __publicField(this, "map");
      __publicField(this, "random");
      __publicField(this, "quirks");
      __publicField(this, "bots");
      /** Time.time: synced seconds, set by the caller. */
      __publicField(this, "time", 0);
      __publicField(this, "players", []);
      __publicField(this, "roundStarted", false);
      __publicField(this, "ended", false);
      __publicField(this, "startedAt", 0);
      __publicField(this, "endedAt", 0);
      __publicField(this, "meetingActive", false);
      __publicField(this, "meetingEndsAt", 0);
      __publicField(this, "meetingReporterNumber", 0);
      __publicField(this, "meetingBodyNumber", 0);
      __publicField(this, "activeFault", Fault.None);
      __publicField(this, "activeFaultEndsAt", 0);
      __publicField(this, "nextFaultAllowedAt", 0);
      __publicField(this, "nextEmergencyAllowedAt", 0);
      __publicField(this, "nextTimedTaskAt", Infinity);
      __publicField(this, "timedTaskWavesIssued", 0);
      __publicField(this, "taskDeadlineEndsAt", 0);
      __publicField(this, "taskFailurePending", false);
      __publicField(this, "taskFailureCutInEndsAt", 0);
      __publicField(this, "votes", /* @__PURE__ */ new Map());
      __publicField(this, "channels", /* @__PURE__ */ new Map());
      __publicField(this, "announcement", { kind: Announcement.None, playerNumber: 0, role: Role.Unassigned, endsAt: 0 });
      __publicField(this, "winner", Team.None);
      /** Slots whose elimination everyone has been told of (D4: the roster shows a death only from then on). */
      __publicField(this, "seenDown", /* @__PURE__ */ new Set());
      /** Bumped when a job wave hands out jobs (the alert tone). */
      __publicField(this, "waveSerial", 0);
      __publicField(this, "status", "");
      __publicField(this, "events", []);
      /** Test aid only (upstream's "host is the hidden role" switch, F7): these user ids are dealt the hidden role. */
      __publicField(this, "forcedSaboteurs", null);
      /** Told of every event (Match.ts keeps them for tests). */
      __publicField(this, "log");
      this.s = settings;
      this.map = map;
      this.random = random;
      this.quirks = { deadJobsCount: false, ...quirks };
      this.log = log;
      this.bots = new BotBrains(this);
    }
    note(event) {
      const e = { t: this.time, ...event };
      this.events.push(e);
      if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
      this.log(e);
    }
    /** GetSpawnedPlayers: everyone on the roster who has not left. */
    Spawned() {
      return this.players.filter((p) => !p.gone);
    }
    FindPlayerByNumber(number) {
      return this.Spawned().find((p) => p.PlayerNumber === number) ?? null;
    }
    slack(p) {
      return p.isBot ? 0 : this.s.rangeSlack;
    }
    settled(p) {
      return p.isBot || this.time >= p.unsettledUntil;
    }
    // ---- round flow ---------------------------------------------------------------------------------------------
    /** StartRound. `roster` is in slot order; every entry plays. */
    StartRound(roster) {
      this.players = roster.map((e, slot) => new Participant(slot, e.uid, e.name, e.isBot, this.map.GetSpawnPoint(slot, Vector2.zero), this.s.eliminateCooldown));
      const players = this.players.slice();
      if (players.length === 0) return;
      this.roundStarted = true;
      this.ended = false;
      this.startedAt = this.time;
      this.endedAt = 0;
      this.meetingActive = false;
      this.meetingReporterNumber = 0;
      this.meetingBodyNumber = 0;
      this.activeFault = Fault.None;
      this.activeFaultEndsAt = 0;
      this.nextFaultAllowedAt = this.time + this.s.firstFaultSeconds;
      this.nextEmergencyAllowedAt = this.time;
      this.nextTimedTaskAt = this.time + Math.max(1, this.s.firstWaveSeconds);
      this.timedTaskWavesIssued = 0;
      this.taskDeadlineEndsAt = this.time + Math.max(30, this.s.shiftSeconds);
      this.taskFailurePending = false;
      this.taskFailureCutInEndsAt = 0;
      this.announcement = { kind: Announcement.None, playerNumber: 0, role: Role.Unassigned, endsAt: 0 };
      this.winner = Team.None;
      this.seenDown.clear();
      this.bots.Clear();
      this.channels.clear();
      this.votes.clear();
      Shuffle(players, this.random);
      if (this.forcedSaboteurs) {
        const forced = players.filter((p) => this.forcedSaboteurs.includes(p.uid));
        const rest = players.filter((p) => !this.forcedSaboteurs.includes(p.uid));
        players.splice(0, players.length, ...forced, ...rest);
      }
      const saboteurs = this.forcedSaboteurs ? Math.max(1, this.forcedSaboteurs.filter((u) => players.some((p) => p.uid === u)).length) : SaboteurCount(this.s.saboteurs, players.length);
      const spawns = this.CreateRoundSpawnPositions(players.length);
      for (let i = 0; i < players.length; i++) {
        const role = i < saboteurs ? Role.Saboteur : Role.Technician;
        const mask = CreateTaskAssignmentMask(this.random, this.s.jobsPerPlayer, this.map.JobStations.length);
        players[i].BeginRound(role, spawns[i], mask);
        players[i].lastKillTime = this.time - this.s.eliminateCooldown;
        if (players[i].isBot) this.bots.Seed(players[i]);
      }
      this.status = `Shift started: ${players.length - saboteurs} technician(s), ${saboteurs} saboteur(s)`;
      this.note({ kind: "start", detail: `${players.length}/${saboteurs}` });
    }
    /** CreateRoundSpawnPositions */
    CreateRoundSpawnPositions(count) {
      const assigned = [];
      for (let i = 0; i < count; i++) assigned.push(this.GetSeparatedRandomWalkablePosition(assigned));
      return assigned;
    }
    /** GetSeparatedRandomWalkablePosition: at least 1.15 from those already placed, 64 tries. */
    GetSeparatedRandomWalkablePosition(existing) {
      const minimumDistance = f(1.15);
      for (let attempt = 0; attempt < 64; attempt++) {
        const candidate = this.map.GetRandomWalkablePosition(this.random);
        if (existing.every((e) => !(Dist(candidate, e) < minimumDistance))) return candidate;
      }
      return this.map.GetRandomWalkablePosition(this.random);
    }
    /** Update(): timers, waves and (in the Match behaviour's tick) the bots. */
    UpdateTimers() {
      if (!this.roundStarted) return;
      if (this.taskFailurePending) {
        if (this.time >= this.taskFailureCutInEndsAt) this.EndRound(Team.Saboteurs);
        return;
      }
      if (this.taskDeadlineEndsAt > 0 && this.time >= this.taskDeadlineEndsAt) {
        this.BeginTaskFailureCutIn();
        return;
      }
      if (this.meetingActive) {
        if (this.time >= this.meetingEndsAt) this.ResolveMeeting();
        return;
      }
      if (this.activeFault !== Fault.None && this.activeFaultEndsAt > 0 && this.time >= this.activeFaultEndsAt) {
        this.status = "The fault ran out.";
        this.EndRound(Team.Saboteurs);
        return;
      }
      this.UpdateTimedTaskAssignments();
    }
    /** The bots' part of Update(), with the same early returns. `dt` is Time.deltaTime. */
    UpdateBots(dt) {
      if (!this.roundStarted || this.taskFailurePending) return;
      if (this.taskDeadlineEndsAt > 0 && this.time >= this.taskDeadlineEndsAt) return;
      if (this.meetingActive) {
        this.bots.UpdateBotVoting();
        return;
      }
      if (this.activeFault !== Fault.None && this.activeFaultEndsAt > 0 && this.time >= this.activeFaultEndsAt) return;
      this.bots.UpdateBots(dt);
    }
    UpdateTimedTaskAssignments() {
      if (this.timedTaskWavesIssued >= this.s.jobWaves || this.time < this.nextTimedTaskAt) return;
      let assigned = 0;
      for (const p of this.Spawned()) {
        if (p.state !== MatchState.Playing || !p.isAlive || p.role !== Role.Technician) continue;
        if (this.TryAssignRandomTask(p)) assigned++;
      }
      this.timedTaskWavesIssued++;
      this.nextTimedTaskAt = this.timedTaskWavesIssued >= this.s.jobWaves ? Infinity : this.time + Math.max(1, this.s.waveIntervalSeconds);
      if (assigned > 0) {
        this.waveSerial++;
        this.status = `New jobs: ${assigned} technician(s) received one`;
      }
      this.note({ kind: "wave", detail: String(assigned) });
    }
    TryAssignRandomTask(p) {
      const available = this.map.JobStations.filter((s) => s.Id < 30 && !p.HasAssignedTask(s.Id));
      if (available.length === 0) return false;
      const job = available[this.random.RangeInt(0, available.length)];
      return p.AssignTask(job.Id);
    }
    BeginTaskFailureCutIn() {
      if (this.taskFailurePending) return;
      this.taskFailurePending = true;
      this.taskFailureCutInEndsAt = this.time + Math.max(1, this.s.shiftFailSeconds);
      this.meetingActive = false;
      this.channels.clear();
      this.votes.clear();
      this.ClearActiveSabotage();
      for (const p of this.Spawned()) p.SetTaskFailureCutIn();
      this.status = "The shift clock ran out.";
      this.note({ kind: "cutin" });
    }
    EndRound(team) {
      this.meetingActive = false;
      this.nextTimedTaskAt = Infinity;
      this.taskDeadlineEndsAt = 0;
      this.taskFailurePending = false;
      this.ClearActiveSabotage();
      this.channels.clear();
      this.votes.clear();
      this.roundStarted = false;
      this.ended = true;
      this.endedAt = this.time;
      this.winner = team;
      for (const p of this.Spawned()) p.EndRound(team);
      this.announcement = { kind: Announcement.MatchResult, playerNumber: 0, role: Role.Unassigned, endsAt: this.time + this.s.announceSeconds };
      this.status = `${team === Team.Technicians ? "Technicians" : "Saboteurs"} win.`;
      this.note({ kind: "end", detail: String(team) });
    }
    // ---- win check ----------------------------------------------------------------------------------------------
    CheckWinCondition() {
      if (this.taskFailurePending) return false;
      const players = this.Spawned();
      if (players.length < 2) return false;
      let aliveTech = 0;
      let aliveSab = 0;
      for (const p of players) {
        if (!p.isAlive) continue;
        if (p.role === Role.Technician) aliveTech++;
        else if (p.role === Role.Saboteur) aliveSab++;
      }
      if (aliveSab === 0) {
        this.EndRound(Team.Technicians);
        return true;
      } else if (aliveSab >= aliveTech) {
        this.EndRound(Team.Saboteurs);
        return true;
      }
      if (this.taskDeadlineEndsAt > 0 && this.time >= this.taskDeadlineEndsAt) {
        this.BeginTaskFailureCutIn();
        return true;
      }
      if (this.AreCrewTasksComplete()) {
        this.EndRound(Team.Technicians);
        return true;
      }
      return false;
    }
    AreCrewTasksComplete() {
      if (this.timedTaskWavesIssued < this.s.jobWaves) return false;
      const { completed, total } = this.GetCrewTaskProgress();
      return total > 0 && completed >= total;
    }
    /** GetCrewTaskProgress over the technicians present. D1: an eliminated technician counts only what they finished. */
    GetCrewTaskProgress() {
      let completed = 0;
      let total = 0;
      for (const p of this.Spawned()) {
        if (p.role !== Role.Technician) continue;
        completed += p.CompletedTaskCount;
        total += p.isAlive || this.quirks.deadJobsCount ? p.assignedTaskCount : p.CompletedTaskCount;
      }
      return { completed, total };
    }
    // ---- actions ------------------------------------------------------------------------------------------------
    /** Player.TryUseKill + TryKill + FindKillTarget. */
    TryUseKill(killer) {
      if (killer.state !== MatchState.Playing || !killer.isAlive || !killer.IsSaboteur || !killer.IsKillReady(this.time)) return false;
      if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return false;
      if (!this.settled(killer)) return false;
      const target = this.FindKillTarget(killer);
      if (!target) {
        this.status = "Nobody in reach";
        return false;
      }
      target.Kill();
      this.CancelHeldInteract(target);
      killer.MarkKillUsed(this.time);
      this.status = `${killer.DisplayName} eliminated ${target.DisplayName}`;
      this.note({ kind: "eliminate", actor: killer.slot, target: target.slot });
      this.CheckWinCondition();
      return true;
    }
    FindKillTarget(killer) {
      let closest = null;
      let closestDistance = f(this.s.eliminateRange + this.slack(killer));
      for (const p of this.Spawned()) {
        if (p === killer || !p.isAlive || p.role !== Role.Technician) continue;
        const d = Dist(killer.position, p.position);
        if (d <= closestDistance && this.map.HasClearWalkableSegment(killer.position, p.position, 0.18)) {
          closest = p;
          closestDistance = d;
        }
      }
      return closest;
    }
    /** Player.TryUseReport + TryReport. */
    TryUseReport(reporter) {
      if (reporter.state !== MatchState.Playing || !reporter.isAlive) return false;
      if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return false;
      if (!this.settled(reporter)) return false;
      const body = this.FindReportableBody(reporter);
      if (!body) {
        this.status = "No one down in reach";
        return false;
      }
      this.note({ kind: "alarm", actor: reporter.slot, target: body.slot });
      this.StartMeeting(reporter, body);
      return true;
    }
    FindReportableBody(reporter) {
      let closest = null;
      let closestDistance = f(this.s.reportRange + this.slack(reporter));
      for (const p of this.players) {
        if (p === reporter || !p.isReportableBody || !p.bodyPosition) continue;
        const d = Dist(reporter.position, p.bodyPosition);
        if (d <= closestDistance && this.map.HasClearWalkableSegment(reporter.position, p.bodyPosition, 0.18)) {
          closest = p;
          closestDistance = d;
        }
      }
      return closest;
    }
    /** TryInteract: the press of Use. Only the muster post acts on the press; the rest is the held channel. */
    TryInteract(player) {
      if (!this.roundStarted || this.meetingActive || this.taskFailurePending || !player.isAlive) return false;
      if (this.activeFault !== Fault.None && player.role === Role.Technician) {
        const panel = this.map.PanelFor(this.activeFault);
        if (panel && Dist(player.position, panel.Position) <= this.s.faultRange + this.slack(player)) {
          this.status = `Hold Use to reset: ${panel.Name}`;
          return true;
        }
      }
      if (this.activeFault === Fault.None && this.TryCallEmergencyMeeting(player)) return true;
      if (player.CanDoTasks) {
        if (this.activeFault === Fault.Jam) {
          this.status = "Jobs are blocked while the sonar is jammed";
          return false;
        }
        const near = this.TryGetNearestIncompleteTask(player);
        if (near && near.distance <= this.s.jobRange + this.slack(player)) return true;
      }
      return false;
    }
    TryCallEmergencyMeeting(reporter) {
      if (!reporter.isAlive || reporter.role === Role.Observer) return false;
      if (reporter.state !== MatchState.Playing) return false;
      if (this.time < this.nextEmergencyAllowedAt) return false;
      if (!this.settled(reporter)) return false;
      if (Dist(reporter.position, this.map.MeetingPoint) > this.s.musterRange + this.slack(reporter)) return false;
      this.note({ kind: "muster", actor: reporter.slot });
      this.StartMeeting(reporter, null);
      return true;
    }
    /** UpdateHeldInteract: one stretch of `deltaTime` with Use held or not. */
    UpdateHeldInteract(player, deltaTime, isHeld) {
      if (!this.roundStarted || this.meetingActive || !player.isAlive || this.taskFailurePending) {
        this.CancelHeldInteract(player);
        return;
      }
      if (this.activeFault !== Fault.None && player.role === Role.Technician) {
        const panel = this.map.PanelFor(this.activeFault);
        if (panel && Dist(player.position, panel.Position) <= this.s.faultRange + this.slack(player)) {
          if (!isHeld) {
            this.CancelHeldInteract(player);
            return;
          }
          this.AdvanceChannel(player, Interaction.Reset, this.activeFault, this.s.resetSeconds, deltaTime, () => this.TryFixSabotage(player));
          return;
        }
      }
      if (player.CanDoTasks && this.activeFault !== Fault.Jam) {
        const near = this.TryGetNearestIncompleteTask(player);
        if (near && near.distance <= this.s.jobRange + this.slack(player)) {
          this.UpdateTaskChannel(player, near.station, deltaTime, isHeld);
          return;
        }
      }
      this.CancelHeldInteract(player);
    }
    UpdateTaskChannel(player, station, deltaTime, isHeld) {
      switch (station.Kind) {
        case JobKind.Tap:
          this.UpdateCircuitTask(player, station, deltaTime, isHeld);
          break;
        case JobKind.Timing:
          this.UpdateCalibrationTask(player, station, deltaTime, isHeld);
          break;
        default:
          if (!isHeld) {
            this.CancelHeldInteract(player);
            return;
          }
          this.AdvanceChannel(player, Interaction.Job, station.Id, this.s.holdSeconds, deltaTime, () => this.TryCompleteTask(player));
          break;
      }
    }
    UpdateCircuitTask(player, station, deltaTime, isHeld) {
      let channel = this.channels.get(player.PlayerNumber);
      if (!channel || channel.kind !== Interaction.Job || channel.targetId !== station.Id) {
        if (!isHeld) return;
        channel = { kind: Interaction.Job, targetId: station.Id, progress: 0, wasHeld: false };
      }
      if (player.isBot) channel.progress = f(channel.progress + f(deltaTime / f(0.35)));
      else if (isHeld && !channel.wasHeld) channel.progress = f(channel.progress + 1);
      channel.wasHeld = isHeld;
      this.CommitTaskChannel(player, channel, this.s.tapCount);
    }
    UpdateCalibrationTask(player, station, deltaTime, isHeld) {
      const cycle = f(Math.max(0.5, this.s.timingCycleSeconds));
      let channel = this.channels.get(player.PlayerNumber);
      if (!channel || channel.kind !== Interaction.Job || channel.targetId !== station.Id) {
        if (!isHeld) return;
        channel = { kind: Interaction.Job, targetId: station.Id, progress: 0, wasHeld: false };
      }
      if (player.isBot) {
        channel.progress = f(channel.progress + f(deltaTime));
        if (channel.progress >= f(cycle * CALIBRATION_START)) {
          this.CompleteTaskChannel(player);
          return;
        }
      } else if (isHeld) {
        channel.progress = Repeat(f(channel.progress + f(deltaTime)), cycle);
      } else if (channel.wasHeld) {
        const normalized = f(channel.progress / cycle);
        if (normalized >= f(this.s.timingBand[0]) && normalized <= f(this.s.timingBand[1])) {
          this.CompleteTaskChannel(player);
          return;
        }
        channel.progress = 0;
      }
      channel.wasHeld = isHeld;
      this.channels.set(player.PlayerNumber, channel);
    }
    CommitTaskChannel(player, channel, required) {
      if (channel.progress >= required) {
        this.CompleteTaskChannel(player);
        return;
      }
      this.channels.set(player.PlayerNumber, channel);
    }
    CompleteTaskChannel(player) {
      this.channels.delete(player.PlayerNumber);
      this.TryCompleteTask(player);
    }
    AdvanceChannel(player, kind, targetId, required, deltaTime, onComplete) {
      let channel = this.channels.get(player.PlayerNumber);
      if (!channel || channel.kind !== kind || channel.targetId !== targetId) channel = { kind, targetId, progress: 0, wasHeld: false };
      channel.progress = f(channel.progress + f(deltaTime));
      this.channels.set(player.PlayerNumber, channel);
      if (channel.progress < f(required)) return;
      this.channels.delete(player.PlayerNumber);
      onComplete();
    }
    CancelHeldInteract(player) {
      if (player) this.channels.delete(player.PlayerNumber);
    }
    TryCompleteTask(p) {
      if (!this.roundStarted || this.meetingActive || this.taskFailurePending || !p.CanDoTasks) return false;
      if (this.activeFault === Fault.Jam) {
        this.status = "Jobs are blocked while the sonar is jammed";
        return false;
      }
      const near = this.TryGetNearestIncompleteTask(p);
      if (!near || near.distance > this.s.jobRange + this.slack(p)) {
        this.status = "No unfinished job in reach";
        return false;
      }
      if (!p.CompleteTask(near.station.Id)) return false;
      this.status = `${p.DisplayName} finished ${near.station.Name}`;
      this.note({ kind: "job", actor: p.slot, target: near.station.Id });
      this.CheckWinCondition();
      return true;
    }
    TryGetNearestIncompleteTask(p) {
      let best = null;
      let distance = Number.MAX_VALUE;
      for (const s of this.map.JobStations) {
        if (!p.HasAssignedTask(s.Id) || p.HasCompletedTask(s.Id)) continue;
        const d = Dist(p.position, s.Position);
        if (d < distance) {
          best = s;
          distance = d;
        }
      }
      return best ? { station: best, distance } : null;
    }
    /** Player.TryUseSabotage + TryStartSabotage. */
    TryStartSabotage(saboteur) {
      if (saboteur.state !== MatchState.Playing || !saboteur.isAlive || !saboteur.IsSaboteur) return false;
      if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return false;
      if (this.activeFault !== Fault.None) {
        this.status = "A fault is already running";
        return false;
      }
      if (this.time < this.nextFaultAllowedAt) {
        this.status = "Faults are cooling down";
        return false;
      }
      if (!this.settled(saboteur)) return false;
      const near = this.map.NearestPanel(saboteur.position);
      if (!near || near.distance > this.s.faultRange + this.slack(saboteur)) {
        this.status = "No fault panel in reach";
        return false;
      }
      this.activeFault = near.panel.Type;
      const seconds2 = this.FaultCountdown(this.activeFault);
      this.activeFaultEndsAt = seconds2 > 0 ? this.time + seconds2 : 0;
      this.nextFaultAllowedAt = this.time + this.s.faultCooldown;
      this.status = `${near.panel.Name}!`;
      this.note({ kind: "fault", actor: saboteur.slot, target: this.activeFault });
      return true;
    }
    /** The countdown of a fault in seconds, 0 for none. D2: the fourth fault has one too. */
    FaultCountdown(fault) {
      const panel = this.map.PanelFor(fault);
      if (!panel || !panel.HasCountdown) return 0;
      return fault === Fault.Scrubber ? this.s.scrubberSeconds : this.s.breachSeconds;
    }
    TryFixSabotage(technician) {
      if (this.activeFault === Fault.None) return false;
      const panel = this.map.PanelFor(this.activeFault);
      if (!panel) return false;
      if (Dist(technician.position, panel.Position) > this.s.faultRange + this.slack(technician)) return false;
      const was = this.activeFault;
      this.ClearActiveSabotage();
      this.status = `${technician.DisplayName} reset the ${panel.Name}`;
      this.note({ kind: "reset", actor: technician.slot, target: was });
      return true;
    }
    ClearActiveSabotage() {
      this.activeFault = Fault.None;
      this.activeFaultEndsAt = 0;
    }
    /**
     * Player.TryUseVent + TryUseVent, for a hatch the player says they stood at. The player's own client makes the move
     * (PORT.md 3.10); this decides whether the jump is allowed, and returns where it lands, or null.
     */
    TryUseHatch(saboteur, from, hatchIndex) {
      if (saboteur.state !== MatchState.Playing || !saboteur.isAlive || !saboteur.IsSaboteur) return null;
      if (!this.roundStarted || this.meetingActive || this.taskFailurePending) return null;
      const near = this.map.NearestHatch(from);
      if (!near || near.hatch.Index !== hatchIndex || near.distance > this.s.hatchRange + this.slack(saboteur)) {
        this.status = "No hatch in reach";
        return null;
      }
      const next = this.map.GetNextHatch(near.hatch);
      this.note({ kind: "hatch", actor: saboteur.slot, target: next.Index });
      return this.map.ClampToWalkable(next.Position, 0.5);
    }
    /** TrySubmitVote */
    TrySubmitVote(voter, targetNumber) {
      if (!this.meetingActive || !voter.CanVote) return false;
      if (this.votes.has(voter.PlayerNumber)) return false;
      if (targetNumber !== ABSTAIN && !this.IsValidVoteTarget(targetNumber)) targetNumber = ABSTAIN;
      this.votes.set(voter.PlayerNumber, targetNumber);
      voter.MarkVoted(targetNumber);
      this.note({ kind: "vote", actor: voter.slot });
      if (this.votes.size >= this.GetEligibleVoterCount()) this.ResolveMeeting();
      return true;
    }
    IsValidVoteTarget(targetNumber) {
      const t = this.FindPlayerByNumber(targetNumber);
      return t !== null && t.isAlive && t.role !== Role.Observer;
    }
    GetEligibleVoterCount() {
      return this.Spawned().filter((p) => p.CanVote).length;
    }
    StartMeeting(reporter, body) {
      this.meetingActive = true;
      this.meetingEndsAt = this.time + this.s.musterSeconds;
      this.bots.MeetingStarted();
      this.nextEmergencyAllowedAt = this.time + this.s.musterCooldown;
      this.votes.clear();
      this.channels.clear();
      this.ClearActiveSabotage();
      let bodyNumber = 0;
      if (body) {
        body.MarkBodyReported();
        bodyNumber = body.PlayerNumber;
      }
      this.meetingReporterNumber = reporter.PlayerNumber;
      this.meetingBodyNumber = bodyNumber;
      for (const p of this.players) if (!p.isAlive) this.seenDown.add(p.slot);
      for (const p of this.Spawned()) p.EnterMeeting();
      this.announcement = { kind: Announcement.None, playerNumber: 0, role: Role.Unassigned, endsAt: 0 };
      this.status = body ? `${reporter.DisplayName} raised the alarm: ${body.DisplayName} is down.` : `${reporter.DisplayName} called a muster.`;
    }
    ResolveMeeting() {
      if (!this.meetingActive) return;
      this.meetingActive = false;
      const ejectedNumber = GetEjectedPlayerNumber(this.votes);
      const ejected = ejectedNumber === ABSTAIN ? null : this.FindPlayerByNumber(ejectedNumber);
      if (ejected) {
        ejected.Exile();
        this.seenDown.add(ejected.slot);
        this.CancelHeldInteract(ejected);
        this.status = `${ejected.DisplayName} was locked out.`;
      } else {
        this.status = "Nobody was locked out.";
      }
      this.announcement = {
        kind: Announcement.MusterResult,
        playerNumber: ejected ? ejected.PlayerNumber : 0,
        role: ejected ? ejected.role : Role.Unassigned,
        endsAt: this.time + this.s.announceSeconds
      };
      this.note({ kind: "result", target: ejected ? ejected.slot : -1 });
      this.votes.clear();
      if (this.CheckWinCondition()) return;
      for (const p of this.Spawned()) p.ResumeAfterMeeting();
    }
    /** OnPlayerLeft: the player is gone; during a round the win check runs. */
    PlayerLeft(slot) {
      const p = this.players[slot];
      if (!p || p.gone) return;
      p.gone = true;
      this.CancelHeldInteract(p);
      this.note({ kind: "left", actor: slot });
      if (this.roundStarted) this.CheckWinCondition();
    }
    // ---- what the referee publishes and seals -------------------------------------------------------------------
    /** Seconds until the next fault is allowed, as a synced time. */
    get FaultReadyAt() {
      return this.nextFaultAllowedAt;
    }
  };
  function Repeat(t, length) {
    return f(Math.min(Math.max(0, f(t - f(Math.floor(f(t / length)) * length))), length));
  }

  // src/PlayerLink.ts
  var PlayerLink = class extends Behaviour {
    constructor() {
      super(...arguments);
      /** Synced seconds when the player joined the lobby; 0 when they are not in it. */
      __publicField(this, "j", 0);
      /** The latest sealed beat, for the referee only. */
      __publicField(this, "b", "");
      /** Local: how many times the fields were received (tests). */
      __publicField(this, "received", 0);
    }
    get IsMine() {
      return this.Player !== null && this.Player.isLocal;
    }
    /** The local player joins or leaves the lobby. Joining also offers them as referee ("declared" candidates). */
    SetJoined(on) {
      if (!this.IsMine) return;
      const now = this.Networking.GetServerTimeInSeconds();
      this.j = on ? Math.max(1, Math.round(now * 1e3) / 1e3) : 0;
      this.RequestSerialization();
    }
    /** Writes the next beat. */
    SendBeat(text) {
      if (!this.IsMine) return;
      this.b = text;
      this.RequestSerialization();
    }
    /** Clears the beat when the player stops sending (end of match). */
    ClearBeat() {
      if (!this.IsMine || this.b === "") return;
      this.b = "";
      this.RequestSerialization();
    }
    OnDeserialization() {
      this.received++;
    }
  };
  __publicField(PlayerLink, "perPlayer", true);
  __publicField(PlayerLink, "synced", ["j", "b"]);

  // src/Match.ts
  function emptyMatch() {
    return {
      st: MatchState.Lobby,
      r: 0,
      d: "",
      du: "",
      t0: 0,
      by: "",
      sl: [],
      al: [],
      bd: [],
      rp: [],
      vo: [],
      sd: [],
      gn: [],
      sp: [],
      bp: [],
      dl: 0,
      ci: 0,
      nw: -1,
      wi: 0,
      me: 0,
      mr: -1,
      mb: -1,
      ring: [],
      er: 0,
      fk: 0,
      fe: 0,
      an: [0, -1, 0, 0],
      w: 0,
      cd: 0,
      ct: 0,
      ro: [],
      ws: 0,
      last: null,
      nt: "",
      ntAt: 0
    };
  }
  var round22 = (v) => Math.round(v * 100) / 100;
  var round32 = (v) => Math.round(v * 1e3) / 1e3;
  function RingPosition(index, count) {
    const angle = 2 * Math.PI * index / Math.max(1, count);
    return new Vector2(STATION.MeetingPoint.x + 2.8 * Math.sin(angle), STATION.MeetingPoint.y + 2.8 * Math.cos(angle));
  }
  var LEAVE_GRACE = 5;
  var Match = class extends Behaviour {
    constructor() {
      super(...arguments);
      __publicField(this, "m", emptyMatch());
      __publicField(this, "settings");
      /** The referee's rules engine; null on every other client. */
      __publicField(this, "rules", null);
      /** The referee's memory of the match it dealt. */
      __publicField(this, "tracks", []);
      __publicField(this, "stepping", false);
      __publicField(this, "lastMusterEnd", -Infinity);
      __publicField(this, "lastPublished", "");
      __publicField(this, "dealer", null);
      /** Test aid: user ids that must be dealt the hidden role (upstream's "host is the hidden role" switch). Not a setting. */
      __publicField(this, "forcedSaboteurs", null);
      /** Test aid: the referee's rules events, all matches. */
      __publicField(this, "history", []);
      /** Steps run (tests). */
      __publicField(this, "steps", 0);
      /** Told whenever `m` changes on this client (the HUD). */
      __publicField(this, "onChanged", () => {
      });
    }
    Start() {
      this.settings = readSettings(this.Settings);
      this.dealer = this.FindBehaviour("dealer");
    }
    OnDeserialization() {
      this.onChanged();
    }
    // ---- reading ------------------------------------------------------------------------------------------------
    get Now() {
      return this.Networking.GetServerTimeInSeconds();
    }
    /** Seconds since the match started, on the synced clock. */
    Rel() {
      return this.m.t0 > 0 ? this.Now - this.m.t0 : 0;
    }
    /** The slot of a user on the current roster, or -1. */
    SlotOf(uid) {
      return this.m.sl.findIndex((s) => s.u === uid);
    }
    get InMatch() {
      return this.m.st === MatchState.Playing || this.m.st === MatchState.Muster || this.m.st === MatchState.Ended;
    }
    /** People in the lobby, in the order they joined (first come), from their own leaves. */
    Lobby() {
      const links = this.PlayerBehaviours("link").filter((l) => l.j > 0 && l.Player !== null);
      links.sort((a, b) => a.j - b.j || (a.Player.uid < b.Player.uid ? -1 : 1));
      return links.map((l) => l.Player);
    }
    // ---- commands to the referee --------------------------------------------------------------------------------
    RequestStart() {
      this.SendCommand("CmdStart");
    }
    RequestAbort() {
      this.SendCommand("CmdAbort");
    }
    CmdStart() {
      if (!this.Networking.IsReferee || this.m.st !== MatchState.Lobby) return;
      const caller = this.Networking.CallingPlayer;
      if (!caller) return;
      const lobby = this.Lobby();
      const s = this.settings;
      if (s.startBy === "admin" ? !caller.isSpaceAdmin : !lobby.some((p) => p.sid === caller.sid)) return;
      const humans = lobby.slice(0, s.maxPlayers);
      const bots = Math.min(s.bots, s.maxPlayers - humans.length);
      if (humans.length + bots < s.minPlayers || humans.length === 0) return;
      const roster = humans.map((p) => ({ uid: p.uid, name: p.displayName, isBot: false }));
      for (let i = 0; i < bots; i++) roster.push({ uid: `bot-${i + 1}`, name: `Bot ${i + 1}`, isBot: true });
      this.Begin(roster, caller.uid);
    }
    CmdAbort() {
      if (!this.Networking.IsReferee || this.m.st === MatchState.Lobby) return;
      const caller = this.Networking.CallingPlayer;
      if (!caller || caller.uid !== this.m.by && !caller.isSpaceAdmin) return;
      this.ToLobby("aborted");
    }
    // ---- the referee --------------------------------------------------------------------------------------------
    Begin(roster, by) {
      const rules = new MatchRules(this.settings, STATION, this.Random, {}, (e) => this.history.push(e));
      rules.forcedSaboteurs = this.forcedSaboteurs;
      rules.time = round32(this.Now);
      rules.StartRound(roster);
      this.rules = rules;
      const t0 = rules.startedAt;
      this.tracks = roster.map(() => ({ lastSeq: -1, lastT: t0, lastBeatT: t0, useHeld: false, lastText: "", returnPoint: null, landing: null, landingUntil: 0, sid: "", absentSince: -1 }));
      this.lastMusterEnd = -Infinity;
      const me = this.Networking.LocalPlayer;
      this.m = {
        ...emptyMatch(),
        r: this.m.r + 1,
        d: me.sid,
        du: me.uid,
        t0: round32(t0),
        by,
        sl: roster.map((e) => ({ u: e.uid, n: e.name, b: e.isBot ? 1 : 0 })),
        sp: rules.players.map((p) => [round22(p.position.x), round22(p.position.y)]),
        last: this.m.last
      };
      rules.players.forEach((p, i) => p.position = new Vector2(this.m.sp[i][0], this.m.sp[i][1]));
      this.Publish(true);
      this.Deal();
    }
    Update() {
      if (!this.Networking.IsReferee) {
        this.rules = null;
        return;
      }
      if (this.m.st !== MatchState.Lobby && !this.rules) {
        this.ToLobby("void-referee");
        return;
      }
      const rules = this.rules;
      if (!rules) return;
      const now = this.Now;
      if (rules.roundStarted) {
        rules.time = now;
        rules.UpdateBots(this.Time.deltaTime);
      }
      if (this.Time.frameCount % BEAT_TICKS === 0) void this.Step(now);
    }
    OnMasterTransferred() {
      if (!this.Networking.IsReferee) this.rules = null;
    }
    /** One fixed step: open the beats that came in, apply them in time order, run the timers, publish, re-seal. */
    async Step(now) {
      const rules = this.rules;
      if (!rules || this.stepping) return;
      this.stepping = true;
      try {
        const round = this.m.r;
        const beats = await this.OpenBeats(rules);
        if (this.rules !== rules || this.m.r !== round || !this.Networking.IsReferee) return;
        this.steps++;
        if (rules.roundStarted) this.ApplyBeats(rules, beats, now);
        rules.time = now;
        rules.UpdateTimers();
        this.CheckGone(rules);
        if (rules.ended && now >= rules.endedAt + this.settings.announceSeconds) {
          this.ToLobby("");
          return;
        }
        this.Publish(false);
        this.Deal();
      } finally {
        this.stepping = false;
      }
    }
    links() {
      const out = /* @__PURE__ */ new Map();
      for (const link of this.PlayerBehaviours("link")) if (link.Player) out.set(link.Player.uid, link);
      return out;
    }
    async OpenBeats(rules) {
      const links = this.links();
      const work = [];
      for (const p of rules.players) {
        if (p.isBot || p.gone) continue;
        const track = this.tracks[p.slot];
        const link = links.get(p.uid);
        const text = link?.b ?? "";
        if (!link || !text || text === track.lastText) continue;
        track.lastText = text;
        const owner = link.Player.sid;
        work.push(
          this.Secrets.openWithSender(text).then(({ value, from }) => {
            if (from !== owner) return null;
            const beat = decodeBeat(value);
            return beat ? { p, beat, sid: owner } : null;
          }).catch(() => null)
        );
      }
      return (await Promise.all(work)).filter((x) => x !== null);
    }
    /** Applies opened beats: every edge at its own synced time, all players' edges merged in time order. */
    ApplyBeats(rules, beats, now) {
      const t0 = rules.startedAt;
      const items = [];
      let order = 0;
      for (const { p, beat, sid } of beats) {
        const track = this.tracks[p.slot];
        if (track.sid !== sid) {
          track.sid = sid;
          track.lastSeq = -1;
        }
        if (beat.m !== this.m.r || beat.q <= track.lastSeq) continue;
        track.lastSeq = beat.q;
        const T = Math.min(now, Math.max(track.lastT, t0 + beat.t));
        const ref = { beat, applied: false, T };
        const edges = beat.e.slice().sort((a, b) => a[2] - b[2]);
        for (const e of edges) {
          const at = t0 + e[2];
          if (at <= track.lastT) continue;
          items.push({ p, t: Math.min(T, at), order: order++, edge: e, ref });
        }
        items.push({ p, t: T, order: order++, edge: null, ref });
      }
      items.sort((a, b) => a.t - b.t || a.p.slot - b.p.slot || a.order - b.order);
      for (const item of items) {
        const { p } = item;
        const track = this.tracks[p.slot];
        rules.time = item.t;
        rules.UpdateTimers();
        if (!rules.roundStarted) return;
        if (!item.ref.applied) {
          item.ref.applied = true;
          this.ApplyPosition(rules, p, track, item.ref.beat, item.ref.T);
        }
        const dt = item.t - track.lastT;
        if (dt > 0) rules.UpdateHeldInteract(p, dt, track.useHeld);
        track.lastT = Math.max(track.lastT, item.t);
        const e = item.edge;
        if (e) {
          const button = e[0];
          const down = e[1] === 1;
          if (button === Btn.Use) track.useHeld = down;
          if (down) {
            switch (button) {
              case Btn.Eliminate:
                rules.TryUseKill(p);
                break;
              case Btn.Alarm:
                rules.TryUseReport(p);
                break;
              case Btn.Vote:
                rules.TrySubmitVote(p, e[3] | 0);
                break;
              case Btn.Use:
                rules.TryInteract(p);
                break;
              case Btn.Fault:
                rules.TryStartSabotage(p);
                break;
              default:
                break;
            }
          }
          if (button === Btn.Use) rules.UpdateHeldInteract(p, 0, track.useHeld);
        } else {
          const held = (item.ref.beat.h & 1 << Btn.Use) !== 0;
          if (held !== track.useHeld) {
            track.useHeld = held;
            rules.UpdateHeldInteract(p, 0, held);
          }
        }
      }
    }
    /**
     * A beat's position (PORT.md C11): taken as reported, but a jump no walk could make, and that the game did not
     * cause (start, muster ring, return, hatch), makes the referee ignore that player's ranged actions for 1.5 s.
     */
    ApplyPosition(rules, p, track, beat, T) {
      const prev = p.position.clone();
      const next = new Vector2(beat.p[0], beat.p[1]);
      for (const e of beat.e) {
        if (e[0] !== Btn.Hatch || e[1] !== 1 || rules.startedAt + e[2] <= track.lastT - 1e-9) continue;
        rules.time = Math.min(T, rules.startedAt + e[2]);
        const landing = rules.TryUseHatch(p, prev, e[3] | 0);
        if (landing) {
          track.landing = landing;
          track.landingUntil = T + 2;
          break;
        }
      }
      const dt = Math.max(0, T - track.lastBeatT);
      track.lastBeatT = T;
      const near = (a, r = 2) => !!a && Dist(next, a) <= r;
      const sanctioned = T <= track.landingUntil && near(track.landing) || T < rules.startedAt + 15 && near(new Vector2(this.m.sp[p.slot][0], this.m.sp[p.slot][1])) || (rules.meetingActive || T < this.lastMusterEnd + 10) && this.m.ring.some((_, i) => near(RingPosition(i, this.m.ring.length))) || T < this.lastMusterEnd + 15 && near(track.returnPoint);
      if (Dist(prev, next) > 8 * dt + 2 && !sanctioned) p.unsettledUntil = T + 1.5;
      if (p.isAlive) p.position = next;
    }
    /**
     * Upstream OnPlayerLeft: a person on the roster who is no longer in the world has left. Checked every step (so a
     * departure while there was no referee is not missed), after LEAVE_GRACE seconds so a page reload keeps the seat.
     */
    CheckGone(rules) {
      const present = new Set(this.Networking.GetPlayers().map((p) => p.uid));
      const now = this.Now;
      for (const p of rules.players) {
        if (p.isBot || p.gone) continue;
        const track = this.tracks[p.slot];
        if (present.has(p.uid)) {
          track.absentSince = -1;
          continue;
        }
        if (track.absentSince < 0) track.absentSince = now;
        if (now - track.absentSince < LEAVE_GRACE) continue;
        rules.time = now;
        rules.PlayerLeft(p.slot);
      }
    }
    /** Copies the public part of the rules into `m`, and writes it if it changed. */
    Publish(force) {
      const rules = this.rules;
      if (!rules) return;
      const t0 = rules.startedAt;
      const rel = (t) => t > 0 && Number.isFinite(t) ? round22(t - t0) : 0;
      const ps = rules.players;
      const st = rules.ended ? MatchState.Ended : rules.meetingActive ? MatchState.Muster : MatchState.Playing;
      let ring = this.m.ring;
      if (rules.meetingActive && this.m.st !== MatchState.Muster) {
        ring = ps.filter((p) => p.isAlive && !p.gone).map((p) => p.slot);
        for (const p of ps) if (this.tracks[p.slot]) this.tracks[p.slot].returnPoint = p.position.clone();
      }
      if (!rules.meetingActive && this.m.st === MatchState.Muster) this.lastMusterEnd = rules.time;
      const progress = rules.GetCrewTaskProgress();
      const an = rules.announcement;
      const m = {
        ...this.m,
        st,
        al: ps.map((p) => p.isAlive ? 1 : 0),
        bd: ps.map((p) => p.bodyPosition && !p.isAlive ? [round22(p.bodyPosition.x), round22(p.bodyPosition.y)] : 0),
        rp: ps.map((p) => p.isReportableBody ? 1 : 0),
        vo: ps.map((p) => p.hasVoted ? 1 : 0),
        sd: ps.map((p) => rules.seenDown.has(p.slot) ? 1 : 0),
        gn: ps.map((p) => p.gone ? 1 : 0),
        bp: ps.map((p) => p.isBot && p.isAlive ? [round22(p.position.x), round22(p.position.y)] : 0),
        dl: rel(rules.taskDeadlineEndsAt),
        ci: rules.taskFailurePending ? rel(rules.taskFailureCutInEndsAt) : 0,
        nw: Number.isFinite(rules.nextTimedTaskAt) ? rel(rules.nextTimedTaskAt) : -1,
        wi: rules.timedTaskWavesIssued,
        me: rules.meetingActive ? rel(rules.meetingEndsAt) : 0,
        mr: rules.meetingActive ? rules.meetingReporterNumber - 1 : -1,
        mb: rules.meetingActive ? rules.meetingBodyNumber - 1 : -1,
        ring: rules.meetingActive ? ring : [],
        er: rel(rules.nextEmergencyAllowedAt),
        fk: rules.activeFault,
        fe: rel(rules.activeFaultEndsAt),
        an: [an.kind, an.playerNumber - 1, an.kind === Announcement.MusterResult ? an.role : 0, rel(an.endsAt)],
        w: rules.winner,
        cd: progress.completed,
        ct: progress.total,
        ro: rules.ended ? ps.map((p) => p.role) : [],
        ws: rules.waveSerial
      };
      const text = JSON.stringify(m);
      if (!force && text === this.lastPublished) return;
      this.lastPublished = text;
      this.m = m;
      this.RequestSerialization();
      this.onChanged();
    }
    /** Seals every player's secret for them; called on every step of the match, changed or not. */
    Deal() {
      const rules = this.rules;
      if (!rules || !this.dealer) return;
      const t0 = rules.startedAt;
      const rel = (t) => Math.max(0, Math.round((t - t0) * 100) / 100);
      const saboteurs = rules.players.filter((p) => p.role === Role.Saboteur).map((p) => p.slot);
      const entries = rules.players.map(
        (p) => p.isBot ? null : {
          n: this.m.r,
          r: p.role,
          f: p.role === Role.Saboteur ? saboteurs.filter((s) => s !== p.slot) : [],
          a: p.assignedTaskMask,
          c: p.completedTaskMask,
          l: p.lastAssignedTaskId,
          k: p.role === Role.Saboteur ? rel(p.KillReadyAt()) : 0,
          s: p.role === Role.Saboteur ? rel(rules.nextFaultAllowedAt) : 0
        }
      );
      const bySid = /* @__PURE__ */ new Map();
      for (const pl of this.Networking.GetPlayers()) bySid.set(pl.uid, pl);
      void this.dealer.Deal(this.m.r, entries, rules.players.map((p) => p.isBot ? null : bySid.get(p.uid) ?? null));
    }
    /** Back to the lobby: after the result, or at once for a void or aborted match. The roster stays in the lobby. */
    ToLobby(notice) {
      const rules = this.rules;
      const ended = rules?.ended === true;
      const last = ended && rules ? { w: rules.winner, n: rules.players.map((p) => p.name), ro: rules.players.map((p) => p.role) } : this.m.last;
      this.rules = null;
      this.tracks = [];
      this.m = { ...emptyMatch(), r: this.m.r, last, nt: notice, ntAt: notice ? round32(this.Now) : 0 };
      this.lastPublished = JSON.stringify(this.m);
      this.RequestSerialization();
      this.dealer?.Clear();
      this.onChanged();
    }
    // ---- for tests and the debug hooks ------------------------------------------------------------------------------
    /** The referee's view of who holds which role (null elsewhere). */
    RolesForTest() {
      if (!this.rules) return null;
      const out = {};
      for (const p of this.rules.players) out[p.uid] = p.role;
      return out;
    }
    static TeamName(team) {
      return team === Team.Technicians ? "technicians" : team === Team.Saboteurs ? "saboteurs" : "nobody";
    }
  };
  __publicField(Match, "synced", ["m"]);
  /** The only methods another client may ask for (portkit: network calls are refused unless listed). */
  __publicField(Match, "networkCallable", ["CmdStart", "CmdAbort"]);

  // src/region-pvs.json
  var region_pvs_default = {
    note: "tools/sightlines.ts: per region, the regions visible from it (1), row by row from the south-west of the play bounds",
    cols: 6,
    rows: 5,
    visible: [
      "000000000000000000000000000000",
      "111110111000111100000100000000",
      "011110111110111100001100000000",
      "011110111111101100001100000000",
      "011111111111000011000011000000",
      "000000000000000000000000000000",
      "111110111000111110110011010000",
      "111110111000111110110111010000",
      "011110111100111110001100000000",
      "001110001110011110001100000000",
      "001111000111000111000011000000",
      "000111000011000011000011000010",
      "011100111000111111110000010000",
      "011000111100111111111111010000",
      "011100111100111111111111000000",
      "011100111110111111111111000000",
      "000010111111111111001111000010",
      "000010000011111111000011000010",
      "000000110000111100110000110000",
      "000000110000111100111110111100",
      "001100001100011110011110011100",
      "011100011100011110011110011110",
      "000010110011011111011111011111",
      "000010000011001111000011000111",
      "000000000000000000000000000000",
      "000000110000110000111110111100",
      "000000000000000000011110011110",
      "000000000000000001011111011110",
      "000000000001000011000111001111",
      "000000000000000000000000000000"
    ]
  };

  // src/RuntimeHud.ts
  var LOUNGE_OFFSET = new Vector3(0, -70, 0);
  var WAVE_ALERT_SECONDS = 6;
  var CLOCK_WARNING_SECONDS = 30;
  var GOLD = new Color(1, 0.78, 0.2, 1);
  var TEAL = new Color(0.2, 0.85, 0.8, 1);
  var PLUM = new Color(0.62, 0.38, 0.85, 1);
  var DIM = new Color(0.25, 0.28, 0.32, 1);
  var AMBER = new Color(1, 0.55, 0.1, 1);
  var CLIP_ALERT = 0;
  var CLIP_ALARM = 1;
  var ENTRY_POINT = new Vector2(6, -57.6);
  var HOLD_MARGIN = 0.35;
  function parseVector(text, fallback) {
    const parts = (text ?? "").trim().split(/\s+/).map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? new Vector3(parts[0], parts[1], parts[2]) : fallback;
  }
  function compass(from, to) {
    const d = to.sub(from);
    if (d.magnitude < 0.5) return "here";
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const angle = Math.atan2(d.x, d.y) * 180 / Math.PI;
    return names[(Math.round(angle / 45) + 8) % 8];
  }
  function seconds(value) {
    return `${Math.max(0, Math.ceil(value))}s`;
  }
  var RuntimeHud = class extends Behaviour {
    constructor() {
      super(...arguments);
      // ---- from bindings.json -------------------------------------------------------------------------------------
      __publicField(this, "hubText");
      __publicField(this, "musterText");
      __publicField(this, "loungeText");
      __publicField(this, "panelText");
      __publicField(this, "voteLabels", []);
      __publicField(this, "personalPanel", null);
      __publicField(this, "shell", null);
      __publicField(this, "bodies", []);
      __publicField(this, "botMarkers", []);
      __publicField(this, "consoles", []);
      /** The jobs-done bars (the hub board's and the personal panel's): fills scaled along x from their left end. */
      __publicField(this, "jobBars", []);
      /** The personal panel's work bar: how far the job (or reset) in hand has got, as this client sees it. */
      __publicField(this, "workBar", null);
      /** The timing band drawn on the work bar while a timing job sweeps. */
      __publicField(this, "workBand", null);
      /** Turned to face this player while a muster runs. */
      __publicField(this, "musterBoard", null);
      __publicField(this, "creditsPanel", null);
      /** The station's drawn parts, a region of the map each (columns x rows over the play bounds, row by row from the south-west). */
      __publicField(this, "regions", []);
      __publicField(this, "regionGrid", [region_pvs_default.cols, region_pvs_default.rows]);
      // ---- local state --------------------------------------------------------------------------------------------
      __publicField(this, "settings");
      __publicField(this, "match");
      __publicField(this, "dealer");
      __publicField(this, "origin", Vector3.zero);
      __publicField(this, "yaw", 0);
      __publicField(this, "lounge", Vector3.zero);
      __publicField(this, "held", 0);
      __publicField(this, "edges", []);
      __publicField(this, "seq", 0);
      __publicField(this, "sealing", false);
      __publicField(this, "useLatched", false);
      /** A console click on a hold job (or a reset) lets Use go at this local time (0: no). */
      __publicField(this, "autoReleaseAt", 0);
      /** Local time Use last went down, and the taps counted at one console (the work bar). */
      __publicField(this, "useDownAt", 0);
      __publicField(this, "tapStation", -1);
      __publicField(this, "taps", 0);
      __publicField(this, "lastWork", -1);
      __publicField(this, "creditsOpen", false);
      __publicField(this, "lastRegionCheck", -1);
      /** What the local effects were last applied for. */
      __publicField(this, "applied", { round: -1, state: MatchState.Lobby, alive: true, inMatch: false, placedRound: -1, slot: -1 });
      __publicField(this, "returnPoint", null);
      __publicField(this, "lastObserverCheck", 0);
      __publicField(this, "lastSecret", null);
      __publicField(this, "waveAlertUntil", 0);
      __publicField(this, "lastHeadSent", null);
      __publicField(this, "lastCutIn", 0);
      /** Teleports this client made, in map units (tests read them). */
      __publicField(this, "moves", []);
      /** The texts as last set (tests read them). */
      __publicField(this, "texts", { hub: "", muster: "", lounge: "", panel: "" });
    }
    Start() {
      this.settings = readSettings(this.Settings);
      this.match = this.FindBehaviour("match");
      this.dealer = this.FindBehaviour("dealer");
      this.origin = parseVector(this.Settings.get("position"), Vector3.zero);
      this.yaw = parseVector(this.Settings.get("rotation"), Vector3.zero).y;
      this.lounge = parseVector(this.Settings.get("observer-position"), this.origin.add(LOUNGE_OFFSET));
      this.dealer.onMine = (secret) => {
        this.OnSecret(secret);
        this.Refresh();
      };
      this.match.onChanged = () => this.Refresh();
      this.Refresh();
    }
    // ---- coordinates --------------------------------------------------------------------------------------------
    /** Map units (x right, y up the map) to the world (x, z), with the snippet's position and Y rotation. */
    ToWorld(p, height = 0) {
      const local = Quaternion.Euler(0, this.yaw, 0).rotate(new Vector3(p.x, 0, p.y));
      return new Vector3(this.origin.x + local.x, this.origin.y + height, this.origin.z + local.z);
    }
    ToMap(w) {
      const local = Quaternion.Euler(0, -this.yaw, 0).rotate(new Vector3(w.x - this.origin.x, 0, w.z - this.origin.z));
      return new Vector2(local.x, local.z);
    }
    /** The local player's position in map units, or null before the page knows it. */
    MyMapPosition() {
      const w = this.Input.Position;
      return w ? this.ToMap(w) : null;
    }
    InsideStation(w) {
      if (w.y < this.origin.y - 3 || w.y > this.origin.y + 8) return false;
      const p = this.ToMap(w);
      return [...STATION.RoomBounds, ...STATION.Corridors].some((r) => p.x >= r.xMin - 1 && p.x <= r.xMax + 1 && p.y >= r.yMin - 1 && p.y <= r.yMax + 1);
    }
    Teleport(why, at, faceToward = null, world = null) {
      const target = world ?? this.ToWorld(at);
      let yawDeg = this.yaw;
      if (faceToward) {
        const d = faceToward.sub(at);
        yawDeg = this.yaw + Math.atan2(d.x, d.y) * 180 / Math.PI;
      }
      this.moves.push({ why, at: world ? this.ToMap(world) : at.clone() });
      this.Input.TeleportTo(target, yawDeg, true);
    }
    Lock(locked) {
      this.Input.SetAbility("Move", !locked);
    }
    // ---- who am I -----------------------------------------------------------------------------------------------
    get M() {
      return this.match?.m ?? emptyMatch();
    }
    /** The local player's slot on the current roster, or -1. */
    MySlot() {
      return this.match.SlotOf(this.Networking.LocalPlayer.uid);
    }
    /** The sealed entry, if it belongs to this match. */
    Mine() {
      const s = this.dealer.mine;
      return s && s.n === this.M.r ? s : null;
    }
    MyRole() {
      const m = this.M;
      const slot = this.MySlot();
      if (slot >= 0 && m.ro.length) return m.ro[slot];
      return this.Mine()?.r ?? Role.Unassigned;
    }
    Link() {
      return this.PlayerBehaviour(this.Networking.LocalPlayer, "link");
    }
    get Joined() {
      return (this.Link()?.j ?? 0) > 0;
    }
    Active(m) {
      return m.st === MatchState.Playing || m.st === MatchState.Muster;
    }
    // ---- input --------------------------------------------------------------------------------------------------
    /** A logical button went down (true) or up. `arg` is the vote target or the hatch index. */
    Press(button, down, arg = 0) {
      const bit = 1 << button;
      if (button === Btn.Use && down && (this.held & bit) === 0) {
        this.useDownAt = this.Time.time;
        this.CountTap();
      }
      if (button === Btn.Use && !down) this.autoReleaseAt = 0;
      if (down) this.held |= bit;
      else this.held &= ~bit;
      const m = this.M;
      if (!this.Active(m) || this.MySlot() < 0) return;
      this.edges.push([button, down ? 1 : 0, this.match.Rel(), arg]);
      if (this.edges.length > 32) this.edges.splice(0, this.edges.length - 32);
    }
    OnKeyPressed(key) {
      switch (key) {
        case "E":
          this.Press(Btn.Use, true);
          break;
        case "Q":
          this.Press(Btn.Eliminate, true);
          this.Press(Btn.Eliminate, false);
          break;
        case "R":
          this.Press(Btn.Alarm, true);
          this.Press(Btn.Alarm, false);
          break;
        case "F":
          this.Press(Btn.Fault, true);
          this.Press(Btn.Fault, false);
          break;
        case "V":
          this.UseHatch();
          break;
        default:
          break;
      }
    }
    OnKeyReleased(key) {
      if (key === "E") this.Press(Btn.Use, false);
    }
    /** VR: right A uses, right B raises the alarm, left X eliminates, left Y works a hatch or a fault panel. */
    OnButtonPressed(button, side) {
      if (side === 1 && button === 2) this.Press(Btn.Use, true);
      else if (side === 1 && button === 3) this.Tap(Btn.Alarm);
      else if (side === 0 && button === 2) this.Tap(Btn.Eliminate);
      else if (side === 0 && button === 3) {
        const here = this.MyMapPosition();
        const hatch = here ? STATION.NearestHatch(here) : null;
        if (hatch && hatch.distance <= this.settings.hatchRange) this.UseHatch();
        else this.Tap(Btn.Fault);
      }
    }
    OnButtonReleased(button, side) {
      if (side === 1 && button === 2) this.Press(Btn.Use, false);
    }
    Tap(button, arg = 0) {
      this.Press(button, true, arg);
      this.Press(button, false, arg);
    }
    /**
     * The hatch: the local client knows its own role and the map, so it makes the trip itself and says so in the beat
     * (upstream TryUseVent moved the player on the host). The referee checks the trip.
     */
    UseHatch() {
      const m = this.M;
      const slot = this.MySlot();
      const here = this.MyMapPosition();
      if (m.st !== MatchState.Playing || slot < 0 || !here || m.al[slot] !== 1 || m.ci > 0) {
        this.Tap(Btn.Hatch, -1);
        return;
      }
      const near = STATION.NearestHatch(here);
      if (this.MyRole() !== Role.Saboteur || !near || near.distance > this.settings.hatchRange) {
        this.Tap(Btn.Hatch, -1);
        return;
      }
      const next = STATION.GetNextHatch(near.hatch);
      this.Tap(Btn.Hatch, near.hatch.Index);
      this.Teleport("hatch", STATION.ClampToWalkable(next.Position, 0.5));
    }
    // Panel and board buttons (bindings.json events).
    ClickUse() {
      this.useLatched = !this.useLatched;
      this.Press(Btn.Use, this.useLatched);
    }
    ClickEliminate() {
      this.Tap(Btn.Eliminate);
    }
    ClickAlarm() {
      this.Tap(Btn.Alarm);
    }
    ClickFault() {
      this.Tap(Btn.Fault);
    }
    ClickHatch() {
      this.UseHatch();
    }
    ClickAbstain() {
      this.Vote(ABSTAIN);
    }
    ClickVote0() {
      this.Vote(1);
    }
    ClickVote1() {
      this.Vote(2);
    }
    ClickVote2() {
      this.Vote(3);
    }
    ClickVote3() {
      this.Vote(4);
    }
    ClickVote4() {
      this.Vote(5);
    }
    ClickVote5() {
      this.Vote(6);
    }
    ClickVote6() {
      this.Vote(7);
    }
    ClickVote7() {
      this.Vote(8);
    }
    ClickVote8() {
      this.Vote(9);
    }
    ClickVote9() {
      this.Vote(10);
    }
    /** The vote board's button for roster slot n-1 (player number n), or Abstain (-1). */
    Vote(playerNumber) {
      if (this.M.st !== MatchState.Muster) return;
      this.Tap(Btn.Vote, playerNumber);
    }
    /** A click on a station object (StationButton): consoles, fault panels, the post, markers, the boarding pad. */
    ClickStation(kind, index) {
      switch (kind) {
        case "job":
          this.ClickConsole(index);
          break;
        case "panel":
          this.ClickFaultPanel();
          break;
        case "post":
          this.Tap(Btn.Use);
          break;
        case "body":
          this.Tap(Btn.Alarm);
          break;
        case "bot":
          this.Tap(Btn.Eliminate);
          break;
        case "board":
          this.Board();
          break;
        case "leave":
          this.Leave();
          break;
        case "credits":
          this.creditsOpen = !this.creditsOpen;
          this.creditsPanel?.SetActive(this.creditsOpen);
          break;
        default:
          break;
      }
    }
    /**
     * A console: Use as the job's kind needs it, so a click works a job the way the key does. Hold: down, and let go
     * once the hold is done; tap: one press; timing: the first click starts the sweep, the second lets go (inside the
     * band to finish it). The rules pick the nearest assigned job in range, as they do for the key.
     */
    ClickConsole(index) {
      const station = STATION.JobStations[index];
      if (!station) return;
      const held = (this.held & 1 << Btn.Use) !== 0;
      if (station.Kind === JobKind.Tap) {
        if (held) this.Press(Btn.Use, false);
        this.Tap(Btn.Use);
      } else if (station.Kind === JobKind.Timing) {
        this.Press(Btn.Use, !held);
      } else if (!held) {
        this.Press(Btn.Use, true);
        this.autoReleaseAt = this.Time.time + this.settings.holdSeconds + HOLD_MARGIN;
      } else {
        this.Press(Btn.Use, false);
      }
      this.useLatched = false;
    }
    /** A fault panel: the saboteur starts a fault there; a technician holds Use to reset it (2 s). */
    ClickFaultPanel() {
      if (this.MyRole() === Role.Saboteur) {
        this.Tap(Btn.Fault);
        return;
      }
      if ((this.held & 1 << Btn.Use) !== 0) {
        this.Press(Btn.Use, false);
        return;
      }
      this.Press(Btn.Use, true);
      this.autoReleaseAt = this.Time.time + this.settings.resetSeconds + HOLD_MARGIN;
      this.useLatched = false;
    }
    ClickCredits() {
      this.ClickStation("credits", 0);
    }
    ClickLeave() {
      this.Leave();
    }
    /** The boarding pad outside the station: into the Commons, beside the hub board. */
    Board() {
      const n = STATION.SpawnPoints.length;
      const spot = STATION.GetSpawnPoint(Math.min(n - 1, Math.floor(this.Random.Range(0, n))), Vector2.zero);
      this.Teleport("board", spot, STATION.MeetingPoint);
    }
    /** "Leave the station" on the hub board: out to the boarding pad, unless the player is alive in a running match. */
    Leave() {
      const slot = this.MySlot();
      if (slot >= 0 && this.Active(this.M) && this.M.al[slot] === 1) return;
      this.Teleport("leave", ENTRY_POINT, new Vector2(ENTRY_POINT.x, ENTRY_POINT.y + 5));
    }
    ClickJoin() {
      const link = this.Link();
      if (!link) return;
      const m = this.M;
      const slot = this.MySlot();
      if (link.j > 0 && slot >= 0 && this.Active(m)) return;
      const on = link.j === 0;
      link.SetJoined(on);
      this.Networking.SetRefereeCandidate(on);
      this.Refresh();
    }
    ClickStart() {
      if (this.M.st === MatchState.Lobby) this.match.RequestStart();
    }
    ClickAbort() {
      if (this.M.st !== MatchState.Lobby) this.match.RequestAbort();
    }
    // ---- every tick ---------------------------------------------------------------------------------------------
    Update() {
      const m = this.M;
      const slot = this.MySlot();
      if (slot >= 0 && this.Active(m) && this.Joined) this.Networking.SetRefereeCandidate(true);
      if (this.autoReleaseAt > 0 && this.Time.time >= this.autoReleaseAt) this.Press(Btn.Use, false);
      this.Effects(m, slot);
      this.WorkBar(m, slot);
      this.Regions();
      if (this.Time.frameCount % BEAT_TICKS === 0) {
        void this.SendBeat(m, slot);
        this.Refresh();
      }
      this.FollowHead();
    }
    /** The sealed beat, on the fixed schedule, from every rostered person for the whole match. */
    async SendBeat(m, slot) {
      if (!this.Active(m) || slot < 0 || m.sl[slot].b === 1 || this.sealing) return;
      const referee = this.Networking.Master;
      const link = this.Link();
      if (!referee || referee.sid !== m.d || !link || !this.Secrets.canSealFor(referee.sid)) return;
      const rel = this.match.Rel();
      this.edges = this.edges.filter((e) => e[2] >= rel - EDGE_WINDOW);
      const here = this.MyMapPosition() ?? new Vector2(m.sp[slot]?.[0] ?? 0, m.sp[slot]?.[1] ?? 0);
      const text = encodeBeat({ m: m.r, q: ++this.seq, t: rel, p: [here.x, here.y], h: this.held, e: this.edges });
      this.sealing = true;
      try {
        const box = await this.Secrets.seal(referee.sid, text);
        link.SendBeat(box);
      } catch {
      } finally {
        this.sealing = false;
      }
    }
    /** The local player's body follows the match: start, muster ring and back, lounge, locks (PORT.md 5.8, 5.10). */
    Effects(m, slot) {
      const a = this.applied;
      const inMatch = slot >= 0 && m.st !== MatchState.Lobby && m.sl[slot]?.b !== 1;
      const alive = inMatch && m.al[slot] === 1;
      if (inMatch && m.st === MatchState.Playing && a.placedRound !== m.r) {
        a.placedRound = m.r;
        const placed = this.Storage.get("placed", "");
        if (placed !== `${m.t0}:${slot}`) {
          this.Storage.set("placed", `${m.t0}:${slot}`);
          if (alive) this.Teleport("start", new Vector2(m.sp[slot][0], m.sp[slot][1]), STATION.MeetingPoint);
        }
        this.seq = 0;
        this.edges = [];
        this.Lock(false);
      }
      if (inMatch && a.alive && !alive && a.round === m.r) {
        this.ToLounge(slot);
      }
      if (m.st === MatchState.Muster && a.state !== MatchState.Muster && alive) {
        this.returnPoint = this.MyMapPosition();
        const index = Math.max(0, m.ring.indexOf(slot));
        const at = RingPosition(index, m.ring.length || 1);
        this.Teleport("ring", at, STATION.MeetingPoint);
        this.Lock(true);
      }
      if (a.state === MatchState.Muster && m.st === MatchState.Playing && m.r === a.round) {
        if (alive) {
          if (this.settings.returnAfterMuster && this.returnPoint) this.Teleport("return", this.returnPoint);
          this.Lock(false);
        }
        this.returnPoint = null;
      }
      if (inMatch && (m.ci > 0 || m.st === MatchState.Ended)) this.Lock(true);
      if (m.ci > 0 && this.lastCutIn !== m.r) {
        this.lastCutIn = m.r;
        this.Host.playClip("speaker", CLIP_ALARM);
      }
      if (m.st === MatchState.Lobby && a.state !== MatchState.Lobby) {
        this.Lock(false);
        const w = this.Input.Position;
        if (a.inMatch || w && Vector3.Distance(w, this.lounge) < 20) {
          const spot = STATION.GetSpawnPoint(Math.max(0, a.slot), Vector2.zero);
          this.Teleport("hub", spot, STATION.MeetingPoint);
        }
        this.returnPoint = null;
      }
      if (m.st !== MatchState.Lobby && !alive) {
        const now = this.Time.time;
        if (now - this.lastObserverCheck >= 1) {
          this.lastObserverCheck = now;
          const w = this.Input.Position;
          if (w && this.InsideStation(w)) this.ToLounge(slot);
        }
      }
      a.round = m.r;
      a.state = m.st;
      a.alive = alive;
      a.inMatch = inMatch;
      if (slot >= 0) a.slot = slot;
    }
    ToLounge(slot) {
      const spot = this.lounge.add(new Vector3((Math.max(0, slot) % 5 - 2) * 1.5, 0, slot >= 5 ? 1.5 : -1.5));
      this.Teleport("lounge", Vector2.zero, null, spot);
      this.Lock(false);
    }
    /** The personal panel floats below the head, and the blackout shell sits round it. Sent only when it moved. */
    FollowHead() {
      const head = this.Input.Poses?.head ?? null;
      const w = head ? head.position : this.Input.Position;
      if (!w) return;
      if (this.lastHeadSent && Vector3.Distance(this.lastHeadSent, w) < 0.05) return;
      this.lastHeadSent = w.clone();
      const forward = head ? head.rotation.rotate(Vector3.forward) : Vector3.forward;
      const flat = new Vector3(forward.x, 0, forward.z).normalized;
      if (this.personalPanel) {
        const yaw = Math.atan2(flat.x, flat.z) * 180 / Math.PI;
        this.personalPanel.transform.SetPositionAndRotation(w.add(flat.scale(0.55)).add(new Vector3(0, -0.35, 0)), Quaternion.Euler(25, yaw, 0));
      }
      if (this.shell) this.shell.transform.position = w.clone();
    }
    OnSecret(secret) {
      const before = this.lastSecret;
      this.lastSecret = secret;
      if (before && before.n === secret.n && secret.l >= 0 && secret.l !== before.l) {
        this.waveAlertUntil = this.Time.time + WAVE_ALERT_SECONDS;
        this.Host.playClip("speaker", CLIP_ALERT);
      }
    }
    // ---- what the boards show -----------------------------------------------------------------------------------
    /** Rewrites every text and marker from the public match and the local secret. Text is sent only when it changed. */
    Refresh() {
      if (!this.match) return;
      const m = this.M;
      const slot = this.MySlot();
      const rel = this.match.Rel();
      this.texts.hub = this.HubText(m, rel);
      this.texts.lounge = this.LoungeText(m, rel);
      this.texts.muster = this.MusterText(m, rel);
      this.texts.panel = this.PanelText(m, slot, rel);
      this.hubText.text = this.texts.hub;
      this.loungeText.text = this.texts.lounge;
      this.musterText.text = this.texts.muster;
      this.panelText.text = this.texts.panel;
      for (let i = 0; i < this.voteLabels.length; i++) {
        const s = m.sl[i];
        const canPick = m.st === MatchState.Muster && s && m.al[i] === 1 && m.gn[i] !== 1;
        this.voteLabels[i].text = canPick ? s.n : "";
      }
      this.Markers(m, slot);
    }
    /** The roster as everyone may see it. D4: a player shows as down only once that has been announced. */
    RosterLine(m, i) {
      const s = m.sl[i];
      let state;
      if (m.st === MatchState.Ended) state = ROLE_NAMES[m.ro[i] ?? 0].toLowerCase();
      else if (m.gn[i] === 1) state = "left";
      else if (m.al[i] === 1 || m.sd[i] !== 1) state = m.st === MatchState.Muster ? m.vo[i] === 1 ? "voted" : "voting" : "on shift";
      else state = m.bd[i] ? "down" : "locked out";
      return `${s.n}${s.b ? " (bot)" : ""}: ${state}`;
    }
    ClockLine(m, rel) {
      if (m.ci > 0) return "SHIFT OVER";
      if (m.dl <= 0) return "";
      const left = m.dl - rel;
      return `${left <= CLOCK_WARNING_SECONDS ? "!! " : ""}Shift clock: ${seconds(left)}`;
    }
    HubText(m, rel) {
      const lines = ["HIDDEN ROLE  -  station shift"];
      if (m.st === MatchState.Lobby) {
        const lobby = this.match.Lobby();
        const bots = Math.min(this.settings.bots, this.settings.maxPlayers - Math.min(lobby.length, this.settings.maxPlayers));
        lines.push(`Lobby: ${lobby.length} of ${this.settings.maxPlayers}${bots ? ` + ${bots} bot(s)` : ""} (need ${this.settings.minPlayers})`);
        lobby.slice(0, this.settings.maxPlayers).forEach((p, i) => lines.push(`${i + 1}. ${p.displayName}`));
        if (lobby.length > this.settings.maxPlayers) lines.push(`waiting: ${lobby.length - this.settings.maxPlayers}`);
        if (!this.Networking.Master) lines.push("Press Join to play.");
        if (m.nt === "void-referee") lines.push("The last match was void: its referee left.");
        if (m.nt === "aborted") lines.push("The last match was stopped.");
        if (m.last) {
          lines.push(`Last match: ${TEAM_NAMES[m.last.w]} won.`);
          lines.push(m.last.n.map((n, i) => `${n} (${ROLE_NAMES[m.last.ro[i] ?? 0]})`).join(", "));
        }
        return lines.join("\n");
      }
      if (m.st === MatchState.Ended) {
        lines.push(`${TEAM_NAMES[m.w]} win.`);
      } else {
        lines.push(this.ClockLine(m, rel));
        lines.push(`Jobs done: ${m.cd} / ${m.ct}`);
        if (m.fk) lines.push(`FAULT: ${FAULT_NAMES[m.fk]}${m.fe > 0 ? ` ${seconds(m.fe - rel)}` : ""}`);
      }
      for (let i = 0; i < m.sl.length; i++) lines.push(this.RosterLine(m, i));
      return lines.filter((l) => l !== "").join("\n");
    }
    LoungeText(m, rel) {
      if (m.st === MatchState.Lobby) return "Observer lounge\nNo match is running.";
      const lines = ["Observer lounge", "You are out of the match: watch from here.", this.ClockLine(m, rel), `Jobs done: ${m.cd} / ${m.ct}`];
      if (m.st === MatchState.Muster) lines.push(`Muster: ${seconds(m.me - rel)} left`);
      if (m.st === MatchState.Ended) lines.push(`${TEAM_NAMES[m.w]} win.`);
      for (let i = 0; i < m.sl.length; i++) lines.push(this.RosterLine(m, i));
      return lines.filter((l) => l !== "").join("\n");
    }
    MusterText(m, rel) {
      const an = m.an;
      if (an[0] === Announcement.MusterResult && an[3] > rel) {
        const who = an[1] >= 0 ? m.sl[an[1]]?.n : null;
        return who ? `${who} was locked out.
They were a ${ROLE_NAMES[an[2]].toLowerCase()}.` : "Nobody was locked out.";
      }
      if (m.st !== MatchState.Muster) return "Muster board";
      const caller = m.sl[m.mr]?.n ?? "Someone";
      const head = m.mb >= 0 ? `ALARM: ${caller} found ${m.sl[m.mb]?.n ?? "someone"} down.` : `MUSTER called by ${caller}.`;
      const lines = [head, `Vote: ${seconds(m.me - rel)} left`];
      for (let i = 0; i < m.sl.length; i++) {
        if (m.al[i] !== 1 || m.gn[i] === 1) continue;
        lines.push(`${m.sl[i].n}: ${m.vo[i] === 1 ? "voted" : "..."}`);
      }
      return lines.join("\n");
    }
    PanelText(m, slot, rel) {
      if (m.st === MatchState.Lobby) {
        return this.Joined ? "You are in the lobby.\nStart when enough have joined." : "Not in the lobby.\nPress Join on the hub board.";
      }
      if (slot < 0) return "Observing this match.\nJoin the lobby for the next one.";
      const role = this.MyRole();
      const mine = this.Mine();
      const lines = [];
      if (m.st === MatchState.Ended) {
        lines.push(`${TEAM_NAMES[m.w]} win.`, `You were a ${ROLE_NAMES[role].toLowerCase()}.`);
        return lines.join("\n");
      }
      lines.push(role === Role.Unassigned ? "Waiting for your role..." : `You are a ${ROLE_NAMES[role].toUpperCase()}`);
      if (role === Role.Saboteur && mine && mine.f.length) lines.push(`With: ${mine.f.map((s) => m.sl[s]?.n ?? "?").join(", ")}`);
      lines.push(this.ClockLine(m, rel));
      if (m.al[slot] !== 1) {
        lines.push("You are out. Watch from the lounge.");
        return lines.filter((l) => l !== "").join("\n");
      }
      if (this.waveAlertUntil > this.Time.time) lines.push("NEW JOB ASSIGNED");
      if (m.fk) lines.push(`FAULT: ${FAULT_NAMES[m.fk]}${m.fe > 0 ? ` ${seconds(m.fe - rel)}` : ""}${role === Role.Technician ? " - reset it at its panel" : ""}`);
      const here = this.MyMapPosition();
      if (mine && here) {
        const open = STATION.JobStations.filter((s) => (mine.a & 1 << s.Id) !== 0 && (mine.c & 1 << s.Id) === 0).map((s) => ({ s, d: Dist(here, s.Position) })).sort((a, b) => a.d - b.d);
        lines.push(role === Role.Saboteur ? `Cover jobs (${open.length} left):` : `Jobs (${open.length} left):`);
        for (const { s, d } of open.slice(0, 7)) lines.push(`${compass(here, s.Position)} ${s.Name} (${JOB_KIND_NAMES[s.Kind]}) - ${s.Room ? STATION.Rooms.find((r) => r.Id === s.Room)?.Name : ""} ${d.toFixed(0)} m`);
        if (open.length > 7) lines.push(`+${open.length - 7} more`);
        const near = open[0];
        if (near && near.d <= this.settings.jobRange + 0.15 && m.fk !== Fault.Jam) lines.push(this.JobHint(near.s.Kind));
        if (role === Role.Saboteur) {
          const k = mine.k - rel;
          lines.push(k > 0 ? `Eliminate: ${seconds(k)}` : "Eliminate: ready (Q)");
          const s = mine.s - rel;
          lines.push(m.fk ? "Fault: one is running" : s > 0 ? `Fault: ${seconds(s)}` : "Fault: ready (F at a panel)");
          const hatch = STATION.NearestHatch(here);
          if (hatch) lines.push(`Hatch: ${hatch.distance.toFixed(1)} m${hatch.distance <= this.settings.hatchRange ? " (V)" : ""}`);
        }
        const post = Dist(here, STATION.MeetingPoint);
        if (post <= this.settings.musterRange + 0.3) lines.push(m.er > rel ? `Muster post: ${seconds(m.er - rel)}` : m.fk ? "Muster post: blocked by the fault" : "Muster post: ready (E)");
        lines.push(`In: ${STATION.GetRoomName(here)}`);
      }
      return lines.filter((l) => l !== "").join("\n");
    }
    JobHint(kind) {
      const held = (this.held & 1 << Btn.Use) !== 0;
      if (kind === JobKind.Hold) return held ? "Holding..." : "Hold E for the job";
      if (kind === JobKind.Tap) return `Tap E ${this.settings.tapCount} times`;
      return `Release E inside the band (${Math.round(this.settings.timingBand[0] * 100)}-${Math.round(this.settings.timingBand[1] * 100)}%)`;
    }
    /** Bodies and bots for everyone; consoles and the blackout shell for the local player only. */
    Markers(m, slot) {
      const done = this.Active(m) || m.st === MatchState.Ended ? m.ct > 0 ? Math.min(1, m.cd / m.ct) : 0 : 0;
      for (const bar of this.jobBars) this.SetFill(bar, done);
      if (this.musterBoard && m.st === MatchState.Muster) {
        const w = this.Input.Position;
        if (w) {
          const at = this.ToWorld(STATION.MeetingPoint);
          const yaw = Math.atan2(at.x - w.x, at.z - w.z) * 180 / Math.PI;
          const want = Math.round(yaw / 5) * 5;
          if (Math.abs(this.musterBoard.transform.eulerAngles.y - want) > 0.5) this.musterBoard.transform.rotation = Quaternion.Euler(0, want, 0);
        }
      }
      for (let i = 0; i < this.bodies.length; i++) {
        const b = m.st !== MatchState.Lobby ? m.bd[i] : 0;
        const body = this.bodies[i];
        if (b) body.transform.position = this.ToWorld(new Vector2(b[0], b[1]), 0.05);
        if (body.activeSelf !== !!b) body.SetActive(!!b);
      }
      const botSlots = m.sl.map((s, i) => s.b ? i : -1).filter((i) => i >= 0);
      for (let i = 0; i < this.botMarkers.length; i++) {
        const at = botSlots[i] !== void 0 && m.st !== MatchState.Lobby ? m.bp[botSlots[i]] : 0;
        const bot = this.botMarkers[i];
        if (at) bot.transform.position = this.ToWorld(new Vector2(at[0], at[1]));
        if (bot.activeSelf !== !!at) bot.SetActive(!!at);
      }
      const mine = this.Mine();
      const role = this.MyRole();
      const here = this.MyMapPosition();
      const alive = slot >= 0 && m.al[slot] === 1 && this.Active(m);
      let nearest = -1;
      if (mine && here && alive) {
        let best = Infinity;
        for (const s of STATION.JobStations) {
          if ((mine.a & 1 << s.Id) === 0 || (mine.c & 1 << s.Id) !== 0) continue;
          const d = Dist(here, s.Position);
          if (d < best) {
            best = d;
            nearest = s.Id;
          }
        }
      }
      for (let i = 0; i < this.consoles.length; i++) {
        const own = !!mine && alive && (mine.a & 1 << i) !== 0 && (mine.c & 1 << i) === 0;
        const inRange = own && here && Dist(here, STATION.JobStations[i].Position) <= this.settings.jobRange;
        const color = !own ? DIM : inRange ? GOLD : role === Role.Saboteur ? PLUM : i === nearest ? AMBER : TEAL;
        this.Host.setColor(this.consoles[i].key, "_BaseColor", color);
      }
      const blackout = alive && m.fk === Fault.Blackout && role === Role.Technician;
      const radius = blackout ? this.settings.blackoutVision : alive && this.settings.visionRange > 0 ? this.settings.visionRange : 0;
      if (this.shell) {
        if (radius > 0) this.shell.transform.localScale = new Vector3(radius * 2, radius * 2, radius * 2);
        if (this.shell.activeSelf !== radius > 0) this.shell.SetActive(radius > 0);
      }
    }
    /**
     * Draws only the regions of the station that can be seen from the local player's region (a kit cannot carry baked
     * occlusion data, so the visible sets are worked out ahead by tools/sightlines.ts: src/region-pvs.json). Every region
     * before the page knows where the player is and from outside the station; none from the lounge.
     */
    Regions() {
      if (!this.regions.length || this.Time.time - this.lastRegionCheck < 0.5) return;
      this.lastRegionCheck = this.Time.time;
      const w = this.Input.Position;
      const [cols, rows] = [this.regionGrid[0] ?? 4, this.regionGrid[1] ?? 3];
      const b = STATION.PlayBounds;
      const p = w ? this.ToMap(w) : null;
      const below = !!w && w.y < this.origin.y - 20;
      const grid = cols === region_pvs_default.cols && rows === region_pvs_default.rows;
      let from = -1;
      if (p && grid && this.InsideStation(w)) {
        const cx = Math.min(cols - 1, Math.max(0, Math.floor((p.x - b.xMin) / b.width * cols)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor((p.y - b.yMin) / b.height * rows)));
        from = cy * cols + cx;
      }
      for (let i = 0; i < this.regions.length; i++) {
        const on = below ? false : from < 0 ? true : region_pvs_default.visible[from][i] === "1";
        const region = this.regions[i];
        if (region.activeSelf !== on) region.SetActive(on);
      }
    }
    /** How many regions are drawn now (tests). */
    get RegionsOn() {
      return this.regions.filter((r) => r.activeSelf).length;
    }
    /** A bar's fill, scaled along x from its left end (0 hides it). */
    SetFill(fill, amount) {
      const x = Math.round(Math.max(0, Math.min(1, amount)) * 100) / 100;
      if (Math.abs(fill.transform.localScale.x - Math.max(x, 1e-3)) > 4e-3) fill.transform.localScale = new Vector3(Math.max(x, 1e-3), 1, 1);
      if (fill.activeSelf !== x > 0) fill.SetActive(x > 0);
    }
    CountTap() {
      const here = this.MyMapPosition();
      const near = here ? this.NearestOpenJob(here) : null;
      const id = near && near.d <= this.settings.jobRange + this.settings.rangeSlack ? near.s.Id : -1;
      if (id !== this.tapStation) {
        this.tapStation = id;
        this.taps = 0;
      }
      if (id >= 0) this.taps++;
    }
    NearestOpenJob(here) {
      const mine = this.Mine();
      if (!mine) return null;
      let best = null;
      for (const s of STATION.JobStations) {
        if ((mine.a & 1 << s.Id) === 0 || (mine.c & 1 << s.Id) !== 0) continue;
        const d = Dist(here, s.Position);
        if (!best || d < best.d) best = { s, d };
      }
      return best;
    }
    /**
     * The work bar on the personal panel: how far the job in hand has got, worked out here from this player's own
     * input (the referee's count is not published). Hold: time held over the hold time; tap: presses at this console
     * over the count; timing: the sweep, with the band drawn; a reset at a fault panel: time held over 2 s.
     */
    WorkBar(m, slot) {
      let amount = 0;
      let band = false;
      const here = this.MyMapPosition();
      const alive = slot >= 0 && m.st === MatchState.Playing && m.al[slot] === 1;
      const held = (this.held & 1 << Btn.Use) !== 0;
      const now = this.Time.time;
      if (alive && here) {
        const reach = this.settings.rangeSlack;
        const panel = m.fk ? STATION.PanelFor(m.fk) : null;
        if (panel && this.MyRole() === Role.Technician && Dist(here, panel.Position) <= this.settings.faultRange + reach) {
          amount = held ? (now - this.useDownAt) / this.settings.resetSeconds : 0;
        } else if (m.fk !== Fault.Jam) {
          const near = this.NearestOpenJob(here);
          if (near && near.d <= this.settings.jobRange + reach) {
            if (near.s.Kind === JobKind.Hold) amount = held ? (now - this.useDownAt) / this.settings.holdSeconds : 0;
            else if (near.s.Kind === JobKind.Tap) amount = this.tapStation === near.s.Id ? this.taps / this.settings.tapCount : 0;
            else {
              band = true;
              const cycle = Math.max(0.5, this.settings.timingCycleSeconds);
              amount = held ? (now - this.useDownAt) % cycle / cycle : 0;
            }
          }
        }
      }
      const shown = Math.round(Math.min(1, amount) * 50) / 50;
      if (shown !== this.lastWork) {
        this.lastWork = shown;
        if (this.workBar) this.SetFill(this.workBar, shown);
      }
      if (this.workBand && this.workBand.activeSelf !== band) this.workBand.SetActive(band);
    }
    /** The work bar's fill as last sent (tests). */
    get WorkAmount() {
      return Math.max(0, this.lastWork);
    }
    /** True while the blackout shell is up on this client (tests). */
    get BlackoutOn() {
      return !!this.shell && this.shell.activeSelf;
    }
    static TeamWord(team) {
      return team === Team.Saboteurs ? "saboteurs" : "technicians";
    }
  };

  // src/StationButton.ts
  var StationButton = class extends Behaviour {
    constructor() {
      super(...arguments);
      /** What the kit builder says this is (bindings.json fields). */
      __publicField(this, "kind", "job");
      __publicField(this, "index", 0);
      __publicField(this, "hud", null);
    }
    Interact() {
      this.hud?.ClickStation(this.kind, this.index);
    }
  };
  /** A click counts within this many metres of the local head or hands (the rules still check the range). */
  __publicField(StationButton, "interactReach", 3);

  // src/index.ts
  var game = {
    slug: "hidden-role",
    behaviours: { Match, Dealer, RuntimeHud, PlayerLink, StationButton },
    referee: "declared",
    debug: (instance) => debugHooks(instance)
  };
  function debugHooks(instance) {
    const hud = () => instance.behaviour("hud");
    const match = () => instance.behaviour("match");
    return {
      match: () => match().m,
      hud: () => hud().texts,
      me: () => {
        const p = hud().Networking.LocalPlayer;
        return { uid: p.uid, sid: p.sid, name: p.displayName };
      },
      slot: () => hud().MySlot(),
      role: () => hud().MyRole(),
      mine: () => hud().Mine(),
      joined: () => hud().Joined,
      work: () => hud().WorkAmount,
      regionsOn: () => hud().RegionsOn,
      lobby: () => match().Lobby().map((p) => p.uid),
      /** What the HUD last applied its effects for, and where the page thinks the head is (world). */
      applied: () => ({ ...hud().applied, head: hud().Input.Position }),
      events: (kind) => match().history.filter((e) => e.kind === kind).map((e) => ({ t: e.t, actor: e.actor, target: e.target, detail: e.detail })),
      moves: () => hud().moves.map((mv) => ({ why: mv.why, x: mv.at.x, y: mv.at.y })),
      here: () => {
        const p = hud().MyMapPosition();
        return p ? [p.x, p.y] : null;
      },
      toMap: (x, y, z) => {
        const p = hud().ToMap(new Vector3(x, y, z));
        return [p.x, p.y];
      },
      world: (x, y, h = 0) => {
        const w = hud().ToWorld(new Vector2(x, y), h);
        return [w.x, w.y, w.z];
      },
      /** The route a walker takes from (x, y) to (tx, ty): the rules' own steering, a point every few metres. */
      route: (x, y, tx, ty, radius = 0.3) => {
        const points = [];
        let at = new Vector2(x, y);
        const goal = new Vector2(tx, ty);
        for (let i = 0; i < 400 && Vector2.Distance(at, goal) > 0.05; i++) {
          const next = STATION.NextStep(at, goal, radius);
          if (Vector2.Distance(next, at) < 0.01) break;
          points.push([next.x, next.y]);
          at = next;
        }
        return points;
      },
      walkable: (x, y, radius = 0) => !STATION.IsBlocked(new Vector2(x, y), radius),
      job: (id) => {
        const s = STATION.JobStations[id];
        return s ? { id: s.Id, name: s.Name, kind: s.Kind, x: s.Position.x, y: s.Position.y } : null;
      },
      pathOf: (key) => instance.bindings.objects[key]?.path ?? null,
      isReferee: () => match().Networking.IsReferee,
      force: (uids) => {
        match().forcedSaboteurs = uids;
        return match().Networking.IsReferee;
      }
    };
  }
  var src_default = game;

  // bindings.json
  var bindings_default = {
    behaviours: [
      {
        fields: {
          bodies: [
            {
              $obj: "body0"
            },
            {
              $obj: "body1"
            },
            {
              $obj: "body2"
            },
            {
              $obj: "body3"
            },
            {
              $obj: "body4"
            },
            {
              $obj: "body5"
            },
            {
              $obj: "body6"
            },
            {
              $obj: "body7"
            },
            {
              $obj: "body8"
            },
            {
              $obj: "body9"
            }
          ],
          botMarkers: [
            {
              $obj: "bot0"
            },
            {
              $obj: "bot1"
            },
            {
              $obj: "bot2"
            },
            {
              $obj: "bot3"
            },
            {
              $obj: "bot4"
            },
            {
              $obj: "bot5"
            },
            {
              $obj: "bot6"
            },
            {
              $obj: "bot7"
            },
            {
              $obj: "bot8"
            }
          ],
          consoles: [
            {
              $obj: "console0"
            },
            {
              $obj: "console1"
            },
            {
              $obj: "console2"
            },
            {
              $obj: "console3"
            },
            {
              $obj: "console4"
            },
            {
              $obj: "console5"
            },
            {
              $obj: "console6"
            },
            {
              $obj: "console7"
            },
            {
              $obj: "console8"
            },
            {
              $obj: "console9"
            },
            {
              $obj: "console10"
            },
            {
              $obj: "console11"
            },
            {
              $obj: "console12"
            },
            {
              $obj: "console13"
            },
            {
              $obj: "console14"
            },
            {
              $obj: "console15"
            },
            {
              $obj: "console16"
            },
            {
              $obj: "console17"
            },
            {
              $obj: "console18"
            },
            {
              $obj: "console19"
            },
            {
              $obj: "console20"
            },
            {
              $obj: "console21"
            }
          ],
          creditsPanel: {
            $obj: "creditsPanel"
          },
          hubText: {
            $comp: "hubText",
            kind: "TMP"
          },
          jobBars: [
            {
              $obj: "fill"
            },
            {
              $obj: "fill3"
            }
          ],
          loungeText: {
            $comp: "loungeText",
            kind: "TMP"
          },
          musterBoard: {
            $obj: "musterBoard"
          },
          musterText: {
            $comp: "musterText",
            kind: "TMP"
          },
          panelText: {
            $comp: "panelText",
            kind: "TMP"
          },
          personalPanel: {
            $obj: "personalPanel"
          },
          regionGrid: [6, 5],
          regions: [
            {
              $obj: "region00"
            },
            {
              $obj: "region01"
            },
            {
              $obj: "region02"
            },
            {
              $obj: "region03"
            },
            {
              $obj: "region04"
            },
            {
              $obj: "region05"
            },
            {
              $obj: "region06"
            },
            {
              $obj: "region07"
            },
            {
              $obj: "region08"
            },
            {
              $obj: "region09"
            },
            {
              $obj: "region10"
            },
            {
              $obj: "region11"
            },
            {
              $obj: "region12"
            },
            {
              $obj: "region13"
            },
            {
              $obj: "region14"
            },
            {
              $obj: "region15"
            },
            {
              $obj: "region16"
            },
            {
              $obj: "region17"
            },
            {
              $obj: "region18"
            },
            {
              $obj: "region19"
            },
            {
              $obj: "region20"
            },
            {
              $obj: "region21"
            },
            {
              $obj: "region22"
            },
            {
              $obj: "region23"
            },
            {
              $obj: "region24"
            },
            {
              $obj: "region25"
            },
            {
              $obj: "region26"
            },
            {
              $obj: "region27"
            },
            {
              $obj: "region28"
            },
            {
              $obj: "region29"
            }
          ],
          shell: {
            $obj: "shell"
          },
          voteLabels: [
            {
              $comp: "voteLabel0",
              kind: "TMP"
            },
            {
              $comp: "voteLabel1",
              kind: "TMP"
            },
            {
              $comp: "voteLabel2",
              kind: "TMP"
            },
            {
              $comp: "voteLabel3",
              kind: "TMP"
            },
            {
              $comp: "voteLabel4",
              kind: "TMP"
            },
            {
              $comp: "voteLabel5",
              kind: "TMP"
            },
            {
              $comp: "voteLabel6",
              kind: "TMP"
            },
            {
              $comp: "voteLabel7",
              kind: "TMP"
            },
            {
              $comp: "voteLabel8",
              kind: "TMP"
            },
            {
              $comp: "voteLabel9",
              kind: "TMP"
            }
          ],
          workBand: {
            $obj: "band"
          },
          workBar: {
            $obj: "workBar"
          }
        },
        id: "hud",
        object: "personalPanel",
        type: "RuntimeHud"
      },
      {
        fields: {},
        id: "match",
        object: "hubBoard",
        type: "Match"
      },
      {
        fields: {},
        id: "dealer",
        object: "hubBoard",
        type: "Dealer"
      },
      {
        fields: {},
        id: "link",
        object: "hubBoard",
        type: "PlayerLink"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 0,
          kind: "post"
        },
        id: "b1",
        object: "musterPost",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 0,
          kind: "board"
        },
        id: "b2",
        object: "enterButton",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 0,
          kind: "body"
        },
        id: "b3",
        object: "body0",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 1,
          kind: "body"
        },
        id: "b4",
        object: "body1",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 2,
          kind: "body"
        },
        id: "b5",
        object: "body2",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 3,
          kind: "body"
        },
        id: "b6",
        object: "body3",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 4,
          kind: "body"
        },
        id: "b7",
        object: "body4",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 5,
          kind: "body"
        },
        id: "b8",
        object: "body5",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 6,
          kind: "body"
        },
        id: "b9",
        object: "body6",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 7,
          kind: "body"
        },
        id: "b10",
        object: "body7",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 8,
          kind: "body"
        },
        id: "b11",
        object: "body8",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 9,
          kind: "body"
        },
        id: "b12",
        object: "body9",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 0,
          kind: "bot"
        },
        id: "b13",
        object: "bot0",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 1,
          kind: "bot"
        },
        id: "b14",
        object: "bot1",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 2,
          kind: "bot"
        },
        id: "b15",
        object: "bot2",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 3,
          kind: "bot"
        },
        id: "b16",
        object: "bot3",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 4,
          kind: "bot"
        },
        id: "b17",
        object: "bot4",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 5,
          kind: "bot"
        },
        id: "b18",
        object: "bot5",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 6,
          kind: "bot"
        },
        id: "b19",
        object: "bot6",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 7,
          kind: "bot"
        },
        id: "b20",
        object: "bot7",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 8,
          kind: "bot"
        },
        id: "b21",
        object: "bot8",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 0,
          kind: "job"
        },
        id: "b22",
        object: "console0",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 1,
          kind: "job"
        },
        id: "b23",
        object: "console1",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 2,
          kind: "job"
        },
        id: "b24",
        object: "console2",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 3,
          kind: "job"
        },
        id: "b25",
        object: "console3",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 4,
          kind: "job"
        },
        id: "b26",
        object: "console4",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 5,
          kind: "job"
        },
        id: "b27",
        object: "console5",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 6,
          kind: "job"
        },
        id: "b28",
        object: "console6",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 7,
          kind: "job"
        },
        id: "b29",
        object: "console7",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 8,
          kind: "job"
        },
        id: "b30",
        object: "console8",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 9,
          kind: "job"
        },
        id: "b31",
        object: "console9",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 10,
          kind: "job"
        },
        id: "b32",
        object: "console10",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 11,
          kind: "job"
        },
        id: "b33",
        object: "console11",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 12,
          kind: "job"
        },
        id: "b34",
        object: "console12",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 13,
          kind: "job"
        },
        id: "b35",
        object: "console13",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 14,
          kind: "job"
        },
        id: "b36",
        object: "console14",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 15,
          kind: "job"
        },
        id: "b37",
        object: "console15",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 16,
          kind: "job"
        },
        id: "b38",
        object: "console16",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 17,
          kind: "job"
        },
        id: "b39",
        object: "console17",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 18,
          kind: "job"
        },
        id: "b40",
        object: "console18",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 19,
          kind: "job"
        },
        id: "b41",
        object: "console19",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 20,
          kind: "job"
        },
        id: "b42",
        object: "console20",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 21,
          kind: "job"
        },
        id: "b43",
        object: "console21",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 0,
          kind: "panel"
        },
        id: "b44",
        object: "faultPanel0",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 1,
          kind: "panel"
        },
        id: "b45",
        object: "faultPanel1",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 2,
          kind: "panel"
        },
        id: "b46",
        object: "faultPanel2",
        type: "StationButton"
      },
      {
        fields: {
          hud: {
            $beh: "hud"
          },
          index: 3,
          kind: "panel"
        },
        id: "b47",
        object: "faultPanel3",
        type: "StationButton"
      }
    ],
    bundles: {
      android: "",
      windows: ""
    },
    events: [
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickUse",
        object: "panelUse"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickEliminate",
        object: "panelEliminate"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickAlarm",
        object: "panelAlarm"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickFault",
        object: "panelFault"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickHatch",
        object: "panelHatch"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickJoin",
        object: "joinButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickStart",
        object: "startButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickAbort",
        object: "abortButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickLeave",
        object: "leaveButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickCredits",
        object: "creditsButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickCredits",
        object: "creditsPanel"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote0",
        object: "vote0"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote1",
        object: "vote1"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote2",
        object: "vote2"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote3",
        object: "vote3"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote4",
        object: "vote4"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote5",
        object: "vote5"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote6",
        object: "vote6"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote7",
        object: "vote7"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote8",
        object: "vote8"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickVote9",
        object: "vote9"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickAbstain",
        object: "abstainButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickAbort",
        object: "loungeAbortButton"
      },
      {
        behaviour: "hud",
        kind: "click",
        method: "ClickLeave",
        object: "loungeLeaveButton"
      }
    ],
    hash: "dfa38295e9ffc5a8d53a3da5becbd1d091094fdc",
    objects: {
      abortButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/Abort",
        seat: false,
        sync: "none"
      },
      abstainButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Abstain",
        seat: false,
        sync: "none"
      },
      band: {
        active: false,
        click: false,
        grab: false,
        path: "Personal/Panel/Work/Band",
        seat: false,
        sync: "none"
      },
      body0: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body0",
        seat: false,
        sync: "none"
      },
      body1: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body1",
        seat: false,
        sync: "none"
      },
      body2: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body2",
        seat: false,
        sync: "none"
      },
      body3: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body3",
        seat: false,
        sync: "none"
      },
      body4: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body4",
        seat: false,
        sync: "none"
      },
      body5: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body5",
        seat: false,
        sync: "none"
      },
      body6: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body6",
        seat: false,
        sync: "none"
      },
      body7: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body7",
        seat: false,
        sync: "none"
      },
      body8: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body8",
        seat: false,
        sync: "none"
      },
      body9: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bodies/Body9",
        seat: false,
        sync: "none"
      },
      bot0: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot0",
        seat: false,
        sync: "none"
      },
      bot1: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot1",
        seat: false,
        sync: "none"
      },
      bot2: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot2",
        seat: false,
        sync: "none"
      },
      bot3: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot3",
        seat: false,
        sync: "none"
      },
      bot4: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot4",
        seat: false,
        sync: "none"
      },
      bot5: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot5",
        seat: false,
        sync: "none"
      },
      bot6: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot6",
        seat: false,
        sync: "none"
      },
      bot7: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot7",
        seat: false,
        sync: "none"
      },
      bot8: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Bots/Bot8",
        seat: false,
        sync: "none"
      },
      console0: {
        click: true,
        grab: false,
        path: "Station/Regions/R14/Console00",
        seat: false,
        sync: "none"
      },
      console1: {
        click: true,
        grab: false,
        path: "Station/Regions/R12/Console01",
        seat: false,
        sync: "none"
      },
      console10: {
        click: true,
        grab: false,
        path: "Station/Regions/R10/Console10",
        seat: false,
        sync: "none"
      },
      console11: {
        click: true,
        grab: false,
        path: "Station/Regions/R17/Console11",
        seat: false,
        sync: "none"
      },
      console12: {
        click: true,
        grab: false,
        path: "Station/Regions/R11/Console12",
        seat: false,
        sync: "none"
      },
      console13: {
        click: true,
        grab: false,
        path: "Station/Regions/R04/Console13",
        seat: false,
        sync: "none"
      },
      console14: {
        click: true,
        grab: false,
        path: "Station/Regions/R04/Console14",
        seat: false,
        sync: "none"
      },
      console15: {
        click: true,
        grab: false,
        path: "Station/Regions/R03/Console15",
        seat: false,
        sync: "none"
      },
      console16: {
        click: true,
        grab: false,
        path: "Station/Regions/R03/Console16",
        seat: false,
        sync: "none"
      },
      console17: {
        click: true,
        grab: false,
        path: "Station/Regions/R03/Console17",
        seat: false,
        sync: "none"
      },
      console18: {
        click: true,
        grab: false,
        path: "Station/Regions/R07/Console18",
        seat: false,
        sync: "none"
      },
      console19: {
        click: true,
        grab: false,
        path: "Station/Regions/R08/Console19",
        seat: false,
        sync: "none"
      },
      console2: {
        click: true,
        grab: false,
        path: "Station/Regions/R19/Console02",
        seat: false,
        sync: "none"
      },
      console20: {
        click: true,
        grab: false,
        path: "Station/Regions/R06/Console20",
        seat: false,
        sync: "none"
      },
      console21: {
        click: true,
        grab: false,
        path: "Station/Regions/R07/Console21",
        seat: false,
        sync: "none"
      },
      console3: {
        click: true,
        grab: false,
        path: "Station/Regions/R19/Console03",
        seat: false,
        sync: "none"
      },
      console4: {
        click: true,
        grab: false,
        path: "Station/Regions/R25/Console04",
        seat: false,
        sync: "none"
      },
      console5: {
        click: true,
        grab: false,
        path: "Station/Regions/R27/Console05",
        seat: false,
        sync: "none"
      },
      console6: {
        click: true,
        grab: false,
        path: "Station/Regions/R28/Console06",
        seat: false,
        sync: "none"
      },
      console7: {
        click: true,
        grab: false,
        path: "Station/Regions/R22/Console07",
        seat: false,
        sync: "none"
      },
      console8: {
        click: true,
        grab: false,
        path: "Station/Regions/R16/Console08",
        seat: false,
        sync: "none"
      },
      console9: {
        click: true,
        grab: false,
        path: "Station/Regions/R23/Console09",
        seat: false,
        sync: "none"
      },
      creditsButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/Credits",
        seat: false,
        sync: "none"
      },
      creditsPanel: {
        active: false,
        click: true,
        grab: false,
        path: "Station/Regions/R15/Hub/CreditsPanel",
        seat: false,
        sync: "none"
      },
      enterButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R03/Entry/Sign/Enter",
        seat: false,
        sync: "none"
      },
      faultPanel0: {
        click: true,
        grab: false,
        path: "Station/Regions/R04/Panel0",
        seat: false,
        sync: "none"
      },
      faultPanel1: {
        click: true,
        grab: false,
        path: "Station/Regions/R03/Panel1",
        seat: false,
        sync: "none"
      },
      faultPanel2: {
        click: true,
        grab: false,
        path: "Station/Regions/R22/Panel2",
        seat: false,
        sync: "none"
      },
      faultPanel3: {
        click: true,
        grab: false,
        path: "Station/Regions/R07/Panel3",
        seat: false,
        sync: "none"
      },
      fill: {
        click: false,
        grab: false,
        path: "Personal/Panel/JobBar/Fill",
        seat: false,
        sync: "none"
      },
      fill3: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/JobBar/Fill",
        seat: false,
        sync: "none"
      },
      hubBoard: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Hub/Board",
        seat: false,
        sync: "none"
      },
      hubText: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/Text",
        seat: false,
        sync: "none"
      },
      joinButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/Join",
        seat: false,
        sync: "none"
      },
      leaveButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/Leave",
        seat: false,
        sync: "none"
      },
      loungeAbortButton: {
        click: true,
        grab: false,
        path: "Lounge/Board/Abort",
        seat: false,
        sync: "none"
      },
      loungeLeaveButton: {
        click: true,
        grab: false,
        path: "Lounge/Board/Leave",
        seat: false,
        sync: "none"
      },
      loungeText: {
        click: false,
        grab: false,
        path: "Lounge/Board/Text",
        seat: false,
        sync: "none"
      },
      musterBoard: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board",
        seat: false,
        sync: "none"
      },
      musterPost: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Post",
        seat: false,
        sync: "none"
      },
      musterText: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Text",
        seat: false,
        sync: "none"
      },
      panelAlarm: {
        click: true,
        grab: false,
        path: "Personal/Panel/Alarm",
        seat: false,
        sync: "none"
      },
      panelEliminate: {
        click: true,
        grab: false,
        path: "Personal/Panel/Eliminate",
        seat: false,
        sync: "none"
      },
      panelFault: {
        click: true,
        grab: false,
        path: "Personal/Panel/Fault",
        seat: false,
        sync: "none"
      },
      panelHatch: {
        click: true,
        grab: false,
        path: "Personal/Panel/Hatch",
        seat: false,
        sync: "none"
      },
      panelText: {
        click: false,
        grab: false,
        path: "Personal/Panel/Text",
        seat: false,
        sync: "none"
      },
      panelUse: {
        click: true,
        grab: false,
        path: "Personal/Panel/Use",
        seat: false,
        sync: "none"
      },
      personalPanel: {
        click: false,
        grab: false,
        path: "Personal/Panel",
        seat: false,
        sync: "none"
      },
      region00: {
        click: false,
        grab: false,
        path: "Station/Regions/R00",
        seat: false,
        sync: "none"
      },
      region01: {
        click: false,
        grab: false,
        path: "Station/Regions/R01",
        seat: false,
        sync: "none"
      },
      region02: {
        click: false,
        grab: false,
        path: "Station/Regions/R02",
        seat: false,
        sync: "none"
      },
      region03: {
        click: false,
        grab: false,
        path: "Station/Regions/R03",
        seat: false,
        sync: "none"
      },
      region04: {
        click: false,
        grab: false,
        path: "Station/Regions/R04",
        seat: false,
        sync: "none"
      },
      region05: {
        click: false,
        grab: false,
        path: "Station/Regions/R05",
        seat: false,
        sync: "none"
      },
      region06: {
        click: false,
        grab: false,
        path: "Station/Regions/R06",
        seat: false,
        sync: "none"
      },
      region07: {
        click: false,
        grab: false,
        path: "Station/Regions/R07",
        seat: false,
        sync: "none"
      },
      region08: {
        click: false,
        grab: false,
        path: "Station/Regions/R08",
        seat: false,
        sync: "none"
      },
      region09: {
        click: false,
        grab: false,
        path: "Station/Regions/R09",
        seat: false,
        sync: "none"
      },
      region10: {
        click: false,
        grab: false,
        path: "Station/Regions/R10",
        seat: false,
        sync: "none"
      },
      region11: {
        click: false,
        grab: false,
        path: "Station/Regions/R11",
        seat: false,
        sync: "none"
      },
      region12: {
        click: false,
        grab: false,
        path: "Station/Regions/R12",
        seat: false,
        sync: "none"
      },
      region13: {
        click: false,
        grab: false,
        path: "Station/Regions/R13",
        seat: false,
        sync: "none"
      },
      region14: {
        click: false,
        grab: false,
        path: "Station/Regions/R14",
        seat: false,
        sync: "none"
      },
      region15: {
        click: false,
        grab: false,
        path: "Station/Regions/R15",
        seat: false,
        sync: "none"
      },
      region16: {
        click: false,
        grab: false,
        path: "Station/Regions/R16",
        seat: false,
        sync: "none"
      },
      region17: {
        click: false,
        grab: false,
        path: "Station/Regions/R17",
        seat: false,
        sync: "none"
      },
      region18: {
        click: false,
        grab: false,
        path: "Station/Regions/R18",
        seat: false,
        sync: "none"
      },
      region19: {
        click: false,
        grab: false,
        path: "Station/Regions/R19",
        seat: false,
        sync: "none"
      },
      region20: {
        click: false,
        grab: false,
        path: "Station/Regions/R20",
        seat: false,
        sync: "none"
      },
      region21: {
        click: false,
        grab: false,
        path: "Station/Regions/R21",
        seat: false,
        sync: "none"
      },
      region22: {
        click: false,
        grab: false,
        path: "Station/Regions/R22",
        seat: false,
        sync: "none"
      },
      region23: {
        click: false,
        grab: false,
        path: "Station/Regions/R23",
        seat: false,
        sync: "none"
      },
      region24: {
        click: false,
        grab: false,
        path: "Station/Regions/R24",
        seat: false,
        sync: "none"
      },
      region25: {
        click: false,
        grab: false,
        path: "Station/Regions/R25",
        seat: false,
        sync: "none"
      },
      region26: {
        click: false,
        grab: false,
        path: "Station/Regions/R26",
        seat: false,
        sync: "none"
      },
      region27: {
        click: false,
        grab: false,
        path: "Station/Regions/R27",
        seat: false,
        sync: "none"
      },
      region28: {
        click: false,
        grab: false,
        path: "Station/Regions/R28",
        seat: false,
        sync: "none"
      },
      region29: {
        click: false,
        grab: false,
        path: "Station/Regions/R29",
        seat: false,
        sync: "none"
      },
      shell: {
        active: false,
        click: false,
        grab: false,
        path: "Personal/Shell",
        seat: false,
        sync: "none"
      },
      speaker: {
        click: false,
        grab: false,
        path: "Audio/Speaker",
        seat: false,
        sync: "none"
      },
      startButton: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Hub/Board/Start",
        seat: false,
        sync: "none"
      },
      vote0: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote0",
        seat: false,
        sync: "none"
      },
      vote1: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote1",
        seat: false,
        sync: "none"
      },
      vote2: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote2",
        seat: false,
        sync: "none"
      },
      vote3: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote3",
        seat: false,
        sync: "none"
      },
      vote4: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote4",
        seat: false,
        sync: "none"
      },
      vote5: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote5",
        seat: false,
        sync: "none"
      },
      vote6: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote6",
        seat: false,
        sync: "none"
      },
      vote7: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote7",
        seat: false,
        sync: "none"
      },
      vote8: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote8",
        seat: false,
        sync: "none"
      },
      vote9: {
        click: true,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote9",
        seat: false,
        sync: "none"
      },
      voteLabel0: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote0/Label",
        seat: false,
        sync: "none"
      },
      voteLabel1: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote1/Label",
        seat: false,
        sync: "none"
      },
      voteLabel2: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote2/Label",
        seat: false,
        sync: "none"
      },
      voteLabel3: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote3/Label",
        seat: false,
        sync: "none"
      },
      voteLabel4: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote4/Label",
        seat: false,
        sync: "none"
      },
      voteLabel5: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote5/Label",
        seat: false,
        sync: "none"
      },
      voteLabel6: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote6/Label",
        seat: false,
        sync: "none"
      },
      voteLabel7: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote7/Label",
        seat: false,
        sync: "none"
      },
      voteLabel8: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote8/Label",
        seat: false,
        sync: "none"
      },
      voteLabel9: {
        click: false,
        grab: false,
        path: "Station/Regions/R15/Muster/Board/Vote9/Label",
        seat: false,
        sync: "none"
      },
      workBar: {
        click: false,
        grab: false,
        path: "Personal/Panel/Work/Fill",
        seat: false,
        sync: "none"
      }
    },
    refs: [
      "panelText",
      "fill",
      "workBar",
      "band",
      "shell",
      "hubText",
      "fill3",
      "musterBoard",
      "musterText",
      "voteLabel0",
      "voteLabel1",
      "voteLabel2",
      "voteLabel3",
      "voteLabel4",
      "voteLabel5",
      "voteLabel6",
      "voteLabel7",
      "voteLabel8",
      "voteLabel9",
      "loungeText",
      "speaker",
      "body0",
      "body1",
      "body2",
      "body3",
      "body4",
      "body5",
      "body6",
      "body7",
      "body8",
      "body9",
      "bot0",
      "bot1",
      "bot2",
      "bot3",
      "bot4",
      "bot5",
      "bot6",
      "bot7",
      "bot8",
      "console0",
      "console1",
      "console2",
      "console3",
      "console4",
      "console5",
      "console6",
      "console7",
      "console8",
      "console9",
      "console10",
      "console11",
      "console12",
      "console13",
      "console14",
      "console15",
      "console16",
      "console17",
      "console18",
      "console19",
      "console20",
      "console21"
    ],
    schema: 1,
    slug: "hidden-role"
  };

  // portkit/src/platform/bs.ts
  function pageEnv() {
    const g = globalThis;
    let storage = null;
    try {
      storage = g.localStorage ?? null;
    } catch {
      storage = null;
    }
    return {
      get BS() {
        return g.BS;
      },
      win: g.window,
      doc: g.document,
      MutationObserver: g.MutationObserver,
      storage,
      crypto: g.crypto,
      setTimeout: (fn, ms) => g.setTimeout(fn, ms),
      clearTimeout: (handle) => g.clearTimeout(handle),
      now: () => g.performance.now(),
      wallMs: () => g.Date.now(),
      random: () => g.Math.random(),
      console: g.console
    };
  }
  var DEFAULT_BS_OPTIONS = { joinTimeoutMs: 3e4, kitTimeoutMs: 12e4, kitFindMs: 2e4, userFlushMs: 200, verbose: false };
  var HOST_EVENTS = {
    click: "click",
    grab: "grab",
    drop: "drop",
    triggerEnter: "trigger-enter",
    triggerExit: "trigger-exit",
    collisionEnter: "collision-enter",
    collisionExit: "collision-exit"
  };
  var DELIMITER_CODES = [182, 167, 124, 8253, 164];
  function hasDelimiter(text) {
    for (let i = 0; i < text.length; i++) if (DELIMITER_CODES.indexOf(text.charCodeAt(i)) >= 0) return true;
    return false;
  }
  var BsPlatform = class {
    constructor(env2, options = {}) {
      __publicField(this, "clock");
      __publicField(this, "limits", { ...DEFAULT_LIMITS });
      __publicField(this, "storage");
      __publicField(this, "crypto");
      __publicField(this, "env");
      __publicField(this, "options");
      __publicField(this, "scene", null);
      __publicField(this, "readyPromise", null);
      __publicField(this, "mirror", /* @__PURE__ */ new Map());
      __publicField(this, "snapshot", deferred());
      __publicField(this, "fullSeen", false);
      __publicField(this, "stateHandlers", []);
      __publicField(this, "errorHandlers", []);
      __publicField(this, "userHandlers", []);
      __publicField(this, "oneShotHandlers", []);
      __publicField(this, "playerHandlers", []);
      __publicField(this, "sessionHandlers", []);
      __publicField(this, "snippetHandlers", []);
      __publicField(this, "poseHandlers", []);
      __publicField(this, "inputHandlers", []);
      __publicField(this, "wrappers", /* @__PURE__ */ new WeakMap());
      /** uid -> the page's UserData object for everyone in the room. */
      __publicField(this, "roster", /* @__PURE__ */ new Map());
      __publicField(this, "pendingPublic", null);
      __publicField(this, "pendingProtected", null);
      __publicField(this, "pendingUser", /* @__PURE__ */ new Map());
      __publicField(this, "userTimer", 0);
      __publicField(this, "userLastFlush", -Infinity);
      __publicField(this, "userBackoff", 0);
      /** Own user state when the app has no user state to offer (Play mode on your own). */
      __publicField(this, "localUser", null);
      __publicField(this, "ownUser", /* @__PURE__ */ new Map());
      __publicField(this, "sessionId", "");
      __publicField(this, "keyNames", null);
      __publicField(this, "observer", null);
      this.env = env2;
      this.options = { ...DEFAULT_BS_OPTIONS, ...options };
      this.crypto = env2.crypto;
      this.clock = {
        now: () => env2.now(),
        wallSeconds: () => env2.wallMs() / 1e3,
        setTimeout: (fn, ms) => env2.setTimeout(fn, ms),
        clearTimeout: (handle) => env2.clearTimeout(handle)
      };
      const store = env2.storage;
      this.storage = {
        get: (key) => store ? store.getItem(key) : null,
        set: (key, value) => {
          if (!store) throw new Error("no storage on this page");
          store.setItem(key, value);
        },
        remove: (key) => store?.removeItem(key),
        keys: (prefix) => {
          const out = [];
          if (!store) return out;
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key !== null && key.startsWith(prefix)) out.push(key);
          }
          return out;
        }
      };
    }
    random() {
      return this.env.random();
    }
    log(level, message) {
      if (level === "debug" && !this.options.verbose) return;
      const text = "[pk1] " + message;
      if (level === "error") this.env.console.error(text);
      else if (level === "warn") this.env.console.warn(text);
      else this.env.console.log(text);
    }
    // ---- the page registry --------------------------------------------------------------------------------------
    /** `window.__pk1`: made by whichever game script comes first, shared by all of them, so kept small and stable. */
    registry() {
      const win = this.env.win;
      let registry = win.__pk1;
      if (!registry || typeof registry !== "object" || !registry.holders) {
        const made = {
          v: 1,
          games: {},
          holders: {},
          debug: {},
          clock(key, id, seconds2) {
            const holder = made.holders[key];
            if (holder) holder.clock(String(id), String(seconds2));
          },
          event(key, name, args) {
            const holder = made.holders[key];
            if (holder) holder.event(String(name), args === void 0 || args === null ? "" : String(args));
          }
        };
        registry = made;
        win.__pk1 = made;
      }
      return registry;
    }
    claimGame(slug, info) {
      const registry = this.registry();
      if (Object.prototype.hasOwnProperty.call(registry.games, slug)) return false;
      registry.games[slug] = info;
      return true;
    }
    expose(key, hooks) {
      const registry = this.registry();
      if (hooks) registry.debug[key] = hooks;
      else delete registry.debug[key];
    }
    onRelay(key, handlers) {
      const registry = this.registry();
      const holder = {
        clock: (id, seconds2) => handlers.clock(id, Number(seconds2)),
        event: (name, args) => handlers.event(name, parseEventArgs(args))
      };
      registry.holders[key] = holder;
      return () => {
        if (registry.holders[key] === holder) delete registry.holders[key];
      };
    }
    relaySend(payload) {
      this.attempt("relay", () => this.scene.SendToVisualScripting(TAG, payload));
    }
    // ---- ready --------------------------------------------------------------------------------------------------
    whenReady() {
      if (!this.readyPromise) this.readyPromise = this.becomeReady();
      return this.readyPromise;
    }
    async becomeReady() {
      const { env: env2 } = this;
      const loaded = deferred();
      env2.win.addEventListener("bs-loaded", () => loaded.resolve());
      await loaded.promise;
      this.scene = env2.BS.Scene.GetInstance();
      this.listen();
      const started = env2.now();
      let warned = false;
      while (!this.joined()) {
        if (env2.now() - started > this.options.joinTimeoutMs) {
          if (!warned) this.log("warn", "the local player has not joined a room; carrying on as the only player");
          warned = true;
          break;
        }
        await this.sleep(100);
      }
      this.sessionId = this.local().sid;
      this.seedMirror();
      this.watchSession();
      this.observeSnippets();
    }
    /** The local user exists and has a real session id (it reads "local" until the room is joined). */
    joined() {
      const user = this.scene.localUser;
      return !!user && typeof user.id === "string" && user.id !== "" && user.id !== "local";
    }
    sleep(ms) {
      return new Promise((resolve) => this.env.setTimeout(resolve, ms));
    }
    watchSession() {
      const check = () => {
        const now = this.local().sid;
        if (now !== this.sessionId) {
          this.sessionId = now;
          for (const handler of this.sessionHandlers.slice()) this.attempt("session handler", handler);
        }
        this.env.setTimeout(check, 1e3);
      };
      this.env.setTimeout(check, 1e3);
    }
    listen() {
      const scene = this.scene;
      const present = scene.users ?? {};
      for (const uid of Object.keys(present)) this.roster.set(uid, present[uid]);
      const on = (name, handler) => scene.On(name, (event) => {
        try {
          handler(event ? event.detail : void 0);
        } catch (error) {
          this.log("error", `${name} handler: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
      on("space-state", (detail) => this.onSpaceState(detail));
      on("space-state-changed", (detail) => {
        if (this.fullSeen || !detail || !Array.isArray(detail.changes)) return;
        for (const change of detail.changes) {
          if (typeof change.property !== "string" || !change.property.startsWith(TAG + ".")) continue;
          this.applyChange(change.property, typeof change.newValue === "string" ? change.newValue : void 0);
        }
      });
      on("space-state-error", (detail) => this.onStateErrorEvent(detail));
      on("user-state-error", (detail) => this.onStateErrorEvent(detail));
      on("one-shot", (detail) => {
        if (!detail || typeof detail.data !== "string") return;
        for (const handler of this.oneShotHandlers.slice()) handler(String(detail.fromId ?? ""), detail.data);
      });
      on("user-joined", (user) => this.emitPlayer("join", user));
      on("user-left", (user) => this.emitPlayer("leave", user));
      on("user-state", (detail) => {
        if (!detail || !Array.isArray(detail.changes)) return;
        const sid = String(detail.id ?? detail.user?.id ?? "");
        for (const change of detail.changes) {
          if (typeof change.path !== "string" || !change.path.startsWith(TAG + ".")) continue;
          const value = change.deleted || typeof change.value !== "string" ? void 0 : change.value;
          if (sid === this.local().sid) {
            if (value === void 0) this.ownUser.delete(change.path);
            else this.ownUser.set(change.path, value);
          }
          this.emitUser(sid, change.path, value);
        }
      });
      on("pose-update", (detail) => {
        if (!detail || !detail.head) return;
        const poses = { head: pose(detail.head), leftHand: pose(detail.leftHand), rightHand: pose(detail.rightHand) };
        for (const handler of this.poseHandlers.slice()) handler(poses);
      });
      const input = (event) => {
        for (const handler of this.inputHandlers.slice()) handler(event);
      };
      on("button-pressed", (d) => input({ type: "button", button: clampInt(d.button, 4), side: clampInt(d.side, 1), pressed: true }));
      on("button-released", (d) => input({ type: "button", button: clampInt(d.button, 4), side: clampInt(d.side, 1), pressed: false }));
      on("controller-axis-update", (d) => input({ type: "thumbstick", side: clampInt(d.hand, 1), x: Number(d.x) || 0, y: Number(d.y) || 0 }));
      on("trigger-axis-update", (d) => input({ type: "trigger", side: clampInt(d.hand, 1), value: Number(d.value) || 0 }));
      on("key-press", (d) => input({ type: "key", key: this.keyName(d.key), pressed: true }));
      on("key-release", (d) => input({ type: "key", key: this.keyName(d.key), pressed: false }));
    }
    keyName(code) {
      if (!this.keyNames) {
        this.keyNames = {};
        const codes = this.env.BS.KeyCode ?? {};
        for (const name of Object.keys(codes)) if (typeof codes[name] === "number") this.keyNames[codes[name]] = name;
      }
      return this.keyNames[Number(code)] ?? String(code);
    }
    // ---- players ------------------------------------------------------------------------------------------------
    toPlayer(user) {
      return { sid: String(user.id ?? ""), uid: String(user.uid ?? ""), name: String(user.name ?? ""), isLocal: user.isLocal === true, isAdmin: user.isSpaceAdmin === true };
    }
    local() {
      const user = this.scene?.localUser;
      if (!user) return { sid: "local", uid: "local", name: "", isLocal: true, isAdmin: false };
      const player = this.toPlayer(user);
      player.isLocal = true;
      if (!player.sid) player.sid = "local";
      return player;
    }
    /**
     * Who is in the room. The page keeps `scene.users` keyed by user id (so two sessions of one account show as
     * one player), and it removes a leaver only after `user-left` has been dispatched: the list is kept here, and
     * each player's fields are read live, because a session id is filled in after the fact.
     */
    players() {
      const out = [];
      let sawLocal = false;
      for (const user of this.roster.values()) {
        const player = this.toPlayer(user);
        if (player.isLocal) {
          sawLocal = true;
          if (!player.sid) player.sid = "local";
        } else if (!player.sid || player.sid === "local") continue;
        out.push(player);
      }
      if (!sawLocal) out.push(this.local());
      return out;
    }
    onPlayers(handler) {
      return subscribe(this.playerHandlers, handler);
    }
    onSessionChanged(handler) {
      return subscribe(this.sessionHandlers, handler);
    }
    emitPlayer(kind, user) {
      if (!user) return;
      const uid = String(user.uid ?? "");
      if (kind === "join") this.roster.set(uid, user);
      else this.roster.delete(uid);
      const player = this.toPlayer(user);
      for (const handler of this.playerHandlers.slice()) this.attempt("player handler", () => handler(kind, player));
    }
    // ---- space state --------------------------------------------------------------------------------------------
    onSpaceState(detail) {
      if (!detail || !Array.isArray(detail.changes)) return;
      if (detail.full) {
        const next = /* @__PURE__ */ new Map();
        for (const change of detail.changes) {
          if (typeof change.path === "string" && change.path.startsWith(TAG + ".") && !change.deleted && typeof change.value === "string") next.set(change.path, change.value);
        }
        this.replaceMirror(next);
        this.fullSeen = true;
        this.snapshot.resolve(true);
        return;
      }
      for (const change of detail.changes) {
        if (typeof change.path !== "string" || !change.path.startsWith(TAG + ".")) continue;
        this.applyChange(change.path, change.deleted || typeof change.value !== "string" ? void 0 : change.value);
      }
    }
    replaceMirror(next) {
      const gone = [...this.mirror.keys()].filter((path) => !next.has(path));
      for (const path of gone) this.applyChange(path, void 0);
      for (const [path, value] of next) this.applyChange(path, value);
    }
    /** Applies one change to the mirror and tells the listeners, unless the mirror already says so. */
    applyChange(path, value) {
      const before = this.mirror.get(path);
      if (before === value) return;
      if (value === void 0) this.mirror.delete(path);
      else this.mirror.set(path, value);
      for (const handler of this.stateHandlers.slice()) {
        if (!path.startsWith(handler.prefix)) continue;
        try {
          handler.fn(path, value);
        } catch (error) {
          this.log("error", `state handler: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    /**
     * The mirror at the moment the adapter became ready. When the snapshot's own event was missed (the script
     * arrived after it), the page's copy of the state is asked for instead.
     */
    seedMirror() {
      if (this.fullSeen) return;
      const take = (entries) => {
        if (this.fullSeen || !entries) return;
        const next = new Map(this.mirror);
        for (const scope of ["public", "protected"]) {
          const map = entries[scope];
          if (!map) continue;
          for (const path of Object.keys(map)) if (path.startsWith(TAG + ".") && typeof map[path] === "string") next.set(path, map[path]);
        }
        this.replaceMirror(next);
      };
      take(this.scene.spaceStateJson);
      if (!this.joined()) return;
      this.attemptAsync("SpaceStateGetAll", async () => {
        const all = await this.scene.SpaceStateGetAll();
        take(all);
        this.snapshot.resolve(true);
      }).then((ok) => {
        if (!ok) this.snapshot.resolve(true);
      });
    }
    whenSnapshot(timeoutMs) {
      if (this.snapshot.settled) return this.snapshot.promise;
      const gate = deferred();
      const timer = this.env.setTimeout(() => gate.resolve(false), timeoutMs);
      this.snapshot.promise.then((ok) => {
        this.env.clearTimeout(timer);
        gate.resolve(ok);
      });
      return gate.promise;
    }
    stateGet(path) {
      return this.mirror.get(path);
    }
    stateEntries(prefix) {
      const out = [];
      for (const [path, value] of this.mirror) if (path.startsWith(prefix)) out.push([path, value]);
      return out;
    }
    /**
     * Writes go through the page's string calls (SetPublicSpaceProps / SetProtectedSpaceProps): those are the ones
     * the app queues, merges per key, sends as one batch every 0.2 s for a single rate-limit token, and retries
     * when the bucket is empty. The JSON calls (SpaceStateSet) are sent one by one and are refused outright when
     * the bucket is empty. (Runtime/LocalMultiplayer/State/SpaceStateService.cs.)
     */
    stateSet(path, value) {
      this.queueSet(path, value, false);
    }
    stateSetProtected(path, value) {
      this.queueSet(path, value, true);
    }
    queueSet(path, value, isProtected) {
      if (hasDelimiter(value) || hasDelimiter(path)) {
        this.log("error", `a state value for ${path} holds a bridge delimiter character and was not sent`);
        this.emitError(path, "invalid_value", true);
        return;
      }
      const first = this.pendingPublic === null && this.pendingProtected === null;
      if (isProtected) (this.pendingProtected ?? (this.pendingProtected = {}))[path] = value;
      else (this.pendingPublic ?? (this.pendingPublic = {}))[path] = value;
      if (!first) return;
      Promise.resolve().then(() => {
        const pub = this.pendingPublic;
        const prot = this.pendingProtected;
        this.pendingPublic = null;
        this.pendingProtected = null;
        if (pub) this.attempt("SetPublicSpaceProps", () => this.scene.SetPublicSpaceProps(pub));
        if (prot) this.attempt("SetProtectedSpaceProps", () => this.scene.SetProtectedSpaceProps(prot));
      });
    }
    async stateDelete(path) {
      let delay = 250;
      for (let tries = 0; tries < 8; tries++) {
        try {
          await this.scene.SpaceStateDelete(path);
          return;
        } catch (error) {
          const code = errorCode(error);
          if (code === "not_found") return;
          if (code !== "rate_limited" && code !== "timeout") {
            this.emitError(path, code, true);
            return;
          }
          this.emitError(path, code, false);
          await this.sleep(delay);
          delay = Math.min(delay * 2, 4e3);
        }
      }
      this.emitError(path, "rate_limited", true);
    }
    onState(prefix, handler) {
      return subscribe(this.stateHandlers, { prefix, fn: handler });
    }
    onStateError(prefix, handler) {
      return subscribe(this.errorHandlers, { prefix, fn: handler });
    }
    onStateErrorEvent(detail) {
      if (!detail || typeof detail.key !== "string") return;
      if (detail.key.startsWith(TAG + ".")) this.emitError(detail.key, String(detail.code ?? "internal"), true);
    }
    emitError(path, code, final) {
      for (const handler of this.errorHandlers.slice()) {
        if (path.startsWith(handler.prefix)) this.attempt("state error handler", () => handler.fn(path, code, final));
      }
    }
    // ---- user state ---------------------------------------------------------------------------------------------
    /**
     * Own user state goes through the JSON calls (UserStateSet / UserStateDelete), which answer per write. They
     * are sent one by one from a separate rate bucket, so writes are merged per leaf here and sent at most every
     * 0.2 s. Where the app offers no user state at all (Play mode on your own), the values are kept locally.
     */
    userSet(path, value) {
      if (this.localUser) {
        this.setLocalUser(path, value);
        return;
      }
      this.pendingUser.set(path, value);
      this.scheduleUserFlush();
    }
    scheduleUserFlush() {
      if (this.userTimer) return;
      const wait = Math.max(0, this.userLastFlush + Math.max(this.options.userFlushMs, this.userBackoff) - this.env.now());
      this.userTimer = this.env.setTimeout(() => {
        this.userTimer = 0;
        void this.flushUser();
      }, wait);
    }
    async flushUser() {
      this.userLastFlush = this.env.now();
      const batch = [...this.pendingUser];
      this.pendingUser.clear();
      let limited = false;
      for (const [path, value] of batch) {
        if (this.localUser) {
          this.setLocalUser(path, value);
          continue;
        }
        try {
          if (value === null) await this.scene.UserStateDelete(path);
          else await this.scene.UserStateSet(path, value);
        } catch (error) {
          const code = errorCode(error);
          if (code === "not_found") continue;
          if (code === "app_unavailable") {
            this.log("info", "no user state in this session: keeping the local player's own values locally");
            this.localUser = /* @__PURE__ */ new Map();
            this.setLocalUser(path, value);
          } else if (code === "rate_limited" || code === "timeout") {
            limited = true;
            if (!this.pendingUser.has(path)) this.pendingUser.set(path, value);
            this.emitError(path, code, false);
          } else this.emitError(path, code, true);
        }
      }
      this.userBackoff = limited ? Math.min(Math.max(this.userBackoff * 2, 250), 4e3) : 0;
      if (this.pendingUser.size) this.scheduleUserFlush();
    }
    setLocalUser(path, value) {
      const store = this.localUser;
      if (value === null) store.delete(path);
      else store.set(path, value);
      const sid = this.local().sid;
      Promise.resolve().then(() => this.emitUser(sid, path, value === null ? void 0 : value));
    }
    userGet(sid, path) {
      if (sid === this.local().sid) {
        if (this.localUser) return this.localUser.get(path);
        const own = this.ownUser.get(path);
        if (own !== void 0) return own;
      }
      for (const user of this.roster.values()) {
        if (user && user.id === sid) {
          const value = user.state ? user.state[path] : void 0;
          return typeof value === "string" ? value : void 0;
        }
      }
      return void 0;
    }
    onUser(prefix, handler) {
      return subscribe(this.userHandlers, { prefix, fn: handler });
    }
    emitUser(sid, path, value) {
      for (const handler of this.userHandlers.slice()) {
        if (path.startsWith(handler.prefix)) this.attempt("user state handler", () => handler.fn(sid, path, value));
      }
    }
    // ---- one-shots ----------------------------------------------------------------------------------------------
    oneShot(data) {
      if (utf8Length(data) > this.limits.oneShotMaxBytes) return false;
      this.attempt("OneShot", () => this.scene.OneShot(data));
      return true;
    }
    onOneShot(handler) {
      return subscribe(this.oneShotHandlers, handler);
    }
    // ---- kit ----------------------------------------------------------------------------------------------------
    async loadKit(spec) {
      const BS = this.env.BS;
      const holder = new BS.GameObject(spec.holderName);
      await holder.Async();
      const placement = {};
      if (spec.position) placement.localPosition = toBs3(BS, spec.position);
      if (spec.rotation) placement.localEulerAngles = toBs3(BS, spec.rotation);
      if (spec.scale) placement.localScale = toBs3(BS, spec.scale);
      if (Object.keys(placement).length) await holder.SetTransform(placement);
      await holder.AddComponent(new BS.AssetBundle(spec.windows, "", "", spec.android, "", "", false, false));
      const item = new BS.KitItem("*");
      const loaded = deferred();
      item.On("loaded", () => loaded.resolve(true));
      await holder.AddComponent(item);
      if (item.isLoaded) loaded.resolve(true);
      const timer = this.env.setTimeout(() => loaded.resolve(false), this.options.kitTimeoutMs);
      const ok = await loaded.promise;
      this.env.clearTimeout(timer);
      if (!ok) this.log("error", `kit ${spec.holderName}: the kit item never reported loaded`);
      const scene = this.scene;
      const childrenOf = (parent) => {
        const id = String(parent.unityId);
        return Object.values(scene.objects ?? {}).filter((o) => String(o.parent) === id && !o.destroyed);
      };
      const byPath = (root, path) => {
        let at = root;
        if (path === "") return at;
        for (const name of path.split("/")) {
          at = childrenOf(at).find((o) => o.name === name);
          if (!at) return null;
        }
        return at;
      };
      const found = /* @__PURE__ */ new Map();
      let waiting = spec.objects.slice();
      const deadline = this.env.now() + this.options.kitFindMs;
      for (; ; ) {
        const roots = childrenOf(holder);
        const root = roots.find((o) => o.name === spec.rootName) ?? roots[0];
        if (root) {
          waiting = waiting.filter((object) => {
            const go = byPath(root, object.path);
            if (go) found.set(object.key, go);
            return !go;
          });
        }
        if (!waiting.length || this.env.now() >= deadline) break;
        await this.sleep(200);
      }
      for (const object of waiting) {
        try {
          const go = await holder.AddInlineObject(spec.rootName + "/" + object.path);
          if (go) found.set(object.key, go);
        } catch {
        }
      }
      const objects = /* @__PURE__ */ new Map();
      const missing = [];
      const prepare = async (object) => {
        const go = found.get(object.key);
        if (!go) {
          missing.push(object.key);
          return;
        }
        try {
          if (object.networkId) await go.SetNetworkId(object.networkId);
          let synced = null;
          let seat = null;
          if (object.sync === "transform") {
            synced = await go.AddComponent(
              new BS.SyncedObject({
                syncPosition: true,
                syncRotation: true,
                takeOwnershipOnCollision: false,
                takeOwnershipOnProximity: false,
                takeOwnershipOnGrab: object.grab,
                kinematicIfNotOwned: false
              })
            );
          }
          if (object.seat) seat = await go.AddComponent(new BS.Seat({}));
          objects.set(object.key, new BsHostObject(this, object.key, object.path, go, synced, seat));
        } catch (error) {
          this.log("warn", `kit object ${object.key} (${object.path}): ${describe(error)}`);
          missing.push(object.key);
        }
      };
      await Promise.all(spec.objects.map(prepare));
      return {
        objects,
        missing,
        find: async (path) => {
          const roots = childrenOf(holder);
          const root = roots.find((o) => o.name === spec.rootName) ?? roots[0];
          const known = root ? byPath(root, path) : null;
          if (known) return new BsHostObject(this, "", path, known, null, null);
          try {
            const go = await holder.AddInlineObject(spec.rootName + "/" + path);
            return go ? new BsHostObject(this, "", path, go, null, null) : null;
          } catch {
            return null;
          }
        },
        destroy: () => {
          try {
            holder.Destroy();
          } catch {
          }
        }
      };
    }
    bundles(slug) {
      const table = this.env.win.__pk1_bundles;
      const entry = table ? table[slug] : void 0;
      if (!entry) return null;
      const address = (value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "";
      const out = { windows: address(entry.windows), android: address(entry.android) };
      return out.windows || out.android ? out : null;
    }
    // ---- snippets -----------------------------------------------------------------------------------------------
    snippets(slug) {
      const all = Array.from(this.env.doc.querySelectorAll("bs-snippet"));
      const mine = all.filter((el) => (el.getAttribute("name") || "") === slug);
      return mine.map((el, index) => this.wrap(el, slug, index, mine));
    }
    wrap(el, slug, index, sameName) {
      let wrapper = this.wrappers.get(el);
      if (!wrapper) {
        const made = {
          _index: index,
          _peers: sameName,
          getAttribute: (name) => el.getAttribute(name),
          attributeNames: () => typeof el.getAttributeNames === "function" ? el.getAttributeNames() : [],
          get connected() {
            return el.isConnected !== false;
          },
          get active() {
            const single = el.getAttribute("single");
            if (single === null || single === "false") return true;
            if ("ownsSingleton" in el) return el.ownsSingleton === slug;
            return made._peers.indexOf(el) === 0;
          },
          get index() {
            return made._index;
          }
        };
        wrapper = made;
        this.wrappers.set(el, made);
      }
      wrapper._index = index;
      wrapper._peers = sameName;
      return wrapper;
    }
    onSnippetsChanged(handler) {
      return subscribe(this.snippetHandlers, handler);
    }
    observeSnippets() {
      if (this.observer || !this.env.MutationObserver) return;
      let queued = false;
      const observer = new this.env.MutationObserver(() => {
        if (queued) return;
        queued = true;
        this.env.setTimeout(() => {
          queued = false;
          for (const handler of this.snippetHandlers.slice()) this.attempt("snippet handler", handler);
        }, 0);
      });
      observer.observe(this.env.doc.documentElement, { childList: true, subtree: true });
      this.observer = observer;
    }
    // ---- the local player ---------------------------------------------------------------------------------------
    async isVR() {
      try {
        return await this.scene.IsVR() === true;
      } catch {
        return false;
      }
    }
    async raycast(origin, direction, maxDistance, layerMask) {
      const BS = this.env.BS;
      const reply = await this.scene.Raycast(toBs3(BS, origin), toBs3(BS, direction), maxDistance, layerMask);
      if (typeof reply !== "string") return null;
      const parts = reply.split("\xB6");
      if (parts.length < 8) return null;
      const n = parts.slice(2, 8).map(Number);
      return { objectId: parts[1], point: new Vector3(n[0], n[1], n[2]), normal: new Vector3(n[3], n[4], n[5]) };
    }
    onPose(handler) {
      return subscribe(this.poseHandlers, handler);
    }
    onInput(handler) {
      return subscribe(this.inputHandlers, handler);
    }
    haptic(side, strength, seconds2) {
      this.attempt("SendHapticImpulse", () => this.scene.SendHapticImpulse(strength, seconds2, side));
    }
    teleport(position, yDegrees, stopMovement) {
      this.attempt("TeleportTo", () => this.scene.TeleportTo(toBs3(this.env.BS, position), yDegrees, stopMovement));
    }
    setAbility(ability, allowed) {
      this.attempt("SetCan" + ability, () => this.scene["SetCan" + ability](allowed));
    }
    setBlock(control, blocked) {
      this.attempt("SetBlock" + control, () => this.scene["SetBlock" + control](blocked));
    }
    // ---- helpers ------------------------------------------------------------------------------------------------
    /** Runs a bridge call whose result nobody waits for; a failure is logged, never thrown into game code. */
    attempt(what, call) {
      try {
        const result = call();
        if (result && typeof result.then === "function") {
          result.then(void 0, (error) => this.log("warn", `${what} failed: ${describe(error)}`));
        }
      } catch (error) {
        this.log("warn", `${what} failed: ${describe(error)}`);
      }
    }
    async attemptAsync(what, call) {
      try {
        await call();
        return true;
      } catch (error) {
        this.log("debug", `${what} failed: ${describe(error)}`);
        return false;
      }
    }
    /** @internal for BsHostObject */
    get api() {
      return this.env.BS;
    }
    /** @internal for BsHostObject */
    userSession(user) {
      return user && typeof user.id === "string" ? user.id : void 0;
    }
  };
  var BsHostObject = class {
    constructor(platform, key, path, go, synced, seat) {
      __publicField(this, "key");
      __publicField(this, "path");
      __publicField(this, "platform");
      __publicField(this, "go");
      __publicField(this, "synced");
      __publicField(this, "seat");
      __publicField(this, "watchers", []);
      __publicField(this, "watching", false);
      __publicField(this, "attached", null);
      this.platform = platform;
      this.key = key;
      this.path = path;
      this.go = go;
      this.synced = synced;
      this.seat = seat;
    }
    on(kind, handler) {
      const name = HOST_EVENTS[kind];
      if (!name) return () => {
      };
      const listener = (event) => {
        const d = event && event.detail ? event.detail : {};
        const detail = {};
        if (d.point) detail.point = from3(d.point);
        if (d.normal) detail.normal = from3(d.normal);
        if (typeof d.side === "number") detail.side = d.side;
        if (typeof d.name === "string") detail.otherName = d.name;
        const sid = this.platform.userSession(d.user);
        if (sid) detail.playerSid = sid;
        handler(detail);
      };
      this.go.On(name, listener);
      return () => this.go.Off(name, listener);
    }
    setTransform(patch) {
      const BS = this.platform.api;
      const out = {};
      if (patch.position) out.position = toBs3(BS, patch.position);
      if (patch.localPosition) out.localPosition = toBs3(BS, patch.localPosition);
      if (patch.localScale) out.localScale = toBs3(BS, patch.localScale);
      if (patch.rotation) out.rotation = new BS.Quaternion(patch.rotation.x, patch.rotation.y, patch.rotation.z, patch.rotation.w);
      if (patch.localRotation) out.localRotation = new BS.Quaternion(patch.localRotation.x, patch.localRotation.y, patch.localRotation.z, patch.localRotation.w);
      this.platform.attempt("SetTransform", () => this.go.SetTransform(out));
    }
    /**
     * Asking to watch a transform makes the host push its current value before it answers
     * (BSScene.WatchJsTransform calls SyncProperties(true)), so one round trip is a fresh read.
     * UNVERIFIED in the app: that the push reaches the page before the answer does.
     */
    async readTransform() {
      const PN = this.platform.api.PN ?? this.platform.api.PropertyName;
      try {
        await this.go.WatchTransform([PN.position, PN.rotation], () => this.report());
        this.watching = true;
      } catch {
        return null;
      }
      return this.current();
    }
    watchTransform(handler) {
      this.watchers.push(handler);
      if (!this.watching) void this.readTransform();
      return () => {
        const at = this.watchers.indexOf(handler);
        if (at >= 0) this.watchers.splice(at, 1);
      };
    }
    current() {
      const t = this.go.transform;
      if (!t || !t.position) return null;
      const r = t.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
      return { position: from3(t.position), rotation: new Quaternion(Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0, r.w === void 0 ? 1 : Number(r.w)) };
    }
    report() {
      const now = this.current();
      if (now) for (const watcher of this.watchers.slice()) watcher(now);
    }
    setActive(active) {
      this.platform.attempt("SetActive", () => this.go.SetActive(active));
    }
    setLayer(layer) {
      this.platform.attempt("SetLayer", () => this.go.SetLayer(layer));
    }
    takeOwnership() {
      if (this.synced) this.platform.attempt("TakeOwnership", () => this.synced.TakeOwnership());
    }
    async doIOwn() {
      if (!this.synced) return false;
      try {
        return await this.synced.DoIOwn() === true;
      } catch {
        return false;
      }
    }
    /** UNVERIFIED: that a kit object's own BSAudioSource is known to the page once the object is. */
    playClip(index) {
      const BS = this.platform.api;
      const source = this.go.GetComponent ? this.go.GetComponent((BS.CT ?? BS.ComponentType).AudioSource) : null;
      if (source) this.platform.attempt("PlayOneShot", () => source.PlayOneShot(index));
      else this.platform.log("warn", `no audio source known on ${this.path}`);
    }
    sit() {
      if (this.seat) this.platform.attempt("Sit", () => this.seat.Sit());
    }
    stand() {
      if (this.seat) this.platform.attempt("Stand", () => this.seat.Stand());
    }
    /** UNVERIFIED in Play mode: BS.AttachedObject added to a kit object, attachment point set, then Attach(local user id). */
    attachToHand(side, position, rotation) {
      const BS = this.platform.api;
      const uid = this.platform.local().uid;
      void (async () => {
        try {
          if (!this.attached) {
            this.attached = await this.go.AddComponent(
              new BS.AttachedObject({
                uid,
                attachmentPosition: new BS.Vector3(position.x, position.y, position.z),
                attachmentRotation: new BS.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
                attachmentType: 1,
                // NonPhysics
                attachmentPoint: side === 0 ? 1 : 2,
                // LeftHand, RightHand
                autoSync: false,
                jointAvatar: false
              })
            );
          } else {
            this.attached.attachmentPoint = side === 0 ? 1 : 2;
            this.attached.attachmentPosition = new BS.Vector3(position.x, position.y, position.z);
            this.attached.attachmentRotation = new BS.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
          }
          await this.attached.Attach(uid);
        } catch (error) {
          this.platform.log("warn", `AttachedObject on ${this.path}: ${String(error)}`);
        }
      })();
    }
    detach() {
      if (!this.attached) return;
      const uid = this.platform.local().uid;
      this.platform.attempt("Detach", () => this.attached.Detach(uid));
    }
    releaseGrab() {
      this.platform.attempt("ReleaseGrab", () => this.go.ReleaseGrab());
    }
  };
  function subscribe(list, item) {
    list.push(item);
    return () => {
      const at = list.indexOf(item);
      if (at >= 0) list.splice(at, 1);
    };
  }
  function toBs3(BS, v) {
    return new BS.Vector3(v.x, v.y, v.z);
  }
  function from3(v) {
    return new Vector3(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0);
  }
  function pose(source) {
    const p = source?.position ?? {};
    const r = source?.rotation ?? {};
    return { position: from3(p), rotation: new Quaternion(Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0, r.w === void 0 ? 1 : Number(r.w)) };
  }
  function clampInt(value, max) {
    const n = Math.trunc(Number(value) || 0);
    return n < 0 ? 0 : n > max ? max : n;
  }
  function errorCode(error) {
    if (error && typeof error === "object" && typeof error.code === "string") return error.code;
    return "internal";
  }
  function describe(error) {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : JSON.stringify(error);
  }

  // pk-hidden-role.entry.ts
  var env = pageEnv();
  var claimed = env.win.__pk1 && env.win.__pk1.games && Object.prototype.hasOwnProperty.call(env.win.__pk1.games, src_default.slug);
  if (!claimed) boot(new BsPlatform(env), src_default, bindings_default);
})();
