// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Todo } from "./todo.js";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";

const enter = () => new KeyboardEvent("keydown", { key: "Enter" });

describe("Todo (logic)", () => {
  it("parses a .list file into items", () => {
    const t = new Todo("l", "[ ] milk\n[x] eggs", () => {}, () => {});
    expect(t.snapshot().items).toEqual([
      { text: "milk", done: false },
      { text: "eggs", done: true },
    ]);
    expect(t.snapshot().mode).toBe("normal");
  });

  it("starts in add mode for an empty list", () => {
    expect(new Todo("l", "", () => {}, () => {}).snapshot().mode).toBe("add");
  });

  it("adds an item and saves it in checkbox format", () => {
    let saved = "";
    const t = new Todo("l", "", (c) => {
      saved = c;
    }, () => {});
    t.onText("milk"); // add mode (empty list)
    t.onKey(enter());
    expect(t.snapshot().items).toEqual([{ text: "milk", done: false }]);
    expect(saved).toBe("[ ] milk");
  });

  it("toggles an item with space", () => {
    let saved = "";
    const t = new Todo("l", "[ ] milk", (c) => {
      saved = c;
    }, () => {});
    t.onText(" ");
    expect(t.snapshot().items[0].done).toBe(true);
    expect(saved).toBe("[x] milk");
  });

  it("deletes the selected item with d", () => {
    const t = new Todo("l", "[ ] a\n[ ] b", () => {}, () => {});
    t.onText("d");
    expect(t.snapshot().items).toEqual([{ text: "b", done: false }]);
  });

  it("navigates with j/k", () => {
    const t = new Todo("l", "[ ] a\n[ ] b\n[ ] c", () => {}, () => {});
    t.onText("jj");
    expect(t.snapshot().sel).toBe(2);
    t.onText("k");
    expect(t.snapshot().sel).toBe(1);
  });
});

describe("todo (through the terminal)", () => {
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

  function kbd(root: HTMLElement): HTMLInputElement {
    return root.querySelector(".term-kbd") as HTMLInputElement;
  }
  function press(root: HTMLElement, key: string, opts: KeyboardEventInit = {}): void {
    kbd(root).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
  }
  function type(root: HTMLElement, text: string): void {
    const field = kbd(root);
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function runLine(root: HTMLElement, text: string): Promise<void> {
    type(root, text);
    press(root, "Enter");
    await flush();
  }

  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
  });

  it("adds and toggles items, saving a .list file that survives", async () => {
    const root = mount();
    await runLine(root, "todo shopping.list"); // empty → add mode
    type(root, "milk");
    press(root, "Enter"); // commit milk, back to normal mode
    type(root, " "); // toggle milk done
    press(root, "x", { ctrlKey: true }); // exit
    await flush();

    await runLine(root, "cat shopping.list");
    expect(root.textContent).toContain("[x] milk");
  });
});
