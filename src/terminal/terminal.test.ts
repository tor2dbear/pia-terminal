// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "./terminal.js";
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

/** Simulate a control key (Enter, Backspace, arrows, Tab, …). */
function press(root: HTMLElement, key: string, opts: KeyboardEventInit = {}): void {
  kbd(root).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...opts }),
  );
}

/** Simulate typing printable text, as a soft keyboard / IME does. */
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

function typed(root: HTMLElement): string {
  return root.querySelector(".term-typed")?.textContent ?? "";
}

afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
});

describe("Terminal (driven via keyboard)", () => {
  it("boots with a prompt showing the user and home", () => {
    const root = mount();
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@pia:~$");
  });

  it("exposes a hidden field to capture the soft keyboard", () => {
    const root = mount();
    expect(kbd(root)).toBeInstanceOf(HTMLInputElement);
  });

  it("overlays the capture field on the input line so native paste can reach it", () => {
    const root = mount();
    const line = root.querySelector(".term-inputline");
    const display = root.querySelector(".term-display");
    // The field is a child of the input line (a transparent overlay over the
    // visible display layer), not an off-screen 1px element — that reachability
    // is what lets iOS's long-press → Paste work, cross-app included.
    expect(line?.contains(kbd(root))).toBe(true);
    expect(line?.contains(display)).toBe(true);
  });

  it("pastes clipboard text into the input line via the paste key", async () => {
    const root = mount();
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => "milk eggs" },
      configurable: true,
    });
    const paste = [
      ...root.querySelectorAll<HTMLButtonElement>(".term-keybar .kb-key"),
    ].find((b) => b.textContent === "paste");
    expect(paste).toBeTruthy();
    paste!.click(); // paste fires on a real click (Clipboard API activation)
    await flush();
    expect(typed(root)).toContain("milk eggs");
  });

  it("echoes a typed command and prints its output", async () => {
    const root = mount();
    await runLine(root, "echo hej");
    expect(root.textContent).toContain("guest@pia:~$ echo hej");
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("hej");
  });

  it("creates a directory and lists it back", async () => {
    const root = mount();
    await runLine(root, "mkdir proj");
    await runLine(root, "ls");
    expect(root.textContent).toContain("proj/");
  });

  it("cd updates the prompt", async () => {
    const root = mount();
    await runLine(root, "mkdir proj");
    await runLine(root, "cd proj");
    expect(root.querySelector(".term-prompt")?.textContent).toBe(
      "guest@pia:~/proj$",
    );
  });

  it("reports unknown commands as errors", async () => {
    const root = mount();
    await runLine(root, "frobnicate");
    const err = root.querySelector(".term-line.error");
    expect(err?.textContent).toContain("unknown command");
  });

  it("recalls the previous command with ArrowUp", async () => {
    const root = mount();
    await runLine(root, "whoami");
    press(root, "ArrowUp");
    expect(typed(root)).toContain("whoami");
  });

  it("Tab-completes a unique command name", () => {
    const root = mount();
    type(root, "neof");
    press(root, "Tab");
    expect(typed(root)).toContain("neofetch");
  });

  it("Backspace deletes the character before the cursor", () => {
    const root = mount();
    type(root, "lss");
    press(root, "Backspace");
    expect(typed(root).trimEnd()).toBe("ls");
  });

  it("login changes the prompt to the new user at their home", async () => {
    const root = mount();
    await runLine(root, "login alice");
    expect(root.querySelector(".term-prompt")?.textContent).toBe("alice@pia:~$");
  });

  it("logout returns the prompt to guest", async () => {
    const root = mount();
    await runLine(root, "login alice");
    await runLine(root, "logout");
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@pia:~$");
  });

  it("pipes output from one command into another", async () => {
    const root = mount();
    await runLine(root, "echo hello world | grep world");
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("hello world");
  });

  it("ls piped to grep filters entries to one per line", async () => {
    const root = mount();
    await runLine(root, "mkdir alpha");
    await runLine(root, "mkdir beta");
    await runLine(root, "ls | grep alpha");
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("alpha/");
    expect(lines).not.toContain("beta/");
  });

  it("redirects output to a file with >", async () => {
    const root = mount();
    await runLine(root, "echo saved to file > out.txt");
    await runLine(root, "cat out.txt");
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("saved to file");
  });

  it("appends to a file with >>", async () => {
    const root = mount();
    await runLine(root, "echo first > log.txt");
    await runLine(root, "echo second >> log.txt");
    await runLine(root, "cat log.txt");
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("first");
    expect(lines).toContain("second");
  });

  it("counts piped entries with wc", async () => {
    const root = mount();
    await runLine(root, "echo a | wc -l");
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("1");
  });
});

/** Tap an on-screen key bar button by its label. */
function tapKey(root: HTMLElement, label: string): void {
  const key = [...root.querySelectorAll(".term-keybar .kb-key")].find(
    (b) => b.textContent === label,
  );
  if (!key) throw new Error(`no key bar button: ${label}`);
  key.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}

