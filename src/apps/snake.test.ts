// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Snake } from "./snake.js";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";

describe("Snake (game logic)", () => {
  // Deterministic rng so food placement never interferes with movement tests.
  const make = (onExit: () => void = () => {}) => new Snake(onExit, () => 0);

  it("starts as a length-3 snake in the middle, alive and scoreless", () => {
    const snap = make().snapshot();
    expect(snap).toEqual({
      length: 3,
      score: 0,
      dead: false,
      head: { x: 12, y: 8 },
    });
  });

  it("moves in the current direction each tick", () => {
    const s = make();
    s.setFood(0, 0);
    s.tick();
    expect(s.snapshot().head).toEqual({ x: 13, y: 8 });
    expect(s.snapshot().length).toBe(3);
  });

  it("turns when steered", () => {
    const s = make();
    s.setFood(0, 0);
    s.onText("w"); // up
    s.tick();
    expect(s.snapshot().head).toEqual({ x: 12, y: 7 });
  });

  it("ignores a 180° reversal into its own neck", () => {
    const s = make();
    s.setFood(0, 0);
    s.onText("a"); // left, opposite of the starting rightward motion
    s.tick();
    expect(s.snapshot().head).toEqual({ x: 13, y: 8 });
  });

  it("grows and scores when it eats", () => {
    const s = make();
    s.setFood(13, 8); // directly ahead of the head
    s.tick();
    const snap = s.snapshot();
    expect(snap.length).toBe(4);
    expect(snap.score).toBe(1);
  });

  it("dies on hitting a wall", () => {
    const s = make();
    s.setFood(0, 0);
    s.onText("w"); // head up toward the top wall
    for (let i = 0; i < 12; i++) s.tick();
    expect(s.snapshot().dead).toBe(true);
  });

  it("exits when you press q", () => {
    let exited = false;
    make(() => (exited = true)).onText("q");
    expect(exited).toBe(true);
  });
});

describe("snake (through the terminal)", () => {
  let term: Terminal | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function mount(): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      auth: new MemoryAuthAdapter(),
      session: { user: "guest" },
    });
    return root;
  }

  function press(root: HTMLElement, key: string, opts: KeyboardEventInit = {}): void {
    (root.querySelector(".term-kbd") as HTMLInputElement).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...opts }),
    );
  }

  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
  });

  it("opens the board and returns to the prompt on exit", async () => {
    const root = mount();
    (root.querySelector(".term-kbd") as HTMLInputElement).value = "snake";
    (root.querySelector(".term-kbd") as HTMLInputElement).dispatchEvent(
      new Event("input", { bubbles: true }),
    );
    press(root, "Enter");
    await flush();

    expect(root.querySelector(".sk-board")).not.toBeNull();

    press(root, "x", { ctrlKey: true }); // exit the game
    await flush();

    expect(root.querySelector(".sk-board")).toBeNull();
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@vera:~$");
  });
});
