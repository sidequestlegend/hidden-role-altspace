// Builds one game's script: type-check, lint, then one IIFE file `pk-<slug>.js` with the runtime, the game and
// its bindings.json inside.
//
//   node tools/build.ts --game sample                         (the kit's own sample -> dist/pk-tic-tac-toe.js)
//   node portkit/tools/build.ts --game . --out ../Assets/WebRoot      (in a game's ts folder)
//
// Options:
//   --game <dir>      folder holding src/index.ts (default export: the GameDefinition) and bindings.json
//   --out <dir>       where to write (default: <portkit>/dist for the sample, <game>/dist otherwise)
//   --no-check        skip `tsc --noEmit` and the lint (for a quick rebuild)
//   --minify          minify the output

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { argv, cwd, execPath, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { lint } from "./lint.ts";

const portkit = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface BuildOptions {
  game: string;
  out?: string;
  check?: boolean;
  minify?: boolean;
}

export interface BuildResult {
  file: string;
  slug: string;
  bytes: number;
}

function slash(path: string): string {
  return path.split("\\").join("/");
}

/** Finds the tsconfig that covers the game: its own, or the kit's. */
function tsconfigFor(game: string): string {
  const own = join(game, "tsconfig.json");
  return existsSync(own) ? own : join(portkit, "tsconfig.json");
}

export async function buildGame(options: BuildOptions): Promise<BuildResult> {
  const game = resolve(cwd(), options.game);
  const entry = join(game, "src", "index.ts");
  const bindingsPath = join(game, "bindings.json");
  if (!existsSync(entry)) throw new Error(`no ${entry}: a game exports its GameDefinition from src/index.ts`);
  if (!existsSync(bindingsPath)) throw new Error(`no ${bindingsPath}: the kit builder writes it`);
  const bindings = JSON.parse(readFileSync(bindingsPath, "utf8")) as { slug?: unknown; hash?: unknown; schema?: unknown };
  if (typeof bindings.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(bindings.slug)) throw new Error(`${bindingsPath}: slug is missing or not a slug`);
  if (bindings.schema !== 1) throw new Error(`${bindingsPath}: schema ${String(bindings.schema)} is not 1`);
  const slug = bindings.slug;

  if (options.check !== false) {
    const tsc = join(portkit, "node_modules", "typescript", "bin", "tsc");
    const local = join(game, "node_modules", "typescript", "bin", "tsc");
    const checked = spawnSync(execPath, [existsSync(local) ? local : tsc, "--noEmit", "-p", tsconfigFor(game)], { stdio: "inherit" });
    if (checked.status !== 0) throw new Error("tsc --noEmit failed");
    const violations = lint([join(game, "src"), join(portkit, "src")], game);
    for (const v of violations) console.error(`${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
    if (violations.length) throw new Error(`${violations.length} lint violation(s): only the platform adapters may touch the page or the clock`);
  }

  // A game's licence header (its upstream's licence, copyright lines, where the source is): <game>/script-header.txt,
  // put in one comment at the top of the built script, before the runtime's own line. A GPL port must carry it.
  const headerPath = join(game, "script-header.txt");
  let header = "";
  if (existsSync(headerPath)) {
    const text = readFileSync(headerPath, "utf8").replace(/\r\n/g, "\n").trim();
    if (text.includes("*/")) throw new Error(`${headerPath} must not contain "*/"`);
    if (/[^\x09\x0a\x20-\x7e]/.test(text)) throw new Error(`${headerPath} must be plain ASCII (the script is written as ASCII)`);
    header = "/*!\n" + text.split("\n").map((line) => (" * " + line).trimEnd()).join("\n") + "\n */\n";
  }
  // The runtime bundled into the script is portkit's, under the MIT licence, whose notice goes with every copy.
  const licencePath = join(portkit, "LICENSE");
  if (!existsSync(licencePath)) throw new Error(`${licencePath} is missing: the built script must carry portkit's licence`);
  const licence = readFileSync(licencePath, "utf8").replace(/\r\n/g, "\n").trim();
  header += "/*! The portkit runtime in this file:\n" + licence.split("\n").map((line) => (" * " + line).trimEnd()).join("\n") + "\n */\n";

  const outDir = resolve(cwd(), options.out ?? join(game === join(portkit, "sample") ? portkit : game, "dist"));
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `pk-${slug}.js`);
  // The entry is generated: the game, its bindings and the app's adapter, started once per page.
  const stdin = [
    `import game from ${JSON.stringify(slash(entry))};`,
    `import bindings from ${JSON.stringify(slash(bindingsPath))};`,
    `import { boot } from ${JSON.stringify(slash(join(portkit, "src", "boot.ts")))};`,
    `import { BsPlatform, pageEnv } from ${JSON.stringify(slash(join(portkit, "src", "platform", "bs.ts")))};`,
    `const env = pageEnv();`,
    // Loading the script twice must be harmless: the second copy sees the slug claimed and does nothing at all.
    `const claimed = env.win.__pk1 && env.win.__pk1.games && Object.prototype.hasOwnProperty.call(env.win.__pk1.games, game.slug);`,
    `if (!claimed) boot(new BsPlatform(env), game, bindings);`,
  ].join("\n");
  await build({
    stdin: { contents: stdin, resolveDir: game, sourcefile: `pk-${slug}.entry.ts`, loader: "ts" },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    charset: "ascii",
    legalComments: "none",
    minify: options.minify === true,
    outfile: file,
    logLevel: "warning",
    banner: { js: header + `/* pk-${slug}.js: portkit runtime with the rules of '${slug}' (protocol pk1, bindings ${typeof bindings.hash === "string" && bindings.hash ? bindings.hash : "unhashed"}). Built file: do not edit. */` },
  });
  return { file, slug, bytes: statSync(file).size };
}

function parseArgs(args: string[]): BuildOptions {
  const options: BuildOptions = { game: "sample" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--game") options.game = args[++i] ?? "";
    else if (arg === "--out") options.out = args[++i];
    else if (arg === "--no-check") options.check = false;
    else if (arg === "--minify") options.minify = true;
    else throw new Error(`unknown option ${arg}`);
  }
  return options;
}

if (argv[1] && resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  buildGame(parseArgs(argv.slice(2))).then(
    (result) => console.log(`built ${slash(result.file)} (${result.slug}, ${result.bytes} bytes)`),
    (error) => {
      console.error(`build failed: ${error instanceof Error ? error.message : String(error)}`);
      exit(1);
    },
  );
}
