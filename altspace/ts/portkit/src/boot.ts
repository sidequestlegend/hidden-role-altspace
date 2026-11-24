// What a built game script runs: claim the slug on the page, then keep one GameInstance per `<bs-snippet>`
// element of this game, starting and stopping them as elements come and go.

import { validateBindings, type Bindings } from "./bindings.ts";
import { GameInstance, type GameDefinition } from "./instance.ts";
import { instanceKeyFor, isValidSlug } from "./names.ts";
import type { Platform, SnippetElement } from "./types.ts";

export const RUNTIME_VERSION = "0.1.0";

export class GameRuntime {
  readonly platform: Platform;
  readonly game: GameDefinition;
  readonly bindings: Bindings;
  /** Running instances by instance key. */
  readonly instances = new Map<string, GameInstance>();
  /** One object for every instance of this game on the page (Behaviour.Shared): page memory, not synced or saved. */
  readonly shared: Record<string, unknown> = {};
  private stopped = false;
  private unsubs: Array<() => void> = [];

  constructor(platform: Platform, game: GameDefinition, bindings: Bindings) {
    this.platform = platform;
    this.game = game;
    this.bindings = bindings;
  }

  /** Waits for the page, then serves every element of this game, now and later. */
  async start(): Promise<void> {
    await this.platform.whenReady();
    if (this.stopped) return;
    this.unsubs.push(this.platform.onSnippetsChanged(() => this.scan()));
    this.unsubs.push(
      this.platform.onSessionChanged(() => {
        // A new session is a new player as far as the room is concerned: every instance starts over.
        this.platform.log("warn", `[${this.game.slug}] the session changed; restarting every instance`);
        for (const instance of this.instances.values()) instance.dispose();
        this.instances.clear();
        this.scan();
      }),
    );
    this.scan();
  }

  /** Brings the running instances in line with the elements on the page. */
  scan(): void {
    if (this.stopped) return;
    const wanted = new Map<string, SnippetElement>();
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

  instance(key: string): GameInstance | undefined {
    return this.instances.get(key);
  }

  stop(): void {
    this.stopped = true;
    for (const unsub of this.unsubs.splice(0)) unsub();
    for (const instance of this.instances.values()) instance.dispose();
    this.instances.clear();
  }
}

/**
 * The entry point of a game script. Returns null when another copy of the script already serves this slug on
 * the page (the script was loaded twice): this copy then does nothing.
 */
export function boot(platform: Platform, game: GameDefinition, rawBindings: unknown): GameRuntime | null {
  if (!isValidSlug(game.slug)) throw new Error(`'${game.slug}' is not a valid slug`);
  const bindings = validateBindings(rawBindings);
  if (bindings.slug !== game.slug) throw new Error(`bindings.json is for '${bindings.slug}', the game is '${game.slug}'`);
  if (!platform.claimGame(game.slug, { runtime: RUNTIME_VERSION, bindings: bindings.hash ?? "" })) return null;
  const runtime = new GameRuntime(platform, game, bindings);
  runtime.start().catch((error) => platform.log("error", `[${game.slug}] could not start: ${error instanceof Error ? error.message : String(error)}`));
  return runtime;
}
