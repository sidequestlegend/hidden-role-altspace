// The lint that keeps the page out of the runtime, and the build that makes one script per game.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildGame } from "../tools/build.ts";
import { check, lint } from "../tools/lint.ts";
import { makeRoom, SAMPLE_KIT, SLUG } from "./helpers.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("nothing outside the platform adapters touches the page or the clock", () => {
  const found = lint(["src", "sample/src"], root);
  assert.deepEqual(found.map((v) => `${v.file}:${v.line} ${v.text}`), []);
});

test("the lint catches what it should and leaves alone what it should", () => {
  const rules = (source: string) => check(source).map((v) => `${v.rule}:${v.line}`);
  // Uses of the page.
  assert.deepEqual(rules("const s = BS.Scene.GetInstance();"), ["page:1"]);
  assert.deepEqual(rules("x = env.BS.Scene;\ny = BS?.Scene;\nz = BS['Scene'];"), ["page:1", "page:2", "page:3"]);
  assert.deepEqual(rules("window.addEventListener('x', f);\nconst d = document;\nglobalThis.foo = 1;"), ["page:1", "page:2", "page:3"]);
  assert.deepEqual(rules("localStorage.setItem('a', 'b')"), ["page:1"]);
  assert.deepEqual(rules("const text = `${window.name}!`;"), ["page:1"]);
  // Uses of the clock and of randomness.
  assert.deepEqual(rules("setTimeout(() => {}, 5);\nconst t = Date.now();\nconst r = Math.random();\nperformance.now();"), ["clock:1", "clock:2", "clock:3", "clock:4"]);
  assert.deepEqual(rules("const key = await crypto.subtle.digest('SHA-256', bytes);"), ["clock:1"]);
  // Not uses: comments, strings, regular expressions, members, and names being declared.
  assert.deepEqual(rules("// window.BS.Scene and Date.now()\n/* document */\nconst a = 'window.BS.x';\nconst b = \"Date\";"), []);
  assert.deepEqual(rules("const re = /window|document|BS\\./g;\nconst n = a / window2 / 3;"), []);
  assert.deepEqual(rules("this.env.window.x = 1;\nplatform.crypto.subtle;\nthis.clock.setTimeout(f, 1);\nMath.floor(x);"), []);
  assert.deepEqual(rules("interface E { window: unknown; crypto?: unknown }\nconst o = { document: 1, Date: 2 };"), []);
  assert.deepEqual(rules("const label = `BS. is a name` + 'setTimeout';\nconst BSa = 1; BSa.x;"), []);
  assert.deepEqual(rules("  setTimeout(fn: () => void, ms: number): number; // lint-ok"), []);
  // A template's expression is code even inside a string.
  assert.deepEqual(rules("const s = `a ${ Date.now() } b ${ `inner ${ document.title }` }`;"), ["clock:1", "page:1"]);
});

test("the build makes one IIFE that runs in a page, and loading it twice is harmless", async () => {
  const out = mkdtempSync(join(tmpdir(), "portkit-build-"));
  try {
    const result = await buildGame({ game: join(root, "sample"), out, check: false });
    assert.equal(result.slug, SLUG);
    assert.ok(result.file.endsWith(`pk-${SLUG}.js`));
    const code = readFileSync(result.file, "utf8");
    assert.match(code, /^\/\*! The portkit runtime in this file:\n \* MIT License\n[\s\S]*?the portkit authors[\s\S]*?\*\/\n\/\* pk-tic-tac-toe\.js: [^\n]*\*\/\n\(\(\) => \{/, "portkit's licence, the banner, then one function expression: nothing leaks into the page's globals");
    assert.ok(code.trimEnd().endsWith("})();"));
    assert.ok(code.includes("Board/Cells/Cell4"), "bindings.json is compiled in");
    assert.ok(!code.includes("node:"), "nothing of Node, so nothing of the fake room, is in the script");
    assert.ok(/^[\x00-\x7f]*$/.test(code), "plain ASCII, whatever charset the host serves it with");

    // A page: the fake room's page API, as globals, in a realm of its own.
    const room = makeRoom();
    const client = room.join({ name: "Ann" });
    client.addSnippet(SLUG, { windows: SAMPLE_KIT });
    const env = client.env;
    const context = vm.createContext({
      window: env.win,
      document: env.doc,
      BS: env.BS,
      MutationObserver: env.MutationObserver,
      localStorage: env.storage,
      crypto: env.crypto,
      setTimeout: env.setTimeout,
      clearTimeout: env.clearTimeout,
      performance: { now: env.now },
      console: env.console,
    });
    (env.win as { __pk1_debug?: boolean }).__pk1_debug = true; // a test page: debugging hooks wanted
    const before = Object.keys(context).sort();
    vm.runInContext(code, context, { filename: "pk-tic-tac-toe.js" });
    vm.runInContext(code, context, { filename: "pk-tic-tac-toe.js" }); // the snippet's script tag, twice
    assert.deepEqual(Object.keys(context).sort(), before, "the script defines no globals");
    const registry = env.win.__pk1 as { games: Record<string, unknown>; debug: Record<string, { digest(): string; players(): Array<{ id: number; name: string }> }>; holders: Record<string, unknown> };
    assert.deepEqual(Object.keys(registry.games), [SLUG]);

    assert.ok(await room.runUntil(() => registry.debug[`${SLUG}:0`] !== undefined, 20000), "the instance started");
    await room.run(1000);
    // (Compared as text: the script's objects come from another realm.)
    assert.equal(JSON.stringify(registry.debug[`${SLUG}:0`]!.players()), JSON.stringify([{ id: 1, name: "Ann", sid: client.sid }]));
    assert.equal(client.graph(SLUG).text.get("status"), "Waiting for players");
    assert.deepEqual(Object.keys(registry.holders), [`${SLUG}:0`]);
    assert.equal(room.stateKeys().filter((key) => key.endsWith(".ref")).length, 1);

    // The built script and the sources agree: a player running the sources joins the same game.
    const { arrive, gameOf } = await import("./helpers.ts");
    const other = arrive(room, { name: "Bob" });
    assert.ok(await room.runUntil(() => other.hasInstance(SLUG) && other.instance(SLUG).started, 20000));
    client.click(SLUG, "0", "seatX");
    await room.run(2000);
    assert.deepEqual(gameOf(other).seats, [1, -1]);
    assert.equal(registry.debug[`${SLUG}:0`]!.digest(), other.instance(SLUG).digest());
    assert.deepEqual(client.logged("error"), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
