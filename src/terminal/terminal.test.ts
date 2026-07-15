// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "./terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { buildRegistry } from "../commands/index.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

let term: Terminal | undefined;

function mount(): { root: HTMLElement; term: Terminal } {
  const root = document.createElement("div");
  document.body.append(root);
  term = new Terminal(root, {
    vfs: VFS.seed(),
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
  });
  return { root, term };
}

function press(key: string, opts: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}

function type(text: string): void {
  for (const ch of text) press(ch);
}

async function runLine(text: string): Promise<void> {
  type(text);
  press("Enter");
  await flush();
}

afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
});

describe("Terminal (driven via keyboard)", () => {
  it("boots with a prompt showing the user and home", () => {
    const { root } = mount();
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@vera:~$");
  });

  it("echoes a typed command and prints its output", async () => {
    const { root } = mount();
    await runLine("echo hej");
    expect(root.textContent).toContain("guest@vera:~$ echo hej");
    // The output line "hej" is rendered after the echoed command line.
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("hej");
  });

  it("creates a directory and lists it back", async () => {
    const { root } = mount();
    await runLine("mkdir proj");
    await runLine("ls");
    expect(root.textContent).toContain("proj/");
  });

  it("cd updates the prompt", async () => {
    const { root } = mount();
    await runLine("mkdir proj");
    await runLine("cd proj");
    expect(root.querySelector(".term-prompt")?.textContent).toBe(
      "guest@vera:~/proj$",
    );
  });

  it("reports unknown commands as errors", async () => {
    const { root } = mount();
    await runLine("frobnicate");
    const err = root.querySelector(".term-line.error");
    expect(err?.textContent).toContain("okänt kommando");
  });

  it("recalls the previous command with ArrowUp", async () => {
    const { root } = mount();
    await runLine("whoami");
    press("ArrowUp");
    expect(root.querySelector(".term-typed")?.textContent).toContain("whoami");
  });

  it("Tab-completes a unique command name", () => {
    const { root } = mount();
    type("neof");
    press("Tab");
    expect(root.querySelector(".term-typed")?.textContent).toContain("neofetch");
  });

  it("Backspace deletes the character before the cursor", () => {
    const { root } = mount();
    type("lss");
    press("Backspace");
    expect(root.querySelector(".term-typed")?.textContent?.trimEnd()).toBe("ls");
  });
});
