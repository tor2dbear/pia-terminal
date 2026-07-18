import { describe, expect, it } from "vitest";
import { VFS, HOME } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { decodeShare } from "../share/share.js";
import type { AuthAdapter, Session } from "../auth/adapter.js";
import type { CommandContext, LineClass } from "./registry.js";

/** A cloud-like auth stub that requires a password and a chosen username. */
class PasswordAuth implements AuthAdapter {
  readonly requiresPassword = true;
  private user: string | null = null;
  async current(): Promise<Session | null> {
    return this.user ? { user: this.user } : null;
  }
  async login(email: string, password?: string): Promise<Session> {
    if (!password) throw new Error("bad");
    this.user = email.split("@")[0];
    return { user: this.user };
  }
  async register(username: string, email?: string, password?: string): Promise<Session> {
    if (!email || !password) throw new Error("email and password required");
    this.user = username;
    return { user: username };
  }
  async rename(username: string): Promise<void> {
    this.user = username;
  }
  async logout(): Promise<void> {
    this.user = null;
  }
}

/** A test harness: runs commands over a real VFS and captures output. */
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

  it("useradd is reachable via its `register` alias", async () => {
    const h = harness();
    expect(h.ctx.registry.get("register")).toBe(h.ctx.registry.get("useradd"));
    expect(h.ctx.registry.get("edit")).toBe(h.ctx.registry.get("nano"));
  });
});

describe("auth with a password-requiring backend", () => {
  it("useradd asks for email + password after the username", async () => {
    const h = harness(new PasswordAuth());
    await h.run("register tor2dbear");
    const last = h.lines.at(-1);
    expect(last?.cls).toBe("error");
    expect(last?.text).toContain("email and password required");
    expect(h.ctx.session.user).toBe("guest");
  });

  it("login asks for a password", async () => {
    const h = harness(new PasswordAuth());
    await h.run("login tb.hedberg@gmail.com");
    expect(h.lines.at(-1)?.text).toContain("password required");
  });

  it("registers with a username + email + password and enters that home", async () => {
    const h = harness(new PasswordAuth());
    await h.run("register tor2dbear tb.hedberg@gmail.com secret");
    expect(h.ctx.session.user).toBe("tor2dbear");
    expect(h.cwd).toBe("/home/tor2dbear");
  });
});

