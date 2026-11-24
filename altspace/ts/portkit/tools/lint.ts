// Fails when anything outside the platform adapters touches the page or the wall clock.
//
//   node tools/lint.ts [dir ...]        (default: src sample/src; in a game: node portkit/tools/lint.ts src portkit/src)
//
// Two rules, for every .ts file that is not under a `platform/` folder:
//   page     no `BS.` and no bare `window`, `document`, `globalThis`, `localStorage`, ...
//            The adapter (platform/bs.ts) is the only place that knows the page exists.
//   clock    no `setTimeout`, `Date`, `performance`, `Math.random`, `crypto`, ...
//            Time, timers and randomness come from the Platform, or tests could not run on virtual time.
//
// It reads tokens, not text: comments, strings and regular expressions are skipped, and `x.window` or a field
// named `crypto:` is not a use of the global. A line that has to name one of these words without using the
// global (an interface that declares a method called setTimeout) ends with the comment `// lint-ok`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { fileURLToPath } from "node:url";

export interface Violation {
  file: string;
  line: number;
  rule: "page" | "clock";
  text: string;
}

const PAGE = new Set(["window", "document", "globalThis", "self", "localStorage", "sessionStorage", "navigator", "location"]);
const CLOCK = new Set(["setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "requestAnimationFrame", "queueMicrotask", "Date", "performance", "crypto"]);
/** Words that can come before a regular expression literal. */
const BEFORE_REGEX = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await"]);

interface Token {
  kind: "word" | "punct";
  text: string;
  line: number;
}

/** Splits source into identifiers and punctuation, dropping comments, strings and regular expressions. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  const last = () => tokens[tokens.length - 1];
  const skipString = (quote: string) => {
    i++;
    while (i < n && source[i] !== quote) {
      if (source[i] === "\\") i++;
      if (source[i] === "\n") line++;
      i++;
    }
    i++;
  };
  /** The index just past a quoted string that starts at `from`. */
  const stringEnd = (from: number, quote: string): number => {
    let j = from + 1;
    while (j < n && source[j] !== quote) j += source[j] === "\\" ? 2 : 1;
    return j + 1;
  };
  /**
   * The index just past a template literal that starts at `from`. The `${...}` expressions directly inside it
   * are noted in `regions` (those of templates nested inside them are found when the region itself is scanned).
   */
  const templateEnd = (from: number, regions: Array<[number, number]> | null): number => {
    let j = from + 1;
    while (j < n && source[j] !== "`") {
      if (source[j] === "\\") {
        j += 2;
        continue;
      }
      if (source[j] === "$" && source[j + 1] === "{") {
        j += 2;
        const start = j;
        let depth = 1;
        while (j < n) {
          const c = source[j]!;
          if (c === "`") {
            j = templateEnd(j, null);
            continue;
          }
          if (c === '"' || c === "'") {
            j = stringEnd(j, c);
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}" && --depth === 0) break;
          j++;
        }
        regions?.push([start, j]);
      }
      j++;
    }
    return j + 1;
  };
  const skipTemplate = () => {
    const regions: Array<[number, number]> = [];
    const end = templateEnd(i, regions);
    // An expression inside a template is code, and is read as code.
    for (const [start, stop] of regions) {
      const at = line + source.slice(i, start).split("\n").length - 1;
      for (const inner of tokenize(source.slice(start, stop))) tokens.push({ ...inner, line: at + inner.line - 1 });
    }
    line += source.slice(i, end).split("\n").length - 1;
    i = end;
  };
  while (i < n) {
    const c = source[i]!;
    if (c === "\n") {
      line++;
      i++;
    } else if (c === " " || c === "\t" || c === "\r") i++;
    else if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      line += source.slice(i, stop).split("\n").length - 1;
      i = stop;
    } else if (c === '"' || c === "'") skipString(c);
    else if (c === "`") skipTemplate();
    else if (c === "/") {
      const before = last();
      const regex = !before || (before.kind === "punct" ? !")]}".includes(before.text) : BEFORE_REGEX.has(before.text));
      if (regex) {
        i++;
        let inClass = false;
        while (i < n && (inClass || source[i] !== "/") && source[i] !== "\n") {
          if (source[i] === "\\") i++;
          else if (source[i] === "[") inClass = true;
          else if (source[i] === "]") inClass = false;
          i++;
        }
        i++;
        while (i < n && /[a-z]/.test(source[i]!)) i++;
        tokens.push({ kind: "punct", text: ")", line }); // stands for "a value was here"
      } else {
        tokens.push({ kind: "punct", text: c, line });
        i++;
      }
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j]!)) j++;
      tokens.push({ kind: "word", text: source.slice(i, j), line });
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(source[j]!)) j++;
      tokens.push({ kind: "punct", text: ")", line });
      i = j;
    } else if (c === "?" && source[i + 1] === ".") {
      tokens.push({ kind: "punct", text: "?.", line });
      i += 2;
    } else {
      tokens.push({ kind: "punct", text: c, line });
      i++;
    }
  }
  return tokens;
}

/** The violations in one file's source. */
export function check(source: string, file = "<source>"): Violation[] {
  const tokens = tokenize(source);
  const found: Violation[] = [];
  const lines = source.split("\n");
  const report = (token: Token, rule: "page" | "clock") => {
    const text = lines[token.line - 1] ?? "";
    if (!/\/\/ lint-ok\s*$/.test(text)) found.push({ file, line: token.line, rule, text: text.trim() });
  };
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k]!;
    if (token.kind !== "word") continue;
    const before = tokens[k - 1];
    const after = tokens[k + 1];
    const member = before !== undefined && before.kind === "punct" && (before.text === "." || before.text === "?.");
    const accessed = after !== undefined && after.kind === "punct" && (after.text === "." || after.text === "?." || after.text === "[");
    // The page API by name, however it is reached.
    if (token.text === "BS" && accessed) {
      report(token, "page");
      continue;
    }
    if (member) {
      // `Math.random` is a member access, and the only one that matters.
      if (token.text === "random" && tokens[k - 2]?.text === "Math") report(token, "clock");
      continue;
    }
    // A name being declared (a field, a parameter, an object key) is not a use of the global.
    const declared = after !== undefined && after.kind === "punct" && (after.text === ":" || (after.text === "?" && tokens[k + 2]?.text === ":"));
    if (declared) continue;
    if (PAGE.has(token.text)) report(token, "page");
    else if (CLOCK.has(token.text)) report(token, "clock");
  }
  return found;
}

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist") continue;
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

/** Checks every .ts file under the given folders, except those under a `platform` folder. */
export function lint(dirs: string[], base = cwd()): Violation[] {
  const found: Violation[] = [];
  for (const dir of dirs) {
    for (const path of files(resolve(base, dir))) {
      if (path.split(sep).includes("platform")) continue;
      found.push(...check(readFileSync(path, "utf8"), relative(base, path).split(sep).join("/")));
    }
  }
  return found;
}

if (argv[1] && resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = argv.slice(2).length ? argv.slice(2) : ["src", "sample/src"];
  const found = lint(dirs);
  for (const v of found) console.error(`${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
  if (found.length) {
    console.error(`\n${found.length} violation(s): only the platform adapters may touch the page or the clock.`);
    exit(1);
  }
  console.log(`lint: ${dirs.join(", ")} clean (page and clock rules)`);
}
