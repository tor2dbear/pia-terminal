// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { THEMES } from "../pia/themes.js";

describe(".pia/config — themes, aliases, prompt", () => {
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
  async function runLine(root: HTMLElement, text: string): Promise<void> {
    const field = kbd(root);
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
  }

  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
  });

  it("seeds a starter config and hides it from ls unless -a", async () => {
    const root = mount();
    await runLine(root, "ls");
    expect(root.textContent).not.toContain(".pia"); // dotfile hidden by default

    await runLine(root, "ls -a");
    expect(root.textContent).toContain(".pia"); // -a reveals it

    await runLine(root, "cat ~/.pia/config");
    expect(root.textContent).toContain("theme = phosphor");
  });

  it("switches theme, persists it, and applies the palette live", async () => {
    const root = mount();
    await runLine(root, "theme amber");
    expect(root.textContent).toContain("theme set to amber");
    // Persisted to the dotfile…
    await runLine(root, "cat ~/.pia/config");
    expect(root.textContent).toContain("theme = amber");
    // …and applied to the document palette.
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(THEMES.amber.accent);
  });

  it("lists themes marking the current one, and rejects unknown names", async () => {
    const root = mount();
    await runLine(root, "theme");
    expect(root.textContent).toContain("* phosphor"); // current marked
    expect(root.textContent).toContain("amber");

    await runLine(root, "theme chartreuse");
    expect(root.textContent).toContain("unknown theme");
  });

  it("defines an alias, expands it when run, then removes it", async () => {
    const root = mount();
    await runLine(root, "alias hi echo hello");
    expect(root.textContent).toContain("aliased hi");

    await runLine(root, "hi"); // expands to `echo hello`
    expect(root.textContent).toContain("hello");

    await runLine(root, "alias"); // lists it
    expect(root.textContent).toContain("alias hi = echo hello");

    await runLine(root, "unalias hi");
    await runLine(root, "hi"); // no longer a command
    expect(root.textContent).toContain("unknown command: hi");
  });

  it("prepends alias words before typed args", async () => {
    const root = mount();
    await runLine(root, "mkdir sub");
    await runLine(root, "alias l ls");
    await runLine(root, "l sub"); // → `ls sub`
    // ls of an empty dir prints nothing, but no error either.
    expect(root.textContent).not.toContain("unknown command");
  });

  it("honours a custom prompt template from the config", async () => {
    const vfs = VFS.seed();
    vfs.mkdirp("/home/guest/.pia");
    vfs.writeFile("/home/guest/.pia/config", "prompt = [{user}@{host}]$");
    const root = mount(vfs);
    await runLine(root, "pwd");
    expect(root.textContent).toContain("[guest@pia]$");
  });
});
