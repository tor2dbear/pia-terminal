// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";

describe("glow — Markdown rendering", () => {
  let term: Terminal | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function mount(vfs = VFS.seed()): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs,
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      auth: new MemoryAuthAdapter(),
      session: { user: "guest" },
    });
    return root;
  }
  const kbd = (root: HTMLElement) => root.querySelector(".term-kbd") as HTMLInputElement;
  async function runLine(root: HTMLElement, line: string): Promise<void> {
    const field = kbd(root);
    field.value = line;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
  }

  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
  });

  it("renders a file: heading uppercased and accent, markers stripped", async () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/doc.md", "# Title\n\nsome **bold** text\n\n- a\n- b");
    const root = mount(vfs);
    await runLine(root, "glow doc.md");

    expect(root.textContent).toContain("TITLE");
    expect(root.textContent).toContain("some bold text"); // ** stripped
    expect(root.textContent).toContain("• a");
    // The heading line is printed with the accent class.
    const accent = [...root.querySelectorAll(".term-line.accent")].map((e) => e.textContent);
    expect(accent).toContain("TITLE");
  });

  it("works through the `md` alias and via a pipe", async () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/n.md", "## Heading");
    const root = mount(vfs);
    await runLine(root, "md n.md");
    expect(root.textContent).toContain("Heading");

    await runLine(root, "cat n.md | glow");
    expect(root.textContent).toContain("Heading");
  });

  it("errors on a missing file", async () => {
    const root = mount();
    await runLine(root, "glow nope.md");
    expect(root.textContent).toContain("glow:");
    expect(root.textContent).toContain("no such file");
  });
});
