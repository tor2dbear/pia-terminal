// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Todo } from "./todo.js";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";
import { MemoryShareStore } from "../share/store.js";

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

  function mount(share?: MemoryShareStore): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      auth: new MemoryAuthAdapter(),
      session: { user: "guest" },
      share,
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

  it("adds items to ~/todo/<name>.list (extension implied) that survive", async () => {
    const root = mount();
    await runLine(root, "todo shopping"); // → ~/todo/shopping.list, empty → add mode
    type(root, "milk");
    press(root, "Enter"); // commit milk, back to normal mode
    type(root, " "); // toggle milk done
    press(root, "x", { ctrlKey: true }); // exit
    await flush();

    await runLine(root, "cat todo/shopping.list");
    expect(root.textContent).toContain("[x] milk");
  });

  it("lists existing lists when run with no name", async () => {
    const root = mount();
    await runLine(root, "todo shopping");
    type(root, "milk");
    press(root, "Enter");
    press(root, "x", { ctrlKey: true });
    await flush();

    await runLine(root, "todo");
    expect(root.textContent).toContain("your lists");
    expect(root.textContent).toContain("shopping");
  });

  it("shares a local list and hands the local copy over to the cloud", async () => {
    const backing = MemoryShareStore.backing();
    const me = new MemoryShareStore("me@example.com", backing);
    const root = mount(me);

    await runLine(root, "todo handla"); // empty → add mode
    type(root, "milk");
    press(root, "Enter");
    press(root, "x", { ctrlKey: true });
    await flush();

    await runLine(root, "todo share handla wife@example.com");
    expect(root.textContent).toContain('shared "handla" with wife@example.com');

    // The local file is gone — the list now lives in the cloud only.
    await runLine(root, "cat todo/handla.list");
    expect(root.textContent).toContain("no such file");

    // And it now shows under "shared with you".
    await runLine(root, "todo");
    expect(root.textContent).toContain("shared with you");
    expect(root.textContent).toContain("handla");

    // The invitee has a pending invite waiting to be claimed.
    const wife = new MemoryShareStore("wife@example.com", backing);
    expect(await wife.claim()).toBe(1);
  });

  it("opens a shared list and saves edits back to the cloud", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const id = await owner.create("handla", "[ ] milk");
    await owner.invite(id, "wife@example.com");

    const wife = new MemoryShareStore("wife@example.com", backing);
    await wife.claim(); // she's now a member

    const root = mount(wife);
    await runLine(root, "todo handla"); // shared list wins over any local file
    type(root, "a"); // enter add mode (list is non-empty → normal mode first)
    type(root, "cheese");
    press(root, "Enter"); // commit
    press(root, "x", { ctrlKey: true });
    await flush();

    const saved = await owner.get(id);
    expect(saved?.content).toContain("cheese");
  });

  it("refuses to share a list that does not exist", async () => {
    const me = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const root = mount(me);
    await runLine(root, "todo share ghost friend@example.com");
    expect(root.textContent).toContain("no such list: ghost");
  });

  it("refreshes the key bar when the app changes mode", async () => {
    const root = mount();
    const labels = () =>
      [...root.querySelectorAll(".term-keybar .kb-key")].map((b) => b.textContent);

    await runLine(root, "todo shopping"); // empty → add mode
    expect(labels()).not.toContain("+"); // add-mode bar (esc / ^X)
    expect(labels()).toContain("^X"); // exit is always reachable

    type(root, "milk");
    press(root, "Enter"); // commit → normal mode
    expect(labels()).toContain("+"); // bar updated to normal-mode keys
    expect(labels()).toContain("^X");
  });
});
