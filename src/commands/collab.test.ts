// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { MemoryShareStore } from "../share/store.js";
import { kindOf } from "./share.js";

describe("kindOf", () => {
  it("routes by extension, sniffing checklist content when there is none", () => {
    expect(kindOf("handla.list", "")).toBe("list");
    expect(kindOf("notes.txt", "hello")).toBe("text");
    expect(kindOf("readme.md", "# hi")).toBe("text");
    expect(kindOf("handla", "[ ] milk\n[x] eggs")).toBe("list"); // legacy, no ext
    expect(kindOf("plain", "just text")).toBe("text");
  });
});

describe("share <file> <email> (collaborative)", () => {
  let term: Terminal | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function mount(share?: MemoryShareStore, auth = new MemoryAuthAdapter()): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      auth,
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

  it("shares any file, hands the local copy to the cloud, and lists it", async () => {
    const store = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const auth = new MemoryAuthAdapter();
    const root = mount(store, auth);

    await runLine(root, "echo hello > notes.txt");
    await runLine(root, "share notes.txt wife@example.com");
    expect(root.textContent).toContain('shared "notes.txt" with wife@example.com');
    expect(auth.invitedEmails).toContain("wife@example.com"); // magic-link sent

    // Local copy is gone — it lives in the cloud now.
    await runLine(root, "cat notes.txt");
    expect(root.textContent).toContain("no such file");

    // It shows under `shared`, tagged as a file (not a list).
    await runLine(root, "shared");
    expect(root.textContent).toContain("notes.txt");
    expect(root.textContent).toContain("file");
  });

  it("opens a shared text file in the editor and saves edits to the cloud", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const id = await owner.create("notes.txt", "hello");
    await owner.invite(id, "me@example.com");

    const me = new MemoryShareStore("me@example.com", backing);
    await me.claim();
    const root = mount(me);

    type(root, "shared notes.txt"); // opens the editor (runApp blocks, so don't await)
    press(root, "Enter");
    await flush();
    expect(root.querySelector(".ed-title")?.textContent).toContain("notes.txt");

    type(root, "X"); // insert at the start
    press(root, "o", { ctrlKey: true }); // ^O save → cloud
    await flush();
    press(root, "x", { ctrlKey: true }); // ^X exit
    await flush();

    const saved = await owner.get(id);
    expect(saved?.content).toContain("X");
    expect(saved?.content).toContain("hello");
  });

  it("still makes a read-only link when no email is given", async () => {
    const root = mount(new MemoryShareStore("me@example.com", MemoryShareStore.backing()));
    await runLine(root, "echo hi > note.txt");
    await runLine(root, "share note.txt");
    expect(root.textContent).toContain("public link (read-only)");
    expect(root.textContent).toContain("#s=");
  });
});
