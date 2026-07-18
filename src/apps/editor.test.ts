// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";
import { piaExtendContext } from "../pia/context.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

let term: Terminal | undefined;

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  term = new Terminal(root, {
    vfs: VFS.seed(),
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
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
    press(root, "o", { ctrlKey: true }); // save (nano's WriteOut)
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

  it("save and exit are reachable by tapping the key bar (mobile)", async () => {
    const root = mount();
    await runLine(root, "edit tap.txt");
    type(root, "tapped in");
    const keys = root.querySelectorAll(".term-keybar .kb-key");
    keys[0].dispatchEvent(new Event("pointerdown", { bubbles: true })); // ^O save
    await flush();
    keys[1].dispatchEvent(new Event("pointerdown", { bubbles: true })); // ^X exit
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

const title = (root: HTMLElement) => root.querySelector(".ed-title")?.textContent ?? "";
const body = (root: HTMLElement) => root.querySelector(".ed-body")?.textContent ?? "";
/** M-. (next) / M-, (previous) — matched by physical key, so pass the code. */
const nextBuffer = (root: HTMLElement) => press(root, ".", { altKey: true, code: "Period" });
const prevBuffer = (root: HTMLElement) => press(root, ",", { altKey: true, code: "Comma" });

describe("edit — multiple buffers (nano-style)", () => {
  it("opens one buffer per file and shows the [n/m] position", async () => {
    const root = mount();
    await runLine(root, "edit a.txt b.txt c.txt");
    expect(editorOpen(root)).toBe(true);
    expect(title(root)).toContain("a.txt");
    expect(title(root)).toContain("[1/3]");
  });

  it("switches between buffers, keeping each buffer's own text", async () => {
    const root = mount();
    await runLine(root, "edit a.txt b.txt");
    type(root, "alpha");
    nextBuffer(root); // → b.txt
    expect(title(root)).toContain("b.txt");
    expect(title(root)).toContain("[2/2]");
    expect(body(root)).not.toContain("alpha"); // b is its own, empty buffer
    type(root, "bravo");
    prevBuffer(root); // ← back to a.txt
    expect(title(root)).toContain("a.txt");
    expect(body(root)).toContain("alpha");
    expect(body(root)).not.toContain("bravo");
  });

  it("saves every buffer's content independently", async () => {
    const root = mount();
    await runLine(root, "edit one.txt two.txt");
    type(root, "first file");
    press(root, "o", { ctrlKey: true }); // save one.txt
    await flush();
    nextBuffer(root);
    type(root, "second file");
    press(root, "o", { ctrlKey: true }); // save two.txt
    await flush();
    press(root, "x", { ctrlKey: true }); // close two.txt
    press(root, "x", { ctrlKey: true }); // close one.txt → exit
    await flush();

    expect(editorOpen(root)).toBe(false);
    await runLine(root, "cat one.txt");
    expect(root.textContent).toContain("first file");
    await runLine(root, "cat two.txt");
    expect(root.textContent).toContain("second file");
  });

  it("^X closes the current buffer and only exits after the last one", async () => {
    const root = mount();
    await runLine(root, "edit a.txt b.txt");
    press(root, "x", { ctrlKey: true }); // a.txt clean → closes, b.txt remains
    expect(editorOpen(root)).toBe(true);
    expect(title(root)).toContain("b.txt");
    expect(title(root)).not.toContain("[2/"); // only one buffer left now
    press(root, "x", { ctrlKey: true }); // b.txt clean → closes last → exit
    await flush();
    expect(editorOpen(root)).toBe(false);
  });

  it("guards unsaved changes per buffer on ^X", async () => {
    const root = mount();
    await runLine(root, "edit a.txt b.txt");
    type(root, "dirty a");
    press(root, "x", { ctrlKey: true }); // armed, not closed
    expect(editorOpen(root)).toBe(true);
    expect(root.querySelector(".ed-status")?.textContent).toContain("unsaved changes in a.txt");
    press(root, "x", { ctrlKey: true }); // confirm discard → close a.txt, b.txt remains
    expect(editorOpen(root)).toBe(true);
    expect(title(root)).toContain("b.txt");
  });

  it("shows buffer-switch keys on the bar only when several are open", async () => {
    const root = mount();
    await runLine(root, "edit solo.txt");
    let labels = [...root.querySelectorAll(".term-keybar .kb-key")].map((k) => k.textContent);
    expect(labels).not.toContain("»");
    press(root, "x", { ctrlKey: true }); // exit
    await flush();

    await runLine(root, "edit a.txt b.txt");
    labels = [...root.querySelectorAll(".term-keybar .kb-key")].map((k) => k.textContent);
    expect(labels).toContain("«");
    expect(labels).toContain("»");
  });
});
