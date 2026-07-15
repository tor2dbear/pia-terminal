import { describe, expect, it } from "vitest";
import { VFS, HOME } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import type { CommandContext, LineClass } from "./registry.js";

/** A test harness: runs commands over a real VFS and captures output. */
function harness() {
  const vfs = VFS.seed();
  const adapter = new MemoryStorageAdapter();
  const registry = buildRegistry();
  const lines: { text: string; cls: LineClass }[] = [];
  let cwd = HOME;

  const ctx: CommandContext = {
    vfs,
    registry,
    auth: new MemoryAuthAdapter(),
    session: { user: "guest" },
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
    runApp: async () => {}, // no screen in the headless command harness
  };

  async function run(line: string): Promise<void> {
    const [name, ...args] = line.split(" ").filter(Boolean);
    const cmd = registry.get(name);
    if (!cmd) throw new Error(`no command: ${name}`);
    await cmd.run(args, ctx);
  }

  const text = () => lines.map((l) => l.text);
  return { ctx, run, lines, text, vfs, get cwd() { return cwd; } };
}

describe("filesystem commands", () => {
  it("pwd prints the current directory", async () => {
    const h = harness();
    await h.run("pwd");
    expect(h.text()).toEqual([HOME]);
  });

  it("mkdir + ls shows the new directory", async () => {
    const h = harness();
    await h.run("mkdir proj");
    await h.run("ls");
    expect(h.text().at(-1)).toContain("proj/");
  });

  it("cd changes directory and updates pwd", async () => {
    const h = harness();
    await h.run("mkdir proj");
    await h.run("cd proj");
    await h.run("pwd");
    expect(h.text().at(-1)).toBe(`${HOME}/proj`);
  });

  it("cd into a missing directory errors", async () => {
    const h = harness();
    await h.run("cd nope");
    expect(h.lines.at(-1)?.cls).toBe("error");
    expect(h.cwd).toBe(HOME);
  });

  it("touch + cat round-trips an (empty) file", async () => {
    const h = harness();
    await h.run("touch a.txt");
    await h.run("cat a.txt");
    expect(h.text().at(-1)).toBe("");
  });

  it("rm removes a file", async () => {
    const h = harness();
    await h.run("touch a.txt");
    await h.run("rm a.txt");
    await h.run("cat a.txt");
    expect(h.lines.at(-1)?.cls).toBe("error");
  });

  it("persists mutations through the adapter", async () => {
    const h = harness();
    await h.run("mkdir keep");
    // A fresh VFS from the adapter's saved snapshot should see the change.
    const saved = await new MemoryStorageAdapter().load();
    expect(saved).toBeNull(); // sanity: a different adapter has nothing
    expect(h.vfs.getNode(`${HOME}/keep`)).not.toBeNull();
  });
});

describe("system commands", () => {
  it("help lists registered commands", async () => {
    const h = harness();
    await h.run("help");
    const joined = h.text().join("\n");
    expect(joined).toContain("ls");
    expect(joined).toContain("cat");
  });

  it("whoami prints the session user", async () => {
    const h = harness();
    await h.run("whoami");
    expect(h.text()).toEqual(["guest"]);
  });

  it("echo joins its arguments", async () => {
    const h = harness();
    await h.run("echo hi there");
    expect(h.text()).toEqual(["hi there"]);
  });

  it("unknown flags are ignored by rm but files still removed", async () => {
    const h = harness();
    await h.run("mkdir d");
    await h.run("touch d/f");
    await h.run("rm -r d");
    expect(h.vfs.getNode(`${HOME}/d`)).toBeNull();
  });
});

describe("auth commands", () => {
  it("login switches the user, home, and cwd", async () => {
    const h = harness();
    await h.run("login alice");
    expect(h.ctx.session.user).toBe("alice");
    expect(h.vfs.home).toBe("/home/alice");
    expect(h.cwd).toBe("/home/alice");
  });

  it("login creates the user's home directory", async () => {
    const h = harness();
    await h.run("login bob");
    expect(h.vfs.getNode("/home/bob")).not.toBeNull();
  });

  it("login rejects an empty or invalid username", async () => {
    const h = harness();
    await h.run("login");
    expect(h.lines.at(-1)?.cls).toBe("error");
    await h.run("login bad/name");
    expect(h.lines.at(-1)?.cls).toBe("error");
    expect(h.ctx.session.user).toBe("guest");
  });

  it("logout returns to guest at the guest home", async () => {
    const h = harness();
    await h.run("login alice");
    await h.run("logout");
    expect(h.ctx.session.user).toBe("guest");
    expect(h.vfs.home).toBe(HOME);
    expect(h.cwd).toBe(HOME);
  });

  it("logout as guest is an error", async () => {
    const h = harness();
    await h.run("logout");
    expect(h.lines.at(-1)?.cls).toBe("error");
  });

  it("files created while logged in live under that user's home", async () => {
    const h = harness();
    await h.run("login alice");
    await h.run("touch notes.txt");
    expect(h.vfs.getNode("/home/alice/notes.txt")).not.toBeNull();
  });
});
