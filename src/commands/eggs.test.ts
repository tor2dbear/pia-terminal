import { describe, expect, it } from "vitest";
import { VFS, HOME } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import type { AuthAdapter } from "../auth/adapter.js";
import type { CommandContext, LineClass } from "./registry.js";

/** A minimal command harness that captures output (mirrors commands.test.ts). */
function harness(auth: AuthAdapter = new MemoryAuthAdapter()) {
  const vfs = VFS.seed();
  const adapter = new MemoryStorageAdapter();
  const registry = buildRegistry();
  const lines: { text: string; cls: LineClass }[] = [];
  let cwd = HOME;

  const ctx: CommandContext = {
    vfs,
    registry,
    auth,
    session: { user: "guest" },
    stdin: "",
    piped: false,
    baseUrl: "https://pia.test/",
    get cwd() {
      return cwd;
    },
    setCwd(path: string) {
      cwd = path;
    },
    print: (text = "", cls: LineClass = "normal") => lines.push({ text, cls }),
    error: (text: string) => lines.push({ text, cls: "error" }),
    clear: () => (lines.length = 0),
    persist: () => adapter.save(vfs.root),
    runApp: async () => {},
  };

  async function run(line: string): Promise<void> {
    const [name, ...args] = line.split(" ").filter(Boolean);
    const cmd = registry.get(name);
    if (!cmd) throw new Error(`no command: ${name}`);
    await cmd.run(args, ctx);
  }

  const text = () => lines.map((l) => l.text);
  return { ctx, run, text, registry };
}

describe("easter eggs", () => {
  it("xyzzy does nothing, as tradition demands", async () => {
    const h = harness();
    await h.run("xyzzy");
    expect(h.text()).toEqual(["Nothing happens."]);
  });

  it("coffee is a teapot (RFC 2324)", async () => {
    const h = harness();
    await h.run("coffee");
    expect(h.text().join("\n")).toContain("418");
  });

  it("does not shadow the real `brew` package manager with the coffee gag", () => {
    const h = harness();
    expect(h.registry.get("brew")?.name).toBe("brew");
    expect(h.registry.get("coffee")?.name).toBe("coffee");
  });

  it("redirects vi/vim/emacs/pico to the real editor (nano)", async () => {
    for (const editor of ["vi", "vim", "emacs", "pico"]) {
      const h = harness();
      await h.run(editor);
      expect(h.text().join("\n")).toContain("nano");
    }
  });

  it("ed is the standard text editor", async () => {
    const h = harness();
    await h.run("ed");
    expect(h.text()[0]).toBe("ed is the standard text editor.");
  });

  it("catches the vi-quit reflex (:q / :wq / :x) and points at exit", async () => {
    for (const bail of [":q", ":q!", ":wq", ":wq!", ":x"]) {
      const h = harness();
      await h.run(bail);
      expect(h.text().join("\n")).toContain("exit");
    }
  });
});

describe("eggs stay hidden", () => {
  const EGGS = ["xyzzy", "coffee", "vim", "ed", ":q"];

  it("keeps eggs out of `help`", async () => {
    const h = harness();
    await h.run("help");
    const help = h.text().join("\n");
    for (const egg of EGGS) {
      // A bare command name on its own help row — not merely mentioned in prose.
      expect(help).not.toMatch(new RegExp(`^\\s+${egg.replace(/[:!]/g, "\\$&")}\\b`, "m"));
    }
  });

  it("keeps eggs out of Tab-completion / the man topic list", () => {
    const h = harness();
    const names = h.registry.namesStartingWith("");
    for (const egg of EGGS) expect(names).not.toContain(egg);
  });

  it("still resolves an egg you already know, via the registry (so `man`/`help` reach it)", () => {
    const h = harness();
    for (const egg of EGGS) expect(h.registry.get(egg)).toBeTruthy();
  });
});
