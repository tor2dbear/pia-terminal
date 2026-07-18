// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { MemoryShareStore } from "../share/store.js";
import { piaExtendContext } from "../pia/context.js";
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

  it("shares any file in place (it stays) and marks it in ls", async () => {
    const store = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const auth = new MemoryAuthAdapter();
    const root = mount(store, auth);

    await runLine(root, "echo hello > notes.txt");
    await runLine(root, "share notes.txt wife@example.com");
    expect(root.textContent).toContain('shared "notes.txt" with wife@example.com');
    expect(auth.invitedEmails).toContain("wife@example.com"); // magic-link sent

    // The file stays right where it is — sharing is a property, not a move.
    await runLine(root, "cat notes.txt");
    expect(root.textContent).toContain("hello");

    // ls marks the shared file with an @ suffix (like a symlink).
    await runLine(root, "ls");
    expect(root.textContent).toContain("notes.txt@");

    // It's placed, so it's not in the `shared` inbox of unplaced memberships.
    await runLine(root, "shared");
    expect(root.textContent).toContain("nothing new shared with you");
  });

  it("edits a shared file in place through nano and syncs to the cloud", async () => {
    const store = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const root = mount(store);
    await runLine(root, "echo hello > notes.txt");
    await runLine(root, "share notes.txt wife@example.com");
    const item = (await store.mine()).find((i) => i.name === "notes.txt");
    expect(item).toBeTruthy();

    // Open the still-in-place file in nano; it's cloud-backed now.
    type(root, "nano notes.txt");
    press(root, "Enter");
    await flush();
    expect(root.querySelector(".ed-title")?.textContent).toContain("notes.txt");

    type(root, "X"); // edit
    press(root, "o", { ctrlKey: true }); // ^O → cloud + cache
    await flush();
    press(root, "x", { ctrlKey: true }); // ^X exit
    await flush();

    expect((await store.get(item!.id))?.content).toContain("X"); // cloud updated
    await runLine(root, "cat notes.txt");
    expect(root.textContent).toContain("X"); // local cache updated too
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

  it("invite <email> sends a standalone sign-in link once logged in", async () => {
    const auth = new MemoryAuthAdapter();
    const root = mount(undefined, auth);
    await runLine(root, "invite friend@example.com"); // guest → refused
    expect(root.textContent).toContain("log in first");

    await runLine(root, "login me");
    await runLine(root, "invite friend@example.com");
    expect(auth.invitedEmails).toContain("friend@example.com");
    expect(root.textContent).toContain("invited friend@example.com");
  });

  it("rm on a shared file leaves the share so it isn't re-placed", async () => {
    const store = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const root = mount(store);
    await runLine(root, "echo hi > note.txt");
    await runLine(root, "share note.txt friend@example.com");
    expect((await store.mine()).length).toBe(1); // I'm a member (creator)

    await runLine(root, "rm note.txt");
    expect(root.textContent).toContain("left 1 shared file");
    expect((await store.mine()).length).toBe(0); // membership dropped
  });

  it("tree shows the structure and marks shared files with @", async () => {
    const store = new MemoryShareStore("me@example.com", MemoryShareStore.backing());
    const root = mount(store);
    await runLine(root, "mkdir garden");
    await runLine(root, "echo x > garden/flowers.md");
    await runLine(root, "share garden/flowers.md p@example.com");
    await runLine(root, "tree garden");
    expect(root.textContent).toContain("flowers.md@");
  });

  it("still makes a read-only link when no email is given", async () => {
    const root = mount(new MemoryShareStore("me@example.com", MemoryShareStore.backing()));
    await runLine(root, "echo hi > note.txt");
    await runLine(root, "share note.txt");
    expect(root.textContent).toContain("public link (read-only)");
    expect(root.textContent).toContain("#s=");
  });
});