describe("on-screen key bar", () => {
  it("shows the shell keys the phone keyboard lacks", () => {
    const root = mount();
    const labels = [...root.querySelectorAll(".term-keybar .kb-key")].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(
      expect.arrayContaining(["Tab", "↑", "↓", "←", "→", "|", "~", "^C", "^L"]),
    );
  });

  it("inserts punctuation at the cursor", () => {
    const root = mount();
    type(root, "ls ");
    tapKey(root, "|");
    expect(typed(root)).toContain("ls |");
  });

  it("Tab-completes a command via the bar", () => {
    const root = mount();
    type(root, "neof");
    tapKey(root, "Tab");
    expect(typed(root)).toContain("neofetch");
  });

  it("recalls history via the ↑ key", async () => {
    const root = mount();
    await runLine(root, "whoami");
    tapKey(root, "↑");
    expect(typed(root)).toContain("whoami");
  });

  it("switches to the editor's keys and back to the prompt on exit", async () => {
    const root = mount();
    await runLine(root, "edit note.txt");
    const inEditor = [...root.querySelectorAll(".term-keybar .kb-key")].map(
      (b) => b.textContent,
    );
    expect(inEditor).toContain("^O");
    expect(inEditor).not.toContain("^C"); // prompt-only key is gone

    press(root, "x", { ctrlKey: true });
    await flush();
    const atPrompt = [...root.querySelectorAll(".term-keybar .kb-key")].map(
      (b) => b.textContent,
    );
    expect(atPrompt).toContain("^C");
  });
});

/** The full inline suggestion currently shown (cursor char + dimmed rest). */
function ghost(root: HTMLElement): string {
  const rest = root.querySelector(".term-ghost");
  if (!rest) return "";
  const cursor = root.querySelector(".term-typed .term-cursor");
  return (cursor?.textContent ?? "") + (rest.textContent ?? "");
}

describe("inline autosuggestion (ghost text)", () => {
  it("suggests the rest of a command as you type", () => {
    const root = mount();
    type(root, "neof");
    expect(ghost(root)).toBe("etch");
  });

  it("suggests a filename from the filesystem", () => {
    const root = mount();
    type(root, "cat wel");
    expect(ghost(root)).toBe("come.txt");
  });

  it("accepts the suggestion with the → key", () => {
    const root = mount();
    type(root, "neof");
    press(root, "ArrowRight");
    expect(typed(root)).toContain("neofetch");
    expect(ghost(root)).toBe("");
  });

  it("accepts the suggestion by tapping it", () => {
    const root = mount();
    type(root, "neof");
    root
      .querySelector(".term-ghost")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(typed(root)).toContain("neofetch");
  });

  it("shows no suggestion when the cursor is not at the end", () => {
    const root = mount();
    type(root, "neof");
    press(root, "ArrowLeft");
    expect(ghost(root)).toBe("");
  });

  it("shows a +N chip and cycles matches with Tab", () => {
    const root = mount();
    type(root, "c"); // cat, cd, clear, column, cp, cut
    expect(ghost(root)).toBe("at");
    expect(root.querySelector(".term-more")?.textContent).toContain("+5");
    press(root, "Tab");
    expect(ghost(root)).toBe("d"); // cd
    press(root, "Tab");
    expect(ghost(root)).toBe("lear"); // clear
  });

  it("cycles when the +N chip is tapped", () => {
    const root = mount();
    type(root, "c");
    root
      .querySelector(".term-more")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(ghost(root)).toBe("d");
  });
});

describe("swipe gestures", () => {
  function swipe(root: HTMLElement, fromX: number, toX: number): void {
    root.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: fromX, clientY: 40, bubbles: true }),
    );
    root.dispatchEvent(
      new MouseEvent("pointerup", { clientX: toX, clientY: 42, bubbles: true }),
    );
  }

  it("scrubs the cursor left with a horizontal swipe", () => {
    const root = mount();
    type(root, "hello");
    swipe(root, 200, 130); // ~3 chars left
    type(root, "X");
    expect(typed(root)).toContain("heXllo");
  });

  it("ignores a mostly-vertical drag (leaves it to scroll)", () => {
    const root = mount();
    type(root, "hello");
    root.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, clientY: 20, bubbles: true }),
    );
    root.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 108, clientY: 120, bubbles: true }),
    );
    type(root, "X");
    expect(typed(root)).toContain("helloX"); // cursor stayed at the end
  });
});

describe("filename globbing", () => {
  const out = (root: HTMLElement) =>
    [...root.querySelectorAll(".term-line")].map((n) => n.textContent);

  it("expands * against the filesystem, sorted", async () => {
    const root = mount();
    await runLine(root, "touch b.md");
    await runLine(root, "touch a.md");
    await runLine(root, "touch c.txt");
    await runLine(root, "echo *.md");
    expect(out(root)).toContain("a.md b.md");
  });

  it("quoting protects a wildcard (literal)", async () => {
    const root = mount();
    await runLine(root, "touch a.md");
    await runLine(root, 'echo "*.md"');
    expect(out(root)).toContain("*.md");
  });

  it("leaves a non-matching pattern literal", async () => {
    const root = mount();
    await runLine(root, "echo *.zip");
    expect(out(root)).toContain("*.zip");
  });

  it("feeds the expanded files to the command (cat *.md)", async () => {
    const root = mount();
    await runLine(root, "echo alpha > a.md");
    await runLine(root, "echo beta > b.md");
    await runLine(root, "cat *.md");
    const lines = out(root);
    expect(lines).toContain("alpha");
    expect(lines).toContain("beta");
  });

  it("ls *.md lists every match, not just the first", async () => {
    const root = mount();
    await runLine(root, "touch a.md");
    await runLine(root, "touch b.md");
    await runLine(root, "ls *.md");
    expect(out(root)).toContain("a.md  b.md");
  });
});
