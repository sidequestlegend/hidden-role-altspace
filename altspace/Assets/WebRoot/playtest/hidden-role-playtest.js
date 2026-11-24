// Rungs 3 and 4: the hidden-role station in editor Play mode. Not part of the snippet: the test page loads it before
// the snippet. Clicks go through the SDK's desktop player (portkit's InputSim: a mouse of the test's own; the SDK casts
// its own rays and raises the page's click events), walking through this project's `walk` command (a body-sized capsule
// moved against the kit's colliders: the SDK's desktop player is a fly camera that passes through walls), and what
// Unity shows is read with portkit's probe.
//
// window.__hrPlan: "single" (one person and five bots: a whole round of play) or "multi" (two Local Multiplayer players
// and bots: own roles, a muster moving both, a late join by reload as an observer in the lounge).
(function () {
  "use strict";
  const KEY = "hidden-role:0";
  const HOLDER = "pk1:hidden-role:0";
  const ST = { Lobby: 0, Playing: 1, Muster: 2, Ended: 3 };
  const ROLE = { 0: "unassigned", 1: "technician", 2: "saboteur", 3: "observer" };
  const KIND = { 0: "hold", 1: "tap", 2: "timing" };
  const say = (kind, what, detail) => console.log("PKTEST " + kind + " " + what + (detail !== undefined ? ": " + detail : ""));
  let passed = 0;
  let failed = 0;
  const seen = new Set();
  const check = (ok, what, detail) => {
    if (ok) passed++;
    else failed++;
    say(ok ? "PASS" : "FAIL", what, detail);
    if (ok) seen.add(what);
    return ok;
  };
  const replies = new Map();
  let count = 0;
  window.__pktest = Object.assign(window.__pktest || {}, {
    reply(id, text) {
      const resolve = replies.get(id);
      if (resolve) {
        replies.delete(id);
        resolve(text);
      }
    },
  });
  const cmd = (line, ms) =>
    new Promise((resolve) => {
      const id = "h" + ++count;
      replies.set(id, resolve);
      console.log("PKTEST CMD " + id + " " + line);
      setTimeout(() => {
        if (replies.delete(id)) resolve("error: no reply");
      }, ms || 30000);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms, step) {
    const end = Date.now() + ms;
    for (;;) {
      let value = false;
      try {
        value = test();
      } catch (e) {
        value = false;
      }
      if (value) return value;
      if (Date.now() > end) return false;
      await sleep(step || 100);
    }
  }
  const dbg = () => window.__pk1 && window.__pk1.debug && window.__pk1.debug[KEY];
  const m = () => dbg().match();
  const path = (key) => dbg().pathOf(key);
  const probe = (what, p, extra) => cmd("probe " + HOLDER + " " + what + " " + p.replace(/ /g, "%20") + (extra ? " " + extra : ""));
  const num = (text) => text.split(" ").map(Number);
  const fmt = (v) => v.map((x) => Number(x).toFixed(2)).join(",");
  const world = (x, y, h) => dbg().world(x, y, h || 0);
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  async function where() {
    const r = await cmd("where");
    const v = num(r);
    return { feet: [v[0], v[1], v[2]], text: r };
  }

  /** The local player's position on the map, from Unity (feet), as the page converts it. */
  async function mapHere() {
    const w = (await where()).feet;
    const at = dbg().here();
    return { unity: w, page: at };
  }

  /**
   * Turns to an object and puts the mouse on it. "look" centres it on the screen, where the last object clicked
   * usually was too: the SDK's desktop pointer then still acts on that one (seen: a Start click that pressed Stop
   * again), so the mouse is first moved off it and back.
   */
  async function lookAt(key) {
    const pos = await probe("pos", path(key));
    if (pos.startsWith("error")) return null;
    await cmd("look " + pos);
    const v = num(pos);
    await cmd(`pointer ${v[0]} ${v[1] - 0.25} ${v[2]}`);
    await cmd("wait 3");
    await cmd("pointer " + pos);
    return pos;
  }

  async function clickKey(key, what) {
    const pos = await lookAt(key);
    if (!pos) {
      say("INFO", "click " + what + ": no position for " + key);
      return false;
    }
    const r = await cmd("click " + pos);
    say("INFO", "click " + what, r + " at " + pos);
    return r.startsWith("ok");
  }

  /**
   * Walks to a map point over the rules' own route (radius 0.3), each leg with the `walk` command. Stops `stopShort`
   * metres before the goal. Returns { ok, legs, blocked } and logs each leg that did not arrive.
   */
  async function walkTo(tx, ty, stopShort, label) {
    let legs = 0;
    let lastReply = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      // where the page thinks the head is; before the player has moved at all, the page has no pose yet: Unity's word
      let here = dbg().here();
      if (!here) {
        const w = (await where()).feet;
        here = dbg().toMap(w[0], w[1], w[2]);
      }
      const left = Math.hypot(tx - here[0], ty - here[1]);
      if (left <= (stopShort || 0.3) + 0.15) return { ok: true, legs, left };
      const route = dbg().route(here[0], here[1], tx, ty, 0.3);
      if (!route.length) return { ok: false, legs, left, why: "no route" };
      // the first route point not already underfoot (the rules' steering can name the grid point the walker stands on)
      let at = route.findIndex((q) => Math.hypot(q[0] - here[0], q[1] - here[1]) > 0.35);
      if (at < 0) at = route.length - 1;
      let next = route[at];
      const d = Math.hypot(next[0] - here[0], next[1] - here[1]);
      // stop short on the last leg
      if (at === route.length - 1 && stopShort) {
        const k = Math.max(0, (d - stopShort * 0.6) / d);
        next = [here[0] + (next[0] - here[0]) * k, here[1] + (next[1] - here[1]) * k];
      }
      const w = world(next[0], next[1]);
      lastReply = await cmd("walk " + w[0].toFixed(3) + " " + w[2].toFixed(3) + " 3.5", 120000);
      legs++;
      if (!lastReply.startsWith("ok")) {
        say("INFO", (label || "walk") + " leg " + legs + " toward " + fmt(next), lastReply);
        if (lastReply.indexOf("movement locked") >= 0) return { ok: false, legs, left, why: lastReply };
      }
      await sleep(350); // the page hears the new head pose
    }
    return { ok: false, legs, why: lastReply };
  }

  function bump(key) {
    try {
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || "0") + 1));
    } catch (e) {
      /* no storage */
    }
  }

  async function shot(name, from, at, fov) {
    const r = await cmd("shot " + name + " " + from.join(" ") + " " + at.join(" ") + " " + (fov || 70));
    say("INFO", "shot " + name, r);
  }

  async function stats(where_) {
    await sleep(600);
    const s = await cmd("stats");
    say("INFO", "frame stats " + where_, s);
    return s;
  }

  // ---- shared steps ----------------------------------------------------------------------------------------------

  async function waitStarted() {
    const ok = await until(() => dbg() && dbg().match && dbg().me, 120000, 250);
    check(!!ok, "the kit loads from a hand-written bs-snippet and the instance starts", ok ? "" : "no debug hooks after 120 s");
    if (!ok) return false;
    const exists = (await cmd("probe " + HOLDER + " exists .")) === "True";
    const hub = await probe("text", path("hubText"));
    check(exists && hub.indexOf("HIDDEN ROLE") === 0, "the hub board's text reached Unity (relay op text)", hub.split("\n").slice(0, 2).join(" / "));
    return true;
  }

  async function joinLobby() {
    await walkTo(0, 9.2, 0.3, "to the hub board");
    if (!dbg().joined()) await clickKey("joinButton", "Join");
    const ok = await until(() => dbg().joined(), 6000);
    return check(!!ok, "Join on the hub board puts the player in the lobby (click through the SDK's desktop player)", "joined " + dbg().joined());
  }

  async function startMatch(label) {
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      await clickKey("startButton", "Start");
      ok = await until(() => m().st === ST.Playing, 8000);
      if (!ok) say("INFO", `Start did not take (try ${i + 1}): referee ${dbg().isReferee()}, joined ${dbg().joined()}, state ${m().st}`);
    }
    const mm = m();
    check(!!ok, label, `state ${mm.st}, roster ${mm.sl.map((s) => s.n + (s.b ? "*" : "")).join(", ")}`);
    return !!ok;
  }

  /** The nearest open job of the local player's, by route length. */
  function pickJob() {
    const mine = dbg().mine();
    const here = dbg().here();
    if (!mine || !here) return null;
    let best = null;
    for (let id = 0; id < 22; id++) {
      if ((mine.a & (1 << id)) === 0 || (mine.c & (1 << id)) !== 0) continue;
      const job = dbg().job(id);
      const route = dbg().route(here[0], here[1], job.x, job.y, 0.3);
      let length = 0;
      let at = here;
      for (const p of route) {
        length += Math.hypot(p[0] - at[0], p[1] - at[1]);
        at = p;
      }
      if (!best || length < best.length) best = { job, length };
    }
    return best;
  }

  /** Works a console by clicking it as its kind needs. Returns true when the job is marked done. */
  async function workConsole(job) {
    const key = "console" + job.id;
    const bit = 1 << job.id;
    const done = () => (dbg().mine().c & bit) !== 0;
    let sawWork = 0;
    for (let attempt = 0; attempt < 4 && !done(); attempt++) {
      await lookAt(key);
      const pos = await probe("pos", path(key));
      if (job.kind === 0) {
        await cmd("click " + pos);
        for (let i = 0; i < 12; i++) {
          await sleep(120);
          sawWork = Math.max(sawWork, dbg().work());
        }
        await until(done, 3000);
      } else if (job.kind === 1) {
        for (let i = 0; i < 4; i++) {
          await cmd("click " + pos);
          await sleep(300);
          sawWork = Math.max(sawWork, dbg().work());
        }
        await until(done, 3000);
      } else {
        const t0 = Date.now();
        await cmd("click " + pos);
        // let go in the band: 70-82% of the 2.2 s sweep (1.54-1.80 s after the press reached the page)
        while (Date.now() - t0 < 1600) {
          await sleep(60);
          sawWork = Math.max(sawWork, dbg().work());
        }
        await cmd("click " + pos);
        await until(done, 3000);
      }
      say("INFO", `console ${job.id} (${KIND[job.kind]}) attempt ${attempt + 1}: done ${done()}, work bar peaked at ${sawWork}`);
    }
    check(sawWork > 0, "the work bar on the personal panel moves while the job is worked", `peak ${sawWork}`);
    return done();
  }

  // ---- rung 3: one person and five bots ---------------------------------------------------------------------------

  async function single() {
    if (!(await waitStarted())) return;
    await sleep(2000);
    await stats(`at the spawn, before walking (regions drawn ${dbg().regionsOn()} of 30)`);
    await shot("commons", world(-6, -9, 1.7), world(0, 6, 1.4), 75);
    if (!(await joinLobby())) return;
    const referee = await until(() => dbg().isReferee(), 20000, 250);
    check(!!referee, "the one lobby player is elected referee (declared candidates)", "referee " + JSON.stringify(dbg().referee()));
    let matchNo = 0;
    while (matchNo < 6) {
      matchNo++;
      // the test aid of the Node tests: Bot 1 is the saboteur, so the person is a technician
      dbg().force(["bot-1"]);
      const startsBefore = dbg().moves().filter((v) => v.why === "start").length;
      if (!(await startMatch(`a match starts with five bots (match ${matchNo})`))) return;
      const mm = m();
      check(mm.sl.length === 6 && mm.sl.filter((s) => s.b).length === 5, "the roster is the person and five bots", mm.sl.map((s) => s.n).join(", "));
      await until(() => dbg().mine() && dbg().mine().n === m().r, 8000);
      const slot = dbg().slot();
      check(dbg().role() === 1, "the person's own role arrives sealed: technician", `role ${ROLE[dbg().role()]}, public roles ${JSON.stringify(m().ro)}`);
      await until(() => dbg().moves().filter((v) => v.why === "start").length > startsBefore, 5000);
      await sleep(1200);
      const start = m().sp[slot];
      const moved = dbg().moves().filter((v) => v.why === "start").pop();
      const w = await where();
      const expected = world(start[0], start[1]);
      check(!!moved && dist2([w.feet[0], w.feet[2]], [expected[0], expected[2]]) < 0.6, "the person is taken to their start point", `start ${fmt(start)}, Unity feet ${w.text}`);
      const botActive = await probe("active", path("bot0"));
      const botPos1 = await probe("pos", path("bot0"));
      await sleep(1500);
      const botPos2 = await probe("pos", path("bot0"));
      check(botActive === "True" && botPos1 !== botPos2, "bot markers stand in the station and move", `${botPos1} -> ${botPos2}`);
      const panel = await probe("text", path("panelText"));
      check(panel.indexOf("You are a TECHNICIAN") >= 0, "the personal panel shows the person's role and jobs", panel.split("\n").slice(0, 3).join(" / "));

      // walk to a job and do it
      if (!seen.has("a job is completed by clicking its console")) {
        const pick = pickJob();
        say("INFO", `nearest job: ${pick.job.id} ${pick.job.name} (${KIND[pick.job.kind]}), route ${pick.length.toFixed(1)} m`);
        const t0 = Date.now();
        const walk = await walkTo(pick.job.x, pick.job.y, 0.7, "to console " + pick.job.id);
        await stats(`on the way, at console ${pick.job.id} (regions drawn ${dbg().regionsOn()} of 30)`);
        check(walk.ok, "the person walks to a job console through the station (capsule against the kit's colliders)", `${walk.legs} legs in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${walk.why || ""}`);
        if (walk.ok && m().st === ST.Playing && m().al[slot] === 1) {
          const cdBefore = m().cd;
          const done = await workConsole(pick.job);
          check(done, "a job is completed by clicking its console", `job ${pick.job.id} (${KIND[pick.job.kind]})`);
          if (done) {
            await until(() => m().cd > cdBefore, 4000);
            await sleep(600);
            const fill = await probe("scale", "Hub/Board/JobBar/Fill");
            const want = m().cd / m().ct;
            check(Math.abs(num(fill)[0] - want) < 0.02, "the jobs-done bar shows the station's progress (hub board, read in Unity)", `jobs ${m().cd}/${m().ct}, fill ${fill}`);
            const pfill = await probe("scale", "Personal/Panel/JobBar/Fill");
            check(Math.abs(num(pfill)[0] - want) < 0.02, "the personal panel's jobs bar shows it too", pfill);
            await shot("console", world(pick.job.x, pick.job.y - 2.5, 1.7), world(pick.job.x, pick.job.y, 1.1), 70);
          }
        }
      }

      // wait for a downed bot, then raise the alarm at it
      if (!seen.has("raising the alarm at a downed bot calls a muster")) {
        const body = await until(() => {
          const x = m();
          if (x.st !== ST.Playing) return null;
          for (let i = 0; i < x.sl.length; i++) if (x.sl[i].b && x.bd[i] && x.rp[i] === 1) return { slot: i, at: x.bd[i] };
          return null;
        }, 150000, 500);
        if (m().al[slot] !== 1) {
          say("INFO", "the person was eliminated by the saboteur bot before finding a body");
          const lounge = dbg().moves().filter((v) => v.why === "lounge").pop();
          const w2 = await where();
          check(!!lounge && w2.feet[1] < -60, "an eliminated player is sent to the observer lounge, 70 m down", w2.text);
          await nextMatch();
          continue;
        }
        if (!body) {
          say("INFO", "no bot was downed in time (state " + m().st + ")");
          await nextMatch();
          continue;
        }
        say("INFO", `${m().sl[body.slot].n} is down at ${fmt(body.at)}`);
        const reach = await walkTo(body.at[0], body.at[1], 1.0, "to the body");
        if (m().st !== ST.Playing || m().al[slot] !== 1) {
          await nextMatch();
          continue;
        }
        const ringBefore = dbg().here();
        const bodyKey = "body" + body.slot;
        const marker = await probe("active", path(bodyKey));
        check(marker === "True", "the downed bot's marker lies where it fell", `${path(bodyKey)} active ${marker}`);
        const markerPath = path(bodyKey);
        // the markers are bound in roster order of the bodies: find the marker the page placed at this body
        await clickKey(bodyKey, "the body marker (raise the alarm)");
        let muster = await until(() => m().st === ST.Muster, 5000);
        if (!muster) {
          say("INFO", "the click did not report it; the alarm key R");
          await cmd("key R tap");
          muster = await until(() => m().st === ST.Muster, 5000);
        }
        check(!!muster && m().mb === body.slot, "raising the alarm at a downed bot calls a muster", `walked ${reach.ok}, state ${m().st}, body slot ${m().mb}, marker ${markerPath}`);
        if (!muster) {
          await nextMatch();
          continue;
        }
        await musterAndVote(slot, ringBefore, body.slot);
      }
      if (seen.has("raising the alarm at a downed bot calls a muster") && seen.has("after the vote the living are sent back where they stood")) break;
      if (seen.has("raising the alarm at a downed bot calls a muster") && !seen.has("after the vote the living are sent back where they stood")) {
        // the match ended at that vote: one more match, with a muster from the post, for the return
        if (m().st === ST.Lobby || m().st === ST.Ended) await until(() => m().st === ST.Lobby, 10000);
        else await nextMatch();
        dbg().force(["bot-1"]);
        if (!(await startMatch("another match starts"))) return;
        await until(() => dbg().mine() && dbg().mine().n === m().r, 8000);
        const s2 = dbg().slot();
        await walkTo(0, -1.2, 0.2, "to the muster post");
        const ringBefore = dbg().here();
        await callMuster();
        const muster = await until(() => m().st === ST.Muster, 5000);
        check(!!muster && m().mb === -1, "the muster post calls a muster", `state ${m().st}, caller slot ${m().mr}`);
        if (muster) await musterAndVote(s2, ringBefore, -1);
        break;
      }
    }
    await stats("end");
    await shot("station", world(-30, -20, 2.2), world(-45, -18, 1.0), 75);
  }

  /** The muster post, once no fault blocks it (a running fault does, as upstream). */
  async function callMuster() {
    for (let i = 0; i < 6 && m().st === ST.Playing; i++) {
      if (m().fk) {
        say("INFO", "a fault blocks the muster post; waiting for the bots to reset it");
        await until(() => !m().fk || m().st !== ST.Playing, 60000, 500);
      }
      await clickKey("musterPost", "the muster post");
      if (await until(() => m().st === ST.Muster, 4000)) return true;
    }
    return false;
  }

  async function nextMatch() {
    if (m().st !== ST.Lobby) {
      const below = (await where()).feet[1] < -60;
      await clickKey(below ? "loungeAbortButton" : "abortButton", below ? "Stop match (lounge board)" : "Stop match");
      await until(() => m().st === ST.Lobby, 10000);
    }
    await walkTo(0, 9.2, 0.3, "back to the hub board");
  }

  let musterVotes = 0;
  async function musterAndVote(slot, before, bodySlot) {
    musterVotes = dbg().events("vote").filter((e) => e.actor === slot).length;
    await sleep(1500);
    const ring = dbg().moves().filter((v) => v.why === "ring").pop();
    const w = await where();
    const post = world(0, 0);
    const r = dist2([w.feet[0], w.feet[2]], [post[0], post[2]]);
    check(!!ring && Math.abs(r - 2.8) < 0.4, "the muster gathers the living at the ring round the post", `${r.toFixed(2)} m from the post, Unity feet ${w.text}`);
    const tryWalk = await cmd("walk " + (w.feet[0] + 1).toFixed(2) + " " + w.feet[2].toFixed(2) + " 3", 10000);
    check(tryWalk.indexOf("movement locked") >= 0, "players stand still in the ring (movement locked)", tryWalk);
    const board = await probe("text", path("musterText"));
    check(board.indexOf(bodySlot >= 0 ? "ALARM" : "MUSTER") === 0, "the muster board says why and who", board.split("\n").slice(0, 2).join(" / "));
    await shot("muster", [w.feet[0], w.feet[1] + 1.7, w.feet[2]], [post[0], post[1] + 2.2, post[2]], 70);
    // vote for a living bot that is not the saboteur (Bot 1), so the match goes on
    const x = m();
    let target = -1;
    for (let i = 0; i < x.sl.length; i++) if (x.sl[i].b && x.al[i] === 1 && x.sl[i].u !== "bot-1") target = i;
    const label = target >= 0 ? await probe("text", path("voteLabel" + target)) : "";
    check(target >= 0 && label === x.sl[target].n, "the muster board's buttons name the living", `button ${target}: '${label}'`);
    if (target >= 0) await clickKey("vote" + target, "vote for " + x.sl[target].n);
    else await clickKey("abstainButton", "Abstain");
    const votesBefore = musterVotes;
    const voted = await until(() => m().vo[slot] === 1 || dbg().events("vote").filter((e) => e.actor === slot).length > votesBefore, 5000);
    musterVotes = dbg().events("vote").filter((e) => e.actor === slot).length;
    const mine = dbg().events("vote").filter((e) => e.actor === slot).pop();
    check(!!voted, "the person's ballot is counted (who voted is public, the choice is sealed)", `referee's record: ${JSON.stringify(mine)}, public voted flags ${JSON.stringify(m().vo)}`);
    const resolved = await until(() => m().st !== ST.Muster, 40000);
    const result = await probe("text", path("musterText"));
    check(!!resolved, "the vote resolves when all have voted", result.replace(/\n/g, " / "));
    await sleep(2000);
    if (m().st === ST.Playing && m().al[slot] === 1) {
      const back = dbg().moves().filter((v) => v.why === "return").pop();
      const w2 = await where();
      const want = world(before[0], before[1]);
      check(!!back && dist2([w2.feet[0], w2.feet[2]], [want[0], want[2]]) < 0.6, "after the vote the living are sent back where they stood", `before ${fmt(before)}, Unity feet ${w2.text}`);
      const free = await cmd("walk " + (w2.feet[0] + 0.3).toFixed(2) + " " + w2.feet[2].toFixed(2) + " 2", 10000);
      check(free.startsWith("ok"), "and may move again", free);
    } else {
      say("INFO", `the vote ended the match (state ${m().st}, winner ${m().w})`);
    }
  }

  // ---- rung 4: two players --------------------------------------------------------------------------------------
  const heard = [];
  function channel() {
    const scene = window.BS.Scene.GetInstance();
    scene.On("one-shot", (e) => {
      const data = e && e.detail && e.detail.data;
      if (typeof data !== "string" || data.indexOf("hrTest") < 0) return;
      try {
        heard.push(JSON.parse(data));
      } catch (x) {
        /* not ours */
      }
    });
    return (message) => scene.OneShot(JSON.stringify(Object.assign({ hrTest: 1 }, message)));
  }
  const reloaded = () => {
    try {
      return sessionStorage.getItem("hrTestReloaded") === "1";
    } catch (e) {
      return false;
    }
  };
  const hear = (kind) => until(() => heard.find((h) => h.kind === kind), 120000, 250);

  async function multi() {
    if (!(await waitStarted())) return;
    const send = channel();
    const back = reloaded();
    const two = await until(() => dbg().players().length >= 2, 90000, 500);
    check(!!two, "two players in the room", JSON.stringify(dbg().players()));
    if (!two) return;
    await sleep(2500);
    const me = dbg().me();
    if (back) return lateJoiner(send, me);
    const others = dbg().players().filter((p) => p.sid !== me.sid);
    const lead = me.sid < others[0].sid;
    say("INFO", (lead ? "A (starts, technician)" : "B (saboteur)") + " is " + me.name);
    await joinLobby();
    if (lead) {
      await until(() => heard.find((h) => h.kind === "joined"), 60000, 250);
      await until(() => dbg().isReferee(), 20000, 250);
      const bUid = heard.find((h) => h.kind === "joined").uid;
      dbg().force([bUid]);
      await startMatch("a match starts with both players and three bots");
    } else {
      send({ kind: "joined", uid: me.uid });
      await until(() => m().st === ST.Playing, 60000, 250);
    }
    await until(() => dbg().mine() && dbg().mine().n === m().r, 10000);
    const role = dbg().role();
    const panel = await probe("text", path("panelText"));
    const pub = m().ro;
    check(role === (lead ? 1 : 2) && pub.length === 0 && panel.indexOf("You are a " + (lead ? "TECHNICIAN" : "SABOTEUR")) >= 0,
      "each player sees only their own role (sealed entry; no role in the public record)", `${ROLE[role]}, public roles ${JSON.stringify(pub)}, panel '${panel.split("\n")[0]}'`);
    send({ kind: "role", role: ROLE[role], sees: panel.split("\n")[0] });
    const theirs = await hear("role");
    check(!!theirs && theirs.role !== ROLE[role], "the other page saw a different role of its own", theirs ? `${theirs.role}: '${theirs.sees}'` : "nothing heard");
    const slot = dbg().slot();
    if (lead) {
      await walkTo(0, -1.2, 0.2, "to the muster post");
      await callMuster();
    }
    const muster = await until(() => m().st === ST.Muster, 120000, 250);
    await sleep(2000);
    const w = await where();
    const post = world(0, 0);
    const r = dist2([w.feet[0], w.feet[2]], [post[0], post[2]]);
    const ring = dbg().moves().filter((v) => v.why === "ring").pop();
    check(!!muster && !!ring && Math.abs(r - 2.8) < 0.4, "the muster moves this player to the ring", `${r.toFixed(2)} m from the post`);
    send({ kind: "ring", r });
    const other = await hear("ring");
    check(!!other && Math.abs(other.r - 2.8) < 0.4, "and the other player too (a muster moves both)", other ? other.r.toFixed(2) + " m" : "nothing heard");
    await clickKey("abstainButton", "Abstain");
    await until(() => m().vo[slot] === 1, 5000);
    await until(() => m().st !== ST.Muster, 40000);
    await sleep(1500);
    send({ kind: "digest", at: "after the muster", digest: dbg().digest() });
    const dig = await hear("digest");
    check(!!dig && dig.digest === dbg().digest(), "both pages hold the same state after the muster (digest)", dig ? `${dig.digest} / ${dbg().digest()}` : "nothing heard");

    // a second match without B, who reloads its page while it runs: a late joiner
    if (lead) {
      if (m().st !== ST.Lobby) {
        await clickKey("abortButton", "Stop match");
        await until(() => m().st === ST.Lobby, 10000);
      }
      await walkTo(0, 9.2, 0.3, "back to the hub board");
      await until(() => heard.find((h) => h.kind === "left"), 60000, 250);
      dbg().force(null);
      await startMatch("A starts a second match without B");
      send({ kind: "started2", r: m().r });
      const backMsg = await hear("back");
      check(!!backMsg && backMsg.lounge, "B, back after a reload, is an observer in the lounge", backMsg ? JSON.stringify(backMsg) : "nothing heard");
      check(!!backMsg && backMsg.digest === dbg().digest(), "B's reloaded page holds the same state as A's (digest)", backMsg ? `${backMsg.digest} / ${dbg().digest()}` : "");
      await clickKey("abortButton", "Stop match");
    } else {
      await until(() => m().st === ST.Lobby, 30000, 250);
      await walkTo(0, 9.2, 0.3, "back to the hub board");
      if (dbg().joined()) await clickKey("joinButton", "Join (leave the lobby)");
      await until(() => !dbg().joined(), 6000);
      send({ kind: "left" });
      await hear("started2");
      await sleep(2000);
      try {
        sessionStorage.setItem("hrTestReloaded", "1");
      } catch (e) {
        /* no storage */
      }
      say("INFO", "B reloads its page while the match runs");
      await sleep(300);
      location.reload();
      await sleep(60000);
    }
  }

  async function lateJoiner(send, me) {
    try {
      sessionStorage.removeItem("hrTestReloaded");
    } catch (e) {
      /* nothing */
    }
    const inMatch = await until(() => m().st === ST.Playing, 30000, 250);
    check(!!inMatch && dbg().slot() < 0, "the reloaded page finds the match running and is not on its roster", `state ${m().st}, slot ${dbg().slot()}`);
    const lounge = await until(() => dbg().moves().some((v) => v.why === "lounge"), 20000, 250);
    await sleep(1500);
    const w = await where();
    const panel = await probe("text", path("panelText"));
    const loungeText = await probe("text", path("loungeText"));
    check(!!lounge && w.feet[1] < -60, "a late joiner is sent to the observer lounge, 70 m down", w.text);
    check(panel.indexOf("Observing") === 0 && loungeText.indexOf("Observer lounge") === 0, "the late joiner's panel and the lounge board say so", `${panel.split("\n")[0]} / ${loungeText.split("\n")[1] || ""}`);
    await sleep(1000);
    send({ kind: "back", lounge: !!lounge && w.feet[1] < -60, digest: dbg().digest() });
    await sleep(3000);
  }

  window.__hrRun = async function (plan) {
    try {
      if (plan === "idle") await sleep(900000);
      if (plan === "single") await single();
      else if (plan === "multi") await multi();
    } catch (e) {
      check(false, "the test ran to its end", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
    }
    say("INFO", "page result " + passed + " passed, " + failed + " failed");
    console.log("PKTEST DONE");
  };
  if (window.__hrPlan) window.__hrRun(window.__hrPlan);
})();
