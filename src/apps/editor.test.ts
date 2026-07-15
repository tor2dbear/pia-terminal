// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

let term: Terminal | undefined;

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
  kbd(root).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...opts }),
  );
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

function editorOpen(root: HTMLElement): boolean {
  const app = root.querySelector(".term-app") as HTMLElement | null;
  return app !== null && app.style.display !== "none";
}

afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
});

describe("edit (full-screen editor)", () => {
  it("opens the editor for a file, showing its name in the title bar", async () => {
    const root = mount();
    await runLine(root, "edit greeting.txt");
    expect(editorOpen(root)).toBe(true);
    expect(root.querySelector(".ed-title")?.textContent).toContain("greeting.txt");
  });

  it("types, saves, exits, and the content survives", async () => {
    const root = mount();
    await runLine(root, "edit greeting.txt");
    type(root, "hello world");
    press(root, "Enter");
    type(root, "second line");
    press(root, "s", { ctrlKey: true }); // save
    await flush();
    press(root, "x", { ctrlKey: true }); // exit (clean)
    await flush();

    expect(editorOpen(root)).toBe(false);
    await runLine(root, "cat greeting.txt");
    expect(root.textContent).toContain("hello world");
    expect(root.textContent).toContain("second line");
  });

  it("loads an existing file's content into the body", async () => {
    const root = mount();
    await runLine(root, "edit welcome.txt");
    expect(root.querySelector(".ed-body")?.textContent).toContain("welcome");
    press(root, "x", { ctrlKey: true }); // clean exit, no changes
    await flush();
    expect(editorOpen(root)).toBe(false);
  });

  it("guards against discarding unsaved changes on the first ^X", async () => {
    const root = mount();
    await runLine(root, "edit draft.txt");
    type(root, "unsaved");
    press(root, "x", { ctrlKey: true }); // armed, not exited
    expect(editorOpen(root)).toBe(true);
    expect(root.querySelector(".ed-status")?.textContent).toContain(
      "unsaved changes",
    );
    press(root, "x", { ctrlKey: true }); // confirmed discard
    await flush();
    expect(editorOpen(root)).toBe(false);

    // Discarded, so the file was never written.
    await runLine(root, "cat draft.txt");
    expect(root.querySelector(".term-line.error")?.textContent).toContain(
      "no such file",
    );
  });

  it("save and exit are reachable by tapping the status keys (mobile)", async () => {
    const root = mount();
    await runLine(root, "edit tap.txt");
    type(root, "tapped in");
    const keys = root.querySelectorAll(".ed-key");
    keys[0].dispatchEvent(new Event("pointerup", { bubbles: true })); // ^S save
    await flush();
    keys[1].dispatchEvent(new Event("pointerup", { bubbles: true })); // ^X exit
    await flush();

    expect(editorOpen(root)).toBe(false);
    await runLine(root, "cat tap.txt");
    expect(root.textContent).toContain("tapped in");
  });

  it("returns to the terminal prompt after exiting", async () => {
    const root = mount();
    await runLine(root, "edit greeting.txt");
    press(root, "x", { ctrlKey: true });
    await flush();
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@pia:~$");
  });
});