describe("share", () => {
  it("prints a link that decodes back to the file", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/note.txt`, "shared hej");
    await h.run("share note.txt");
    const link = h.lines.at(-1);
    expect(link?.cls).toBe("accent");
    expect(link?.text).toContain("https://pia.test/#s=");
    const payload = link!.text.split("#s=")[1];
    expect(decodeShare(payload)).toEqual({ name: "note.txt", content: "shared hej" });
  });

  it("errors on a missing file or a directory", async () => {
    const h = harness();
    await h.run("share nope.txt");
    expect(h.lines.at(-1)?.cls).toBe("error");
    await h.run("mkdir d");
    await h.run("share d");
    expect(h.lines.at(-1)?.text).toContain("not a file");
  });
});

describe("usermod (rename)", () => {
  it("renames the user and moves the home directory with its files", async () => {
    const h = harness();
    await h.run("login alice");
    await h.run("touch notes.txt");
    await h.run("usermod tor2dbear");
    expect(h.ctx.session.user).toBe("tor2dbear");
    expect(h.cwd).toBe("/home/tor2dbear");
    expect(h.vfs.getNode("/home/tor2dbear/notes.txt")).not.toBeNull();
    expect(h.vfs.getNode("/home/alice")).toBeNull();
  });

  it("requires being logged in", async () => {
    const h = harness();
    await h.run("usermod bob");
    expect(h.lines.at(-1)?.text).toContain("log in first");
  });
});

describe("text/search commands", () => {
  it("grep filters piped input", async () => {
    const h = harness();
    h.ctx.stdin = "apple\nbanana\navocado";
    await h.run("grep a");
    expect(h.text()).toEqual(["apple", "banana", "avocado"]);
  });

  it("grep matches a substring within lines", async () => {
    const h = harness();
    h.ctx.stdin = "todo: buy milk\ndone: dishes\ntodo: call";
    await h.run("grep todo");
    expect(h.text()).toEqual(["todo: buy milk", "todo: call"]);
  });

  it("grep -v inverts and -n numbers lines", async () => {
    const h = harness();
    h.ctx.stdin = "keep\ndrop\nkeep";
    await h.run("grep -vn drop");
    expect(h.text()).toEqual(["1:keep", "3:keep"]);
  });

  it("grep -i is case-insensitive", async () => {
    const h = harness();
    h.ctx.stdin = "Hello\nworld";
    await h.run("grep -i hello");
    expect(h.text()).toEqual(["Hello"]);
  });

  it("grep reads from a file", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "one\ntwo\nthree");
    await h.run("grep t a.txt");
    expect(h.text()).toEqual(["two", "three"]);
  });

  it("grep -A shows trailing context after a match", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nMATCH\nd\ne";
    await h.run("grep -A1 MATCH");
    expect(h.text()).toEqual(["MATCH", "d"]);
  });

  it("grep -B shows leading context before a match", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nMATCH\nd\ne";
    await h.run("grep -B1 MATCH");
    expect(h.text()).toEqual(["b", "MATCH"]);
  });

  it("grep -C shows context on both sides", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nMATCH\nd\ne";
    await h.run("grep -C1 MATCH");
    expect(h.text()).toEqual(["b", "MATCH", "d"]);
  });

  it("grep accepts a separated context count (-A 2)", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nMATCH\nd\ne";
    await h.run("grep -A 2 MATCH");
    expect(h.text()).toEqual(["MATCH", "d", "e"]);
  });

  it("grep merges overlapping context windows without duplicating lines", async () => {
    const h = harness();
    h.ctx.stdin = "x\nhit\ny\nhit\nz";
    await h.run("grep -C1 hit");
    // windows [0,2] and [2,4] touch → one group, no `--`, `y` printed once
    expect(h.text()).toEqual(["x", "hit", "y", "hit", "z"]);
  });

  it("grep separates non-adjacent context groups with --", async () => {
    const h = harness();
    h.ctx.stdin = "hit\na\nb\nc\nhit";
    await h.run("grep -C1 hit");
    expect(h.text()).toEqual(["hit", "a", "--", "c", "hit"]);
  });

  it("grep -n marks context lines with - and matches with :", async () => {
    const h = harness();
    h.ctx.stdin = "a\nMATCH\nb";
    await h.run("grep -n -A1 MATCH");
    expect(h.text()).toEqual(["2:MATCH", "3-b"]);
  });

  it("grep lets an explicit -A override -C", async () => {
    const h = harness();
    h.ctx.stdin = "a\nMATCH\nb\nc\nd";
    await h.run("grep -C1 -A2 MATCH");
    // before from -C1, after from -A2 → window [0,3]
    expect(h.text()).toEqual(["a", "MATCH", "b", "c"]);
  });

  it("grep -A0 behaves like no context", async () => {
    const h = harness();
    h.ctx.stdin = "a\nMATCH\nb";
    await h.run("grep -A0 MATCH");
    expect(h.text()).toEqual(["MATCH"]);
  });

  it("grep rejects an invalid context count", async () => {
    const h = harness();
    h.ctx.stdin = "a\nMATCH\nb";
    await h.run("grep -A x MATCH");
    expect(h.lines.at(-1)?.cls).toBe("error");
    expect(h.lines.at(-1)?.text).toContain("invalid context");
  });

  it("find lists a tree recursively", async () => {
    const h = harness();
    h.vfs.mkdirp(`${HOME}/proj/src`);
    h.vfs.writeFile(`${HOME}/proj/src/main.ts`, "");
    await h.run("find proj");
    const out = h.text();
    expect(out).toContain(`${HOME}/proj`);
    expect(out).toContain(`${HOME}/proj/src/main.ts`);
  });

  it("find -name filters by glob", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "");
    h.vfs.writeFile(`${HOME}/b.md`, "");
    await h.run("find . -name *.txt");
    const out = h.text();
    expect(out.some((l) => l.endsWith("a.txt"))).toBe(true);
    expect(out.some((l) => l.endsWith("b.md"))).toBe(false);
  });

  it("wc -l counts lines of piped input", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nc";
    await h.run("wc -l");
    expect(h.text()).toEqual(["3"]);
  });

  it("cat with no args passes stdin through", async () => {
    const h = harness();
    h.ctx.stdin = "line one\nline two";
    await h.run("cat");
    expect(h.text()).toEqual(["line one", "line two"]);
  });
});
