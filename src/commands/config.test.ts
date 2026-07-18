// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";
import { THEMES } from "../pia/themes.js";
import { loadTerminalConfig } from "../pia/terminalConfig.js";

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
      session: { user: "guest" },
      configure: () => loadTerminalConfig(vfs),
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
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

  it("preserves quoted arguments in a configured alias", async () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/my file.txt", "spaced!");
    vfs.mkdirp("/home/guest/.pia");
    vfs.writeFile("/home/guest/.pia/config", 'alias c = cat "my file.txt"');
    const root = mount(vfs);
    await runLine(root, "c"); // → cat "my file.txt" (one arg, not two)
    expect(root.textContent).toContain("spaced!");
  });

  it("re-applies config when the user changes", async () => {
    const root = mount();
    await runLine(root, "theme amber");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(THEMES.amber.accent);
    // A fresh user's home gets the default config, so the theme resets.
    await runLine(root, "login bob");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(THEMES.phosphor.accent);
  });

  it("honours a custom prompt template from the config", async () => {
    const vfs = VFS.seed();
    vfs.mkdirp("/home/guest/.pia");
    vfs.writeFile("/home/guest/.pia/config", "prompt = [{user}@{host}]$");
    const root = mount(vfs);
    await runLine(root, "pwd");
    expect(root.textContent).toContain("[guest@pia]$");
  });

  it("colours the prompt from %F markup in the template", () => {
    const vfs = VFS.seed();
    vfs.mkdirp("/home/guest/.pia");
    vfs.writeFile("/home/guest/.pia/config", "prompt = %F{accent}{user}%f:%F{#ff8800}{cwd}%f$");
    const root = mount(vfs);
    const spans = [...root.querySelectorAll(".term-prompt span")];
    const colors = spans.map((s) => (s as HTMLElement).style.color);
    // The live prompt renders coloured spans (a palette var and a hex).
    expect(colors).toContain("var(--accent)");
    expect(colors).toContain("rgb(255, 136, 0)"); // jsdom normalises #ff8800
    // The plain text is still all there.
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest:~$");
  });

  it("applies custom colours and font from the config", () => {
    const vfs = VFS.seed();
    vfs.mkdirp("/home/guest/.pia");
    vfs.writeFile(
      "/home/guest/.pia/config",
      ["color.accent = #ff8800", "font-size = 17"].join("\n"),
    );
    mount(vfs);
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff8800");
    expect(document.documentElement.style.getPropertyValue("--font-size")).toBe("17px");
  });

  it("`source` re-applies the config after a hand-edit", async () => {
    const root = mount();
    await runLine(root, 'echo "color.accent = #abcdef" >> ~/.pia/config');
    await runLine(root, "source ~/.pia/config");
    expect(root.textContent).toContain("re-applied");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#abcdef");
  });

  it("`source` refuses anything but the config file", async () => {
    const root = mount();
    await runLine(root, "source ~/notes.txt");
    expect(root.querySelector(".term-line.error")?.textContent).toContain(
      "only ~/.pia/config",
    );
  });
});
