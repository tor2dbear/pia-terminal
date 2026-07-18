// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";
import { loadTerminalConfig } from "../pia/terminalConfig.js";
import { registerInstalled } from "../packages/catalog.js";

// Dynamic imports resolve on microtasks; give them a couple of macrotasks.
const settle = () => new Promise((r) => setTimeout(r, 10));
let term: Terminal | undefined;
let root: HTMLElement;
let vfs: VFS;

function mount(): void {
  root = document.createElement("div");
  document.body.append(root);
  vfs = VFS.seed();
  term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    configure: () => loadTerminalConfig(vfs),
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
  });
}

const textOf = () => [...root.querySelectorAll(".term-line")].map((n) => n.textContent).join("\n");

async function run(line: string): Promise<void> {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
  field.value = line;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
}

afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
});

describe("brew", () => {
  it("installs a package, makes its commands usable, and persists it", async () => {
    mount();
    await run("brew list");
    expect(textOf()).toContain("cowsay");

    // Not installed yet → its command is unknown.
    await run("cowsay hi");
    expect(textOf()).toContain("unknown command: cowsay");

    await run("brew install cowsay");
    expect(textOf()).toContain("installed cowsay");
    expect(vfs.readFile("/home/guest/.pia/packages")).toContain("cowsay");

    // Now the command works.
    await run("cowsay moo");
    expect(textOf()).toContain("< moo >");
    expect(textOf()).toContain("^__^"); // the cow

    await run("cowthink dreams");
    expect(textOf()).toContain("( dreams )");
  });

  it("uninstalls a package, removing its commands", async () => {
    mount();
    await run("brew install cowsay");
    await run("brew uninstall cowsay");
    expect(textOf()).toContain("uninstalled cowsay");
    expect(vfs.readFile("/home/guest/.pia/packages")).toBe("");

    await run("cowsay moo");
    expect(textOf()).toContain("unknown command: cowsay");
  });

  it("rejects an unknown package", async () => {
    mount();
    await run("brew install nope");
    expect(root.querySelector(".term-line.error")?.textContent).toContain("unknown package");
  });

  it("re-registers installed packages at boot (survives a reload)", async () => {
    const fresh = VFS.seed();
    fresh.mkdirp("/home/guest/.pia");
    fresh.writeFile("/home/guest/.pia/packages", "cowsay\n");
    const registry = buildRegistry();
    expect(registry.has("cowsay")).toBe(false);
    await registerInstalled(fresh, "/home/guest", registry);
    expect(registry.has("cowsay")).toBe(true);
    expect(registry.has("cowthink")).toBe(true);
  });
});
