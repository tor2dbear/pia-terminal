// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Todo } from "./todo.js";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";
import { MemoryShareStore } from "../share/store.js";
import { piaExtendContext } from "../pia/context.js";

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

  it("applies an external (co-editor) update", () => {
    const t = new Todo("l", "[ ] a", () => {}, () => {});
    t.applyExternal("[ ] a\n[x] b");
    expect(t.snapshot().items).toEqual([
      { text: "a", done: false },
      { text: "b", done: true },
    ]);
  });

  it("ignores an external update equal to the current content (self-echo)", () => {
    const t = new Todo("l", "[ ] a\n[ ] b", () => {}, () => {});
    t.onText("j"); // move selection to b
    t.applyExternal("[ ] a\n[ ] b");
    expect(t.snapshot().sel).toBe(1); // untouched
  });
});

describe("todo (through the terminal)", () => {
  let term: Terminal | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function mount(share?: MemoryShareStore, auth = new MemoryAuthAdapter()): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(auth, share),
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

  it("shares a list in place (it stays) and marks it, invitee pending", async () => {
    const backing = MemoryShareStore.backing();
    const me = new MemoryShareStore("me@example.com", backing);
    const root = mount(me);

    await runLine(root, "todo handla"); // empty → add mode
    type(root, "milk");
    press(root, "Enter");
    press(root, "x", { ctrlKey: true });
    await flush();

    await runLine(root, "todo share handla wife@example.com");
    expect(root.textContent).toContain('shared "handla.list" with wife@example.com');

    // The file STAYS where it lives — sharing is a property, not a move.
    await runLine(root, "cat todo/handla.list");
    expect(root.textContent).toContain("milk");

    // It still shows under "your lists", now marked shared.
    await runLine(root, "todo");
    expect(root.textContent).toContain("your lists");
    expect(root.textContent).toContain("handla");
    expect(root.textContent).toContain("👥");

    // The invitee has a pending invite waiting to be claimed.
    const wife = new MemoryShareStore("wife@example.com", backing);
    expect(await wife.claim()).toBe(1);
  });

  it("opens a shared list (via `shared`) and saves edits back to the cloud", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const id = await owner.create("handla", "[ ] milk");
    await owner.invite(id, "wife@example.com");

    const wife = new MemoryShareStore("wife@example.com", backing);
    await wife.claim(); // she's now a member (not yet placed in her tree)

    const root = mount(wife);
    await runLine(root, "shared handla"); // opens the incoming shared list
    type(root, "a"); // enter add mode (list is non-empty → normal mode first)
    type(root, "cheese");
    press(root, "Enter"); // commit
    press(root, "x", { ctrlKey: true });
    await flush();

    const saved = await owner.get(id);
    expect(saved?.content).toContain("cheese");
  });

  it("edits a shared list in place via todo and syncs to the cloud", async () => {
    const me = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const root = mount(me);

    await runLine(root, "todo handla");
    type(root, "milk");
    press(root, "Enter");
    press(root, "x", { ctrlKey: true });
    await flush();
    await runLine(root, "todo share handla wife@example.com"); // links in place

    const item = (await me.mine()).find((i) => i.name === "handla.list");
    expect(item).toBeTruthy();

    // Re-open via todo — it's cloud-backed now — and add an item.
    type(root, "todo handla");
    press(root, "Enter");
    await flush();
    type(root, "a");
    type(root, "cheese");
    press(root, "Enter");
    press(root, "x", { ctrlKey: true });
    await flush();

    expect((await me.get(item!.id))?.content).toContain("cheese");
  });

  it("emails the invitee a magic link when the auth backend can send one", async () => {
    const me = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const auth = new MemoryAuthAdapter();
    const root = mount(me, auth);

    await runLine(root, "todo handla");
    type(root, "milk");
    press(root, "Enter");
    press(root, "x", { ctrlKey: true });
    await flush();

    await runLine(root, "todo share handla wife@example.com");
    expect(auth.invitedEmails).toContain("wife@example.com");
    expect(root.textContent).toContain("invite link");
  });

  it("live-syncs a co-editor's change into an open shared list", async () => {
    const backing = MemoryShareStore.backing();
    const me = new MemoryShareStore("me@example.com", backing);
    const other = new MemoryShareStore("other@example.com", backing);
    const id = await me.create("handla", "[ ] milk");

    const root = mount(me);
    // Open the incoming shared list but DON'T await — runApp resolves on exit.
    type(root, "shared handla");
    press(root, "Enter");
    await flush();
    expect(root.textContent).toContain("milk");

    // A co-editor adds an item; it should appear live in the open app.
    await other.save(id, "[ ] milk\n[ ] cheese");
    await flush();
    expect(root.textContent).toContain("cheese");

    press(root, "x", { ctrlKey: true });
    await flush();
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
