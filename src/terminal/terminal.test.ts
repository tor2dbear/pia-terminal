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
