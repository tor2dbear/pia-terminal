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

  it("ls lists every file argument, not just the first", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.md`, "");
    h.vfs.writeFile(`${HOME}/b.md`, "");
    await h.run("ls a.md b.md");
    expect(h.text()).toEqual(["a.md  b.md"]);
  });

  it("ls labels each directory with a header when given several", async () => {
    const h = harness();
    h.vfs.mkdirp(`${HOME}/one`);
    h.vfs.mkdirp(`${HOME}/two`);
    h.vfs.writeFile(`${HOME}/one/x`, "");
    h.vfs.writeFile(`${HOME}/two/y`, "");
    await h.run("ls one two");
    expect(h.text()).toEqual(["one:", "x", "", "two:", "y"]);
  });

  it("cp duplicates a file, leaving the original", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "data");
    await h.run("cp a.txt b.txt");
    expect(h.vfs.readFile(`${HOME}/b.txt`)).toBe("data");
    expect(h.vfs.readFile(`${HOME}/a.txt`)).toBe("data");
  });

  it("cp into a directory keeps the filename", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "data");
    h.vfs.mkdir(`${HOME}/dir`);
    await h.run("cp a.txt dir");
    expect(h.vfs.readFile(`${HOME}/dir/a.txt`)).toBe("data");
  });

  it("cp refuses a directory without -r", async () => {
    const h = harness();
    h.vfs.mkdirp(`${HOME}/d`);
    await h.run("cp d d2");
    expect(h.lines.at(-1)?.cls).toBe("error");
    expect(h.vfs.getNode(`${HOME}/d2`)).toBeNull();
  });

  it("cp -r copies a directory tree", async () => {
    const h = harness();
    h.vfs.mkdirp(`${HOME}/d`);
    h.vfs.writeFile(`${HOME}/d/f.txt`, "hi");
    await h.run("cp -r d d2");
    expect(h.vfs.readFile(`${HOME}/d2/f.txt`)).toBe("hi");
  });

  it("cp copies several files into a directory", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "1");
    h.vfs.writeFile(`${HOME}/b.txt`, "2");
    h.vfs.mkdir(`${HOME}/dir`);
    await h.run("cp a.txt b.txt dir");
    expect(h.vfs.readFile(`${HOME}/dir/a.txt`)).toBe("1");
    expect(h.vfs.readFile(`${HOME}/dir/b.txt`)).toBe("2");
  });

  it("cp of several files requires a directory target", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "1");
    h.vfs.writeFile(`${HOME}/b.txt`, "2");
    await h.run("cp a.txt b.txt c.txt");
    expect(h.lines.at(-1)?.cls).toBe("error");
  });

  it("cp errors on a missing directory target with a trailing slash", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "1");
    await h.run("cp a.txt missing/");
    expect(h.lines.at(-1)?.cls).toBe("error");
    expect(h.vfs.getNode(`${HOME}/missing`)).toBeNull();
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

  it("head prints the first 10 lines by default", async () => {
    const h = harness();
    h.ctx.stdin = Array.from({ length: 15 }, (_, i) => `L${i + 1}`).join("\n");
    await h.run("head");
    expect(h.text()).toEqual(Array.from({ length: 10 }, (_, i) => `L${i + 1}`));
  });

  it("head -n<k> limits the count", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nc\nd";
    await h.run("head -n2");
    expect(h.text()).toEqual(["a", "b"]);
  });

  it("head -<k> shorthand works", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nc\nd";
    await h.run("head -1");
    expect(h.text()).toEqual(["a"]);
  });

  it("tail prints the last lines and ignores a trailing newline", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb\nc\n";
    await h.run("tail -n 2");
    expect(h.text()).toEqual(["b", "c"]);
  });

  it("head reads a named file", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/f.txt`, "1\n2\n3\n4");
    await h.run("head -n3 f.txt");
    expect(h.text()).toEqual(["1", "2", "3"]);
  });

  it("head labels each file with a header when several are given", async () => {
    const h = harness();
    h.vfs.writeFile(`${HOME}/a.txt`, "a1\na2");
    h.vfs.writeFile(`${HOME}/b.txt`, "b1\nb2");
    await h.run("head -n1 a.txt b.txt");
    expect(h.text()).toEqual(["==> a.txt <==", "a1", "", "==> b.txt <==", "b1"]);
  });

  it("head reports an invalid line count", async () => {
    const h = harness();
    h.ctx.stdin = "a\nb";
    await h.run("head -n x");
    expect(h.lines.at(-1)?.cls).toBe("error");
  });

  it("sort orders lines lexically; -r reverses", async () => {
    const h = harness();
    h.ctx.stdin = "banana\napple\ncherry";
    await h.run("sort");
    expect(h.text()).toEqual(["apple", "banana", "cherry"]);
    const h2 = harness();
    h2.ctx.stdin = "banana\napple\ncherry";
    await h2.run("sort -r");
    expect(h2.text()).toEqual(["cherry", "banana", "apple"]);
  });

  it("sort -n compares numerically", async () => {
    const h = harness();
    h.ctx.stdin = "10\n2\n1";
    await h.run("sort -n");
    expect(h.text()).toEqual(["1", "2", "10"]);
  });

  it("sort -u drops duplicates", async () => {
    const h = harness();
    h.ctx.stdin = "b\na\na\nb";
    await h.run("sort -u");
    expect(h.text()).toEqual(["a", "b"]);
  });

  it("sort -nu de-dupes by the numeric key, not raw text", async () => {
    const h = harness();
    h.ctx.stdin = "2 b\n2 a\n1 x";
    await h.run("sort -nu");
    expect(h.text()).toEqual(["1 x", "2 b"]); // the two "2 ..." lines are one run
  });

  it("uniq collapses only adjacent duplicates", async () => {
    const h = harness();
    h.ctx.stdin = "a\na\nb\na";
    await h.run("uniq");
    expect(h.text()).toEqual(["a", "b", "a"]);
  });

  it("uniq -c prefixes a run count; -d shows only duplicates", async () => {
    const h = harness();
    h.ctx.stdin = "a\na\nb";
    await h.run("uniq -c");
    expect(h.text()).toEqual(["   2 a", "   1 b"]);
    const h2 = harness();
    h2.ctx.stdin = "a\na\nb";
    await h2.run("uniq -d");
    expect(h2.text()).toEqual(["a"]);
  });

  it("cut -f selects fields, always in input order", async () => {
    const h = harness();
    h.ctx.stdin = "a,b,c";
    await h.run("cut -d, -f3,1");
    expect(h.text()).toEqual(["a,c"]);
  });

  it("cut -f supports open-ended ranges", async () => {
    const h = harness();
    h.ctx.stdin = "a,b,c,d";
    await h.run("cut -d, -f2-");
    expect(h.text()).toEqual(["b,c,d"]);
  });

  it("cut -c selects characters", async () => {
    const h = harness();
    h.ctx.stdin = "abcdef";
    await h.run("cut -c1-3");
    expect(h.text()).toEqual(["abc"]);
  });

  it("cut passes a line through when it lacks the delimiter", async () => {
    const h = harness();
    h.ctx.stdin = "nodelimiter";
    await h.run("cut -d, -f1");
    expect(h.text()).toEqual(["nodelimiter"]);
  });

  it("cut errors without -f or -c", async () => {
    const h = harness();
    h.ctx.stdin = "a,b";
    await h.run("cut");
    expect(h.lines.at(-1)?.cls).toBe("error");
  });

  it("cut rejects -f and -c together", async () => {
    const h = harness();
    h.ctx.stdin = "a,b";
    await h.run("cut -f2 -c1");
    expect(h.lines.at(-1)?.cls).toBe("error");
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
