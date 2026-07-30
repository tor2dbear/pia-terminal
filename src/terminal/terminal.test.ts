// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "./terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";
import type { Command } from "../commands/registry.js";
import { piaExtendContext } from "../pia/context.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

let term: Terminal | undefined;

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  term = new Terminal(root, {
    vfs: VFS.seed(),
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
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

  it("re-homes onto the current account (for a multiplexer's other windows)", async () => {
    const vfs = VFS.seed();
    const session = { user: "guest" };
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs,
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session,
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
    });
    vfs.mkdirp("/home/guest/sub");
    await runLine(root, "cd sub");
    expect(term.title()).toBe("~/sub"); // this window is deep in the old home

    // Another window logged into a different account: shared session + vfs.home
    // moved. rehome() catches this window up.
    session.user = "alice";
    vfs.mkdirp("/home/alice");
    vfs.home = "/home/alice";
    term.rehome();
    expect(term.title()).toBe("~"); // back at the new account's home
    expect(root.querySelector(".term-prompt")?.textContent).toBe("alice@pia:~$");
  });

  it("seeds up-arrow from persisted history (the HISTFILE load seam)", () => {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      loadHistory: () => ["ls", "pwd"], // as if read from ~/.pia/history at boot
    });
    press(root, "ArrowUp");
    expect(typed(root).trim()).toBe("pwd"); // most recent first
    press(root, "ArrowUp");
    expect(typed(root).trim()).toBe("ls"); // reaches an earlier session's command
  });

  it("persists each command through the saveHistory seam", async () => {
    const saved: string[][] = [];
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      saveHistory: (history) => saved.push([...history]),
    });
    await runLine(root, "pwd");
    await runLine(root, "whoami");
    expect(saved.at(-1)).toEqual(["pwd", "whoami"]);
  });

  it("wipes the store when `history -c` clears history", async () => {
    let cleared = false;
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      loadHistory: () => ["ls"],
      clearHistory: () => (cleared = true),
    });
    await runLine(root, "history -c");
    expect(cleared).toBe(true);
    press(root, "ArrowUp");
    expect(typed(root).trim()).toBe(""); // nothing left to recall
  });

  it("keeps a histIgnore'd (secret-bearing) command out of history entirely", async () => {
    const saved: string[][] = [];
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      saveHistory: (history) => saved.push([...history]),
      histIgnore: (cmds) => cmds.includes("passwd"),
    });
    await runLine(root, "pwd");
    await runLine(root, "passwd hunter2"); // a secret — must not be recorded
    await runLine(root, "whoami");
    // Never persisted, and up-arrow can't recall it either.
    expect(saved.flat()).not.toContain("passwd hunter2");
    expect(saved.at(-1)).toEqual(["pwd", "whoami"]);
    press(root, "ArrowUp");
    expect(typed(root).trim()).toBe("whoami"); // skips straight past the secret
  });

  it("resolves aliases before the secret check (so `alias p passwd; p pw` is caught)", async () => {
    const saved: string[][] = [];
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      configure: () => ({ aliases: { p: "passwd" } }), // `p` is an alias for passwd
      saveHistory: (history) => saved.push([...history]),
      histIgnore: (cmds) => cmds.includes("passwd"),
    });
    await runLine(root, "p hunter2"); // expands to `passwd hunter2` — still a secret
    await runLine(root, "cat passwd"); // `passwd` here is a filename, not the command
    expect(saved.flat()).not.toContain("p hunter2"); // the aliased secret was excluded
    expect(saved.flat()).toContain("cat passwd"); // …but an ordinary line is kept
  });

  it("recurses into an `at` payload so a scheduled secret isn't persisted", async () => {
    const saved: string[][] = [];
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      saveHistory: (history) => saved.push([...history]),
      histIgnore: (cmds) => cmds.some((c) => c === "passwd" || c === "login"),
    });
    await runLine(root, "at now+5m ls"); // a harmless scheduled command — kept
    await runLine(root, "at now+5m login me secret"); // a scheduled secret — excluded
    expect(saved.flat()).toContain("at now+5m ls");
    expect(saved.flat()).not.toContain("at now+5m login me secret");
  });

  it("catches a secret behind an alias defined earlier in the same line", async () => {
    const saved: string[][] = [];
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      saveHistory: (history) => saved.push([...history]),
      histIgnore: (cmds) => cmds.includes("passwd"),
    });
    await runLine(root, "alias p passwd; p hunter2"); // defines p, then uses it — must be excluded
    expect(saved.flat()).not.toContain("alias p passwd; p hunter2");
  });

  it("expands alias args when inspecting an embedded `at` payload", async () => {
    const saved: string[][] = [];
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      configure: () => ({ aliases: { later: "at now+5m passwd" } }),
      saveHistory: (history) => saved.push([...history]),
      histIgnore: (cmds) => cmds.includes("passwd"),
    });
    await runLine(root, "later hunter2"); // → at now+5m passwd hunter2 — the secret must be caught
    expect(saved.flat()).not.toContain("later hunter2");
  });

  it("flushes pending history BEFORE an account change switches identity", async () => {
    // The flush must run while the *old* account's storage routing is still in
    // effect — otherwise the deferred save lands under the new identity.
    const order: string[] = [];
    const auth = new MemoryAuthAdapter();
    const realLogin = auth.login.bind(auth);
    auth.login = ((...a: Parameters<typeof auth.login>) => {
      order.push("login");
      return realLogin(...a);
    }) as typeof auth.login;
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(auth),
      flushPending: async () => {
        order.push("flush");
      },
    });
    await runLine(root, "login alice");
    expect(order).toEqual(["flush", "login"]); // flushed first, then identity switched
  });

  it("refuses to start a command while another window is mid account-change", async () => {
    const vfs = VFS.seed();
    let locked = true;
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs,
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      isLocked: () => locked,
    });
    await runLine(root, "mkdir foo");
    expect(vfs.getNode("/home/guest/foo")).toBeNull(); // locked → didn't run
    expect(root.textContent).toContain("account change");
    locked = false;
    await runLine(root, "mkdir foo");
    expect(vfs.getNode("/home/guest/foo")).not.toBeNull(); // unlocked → runs
  });

  it("settles an open app's command on dispose, so its cleanup runs", async () => {
    const registry = buildRegistry();
    let cleanedUp = false;
    registry.register({
      name: "holdapp",
      help: "opens an app that never exits on its own",
      run: async (_args, ctx) => {
        try {
          await ctx.runApp(() => ({
            mount() {},
            onKey() {},
            onText() {},
            unmount() {},
          }));
        } finally {
          cleanedUp = true; // e.g. a shared checklist unsubscribing
        }
      },
    });
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry,
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
    });
    await runLine(root, "holdapp"); // opens the app; the command awaits runApp
    expect(cleanedUp).toBe(false);
    term.dispose();
    await flush();
    expect(cleanedUp).toBe(true); // dispose settled the promise → the finally ran
  });

  it("exposes a hidden field to capture the soft keyboard", () => {
    const root = mount();
    expect(kbd(root)).toBeInstanceOf(HTMLInputElement);
  });

  it("overlays the capture field on the input line so native paste can reach it", () => {
    const root = mount();
    const line = root.querySelector(".term-inputline");
    const display = root.querySelector(".term-display");
    // The field is a child of the input line (a transparent overlay over the
    // visible display layer), not an off-screen 1px element — that reachability
    // is what lets iOS's long-press → Paste work, cross-app included.
    expect(line?.contains(kbd(root))).toBe(true);
    expect(line?.contains(display)).toBe(true);
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
      expect.arrayContaining(["Tab", "↑", "↓", "←", "→", "|", "~", "ctrl"]),
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
    expect(inEditor).not.toContain("ctrl"); // prompt-only key is gone

    press(root, "x", { ctrlKey: true });
    await flush();
    const atPrompt = [...root.querySelectorAll(".term-keybar .kb-key")].map(
      (b) => b.textContent,
    );
    expect(atPrompt).toContain("ctrl");
  });

  it("opens the Ctrl tray from the bar and fires a binding", () => {
    const root = mount();
    type(root, "hello world");
    tapKey(root, "ctrl"); // open the tray
    const tray = [...root.querySelectorAll(".term-keybar .kb-key")].map(
      (b) => b.textContent,
    );
    expect(tray).toEqual(expect.arrayContaining(["^A", "^E", "^W", "^U", "^K", "^C", "^L"]));
    tapKey(root, "^U"); // kill to start of line
    expect(typed(root)).not.toContain("hello world");
    // Tray closed again — the normal keys are back.
    const back = [...root.querySelectorAll(".term-keybar .kb-key")].map(
      (b) => b.textContent,
    );
    expect(back).toContain("Tab");
    expect(back).not.toContain("^U");
  });
});

describe("readline Ctrl bindings at the prompt", () => {
  it("^A / ^E jump to the start / end of the line", () => {
    const root = mount();
    type(root, "abc");
    press(root, "a", { ctrlKey: true }); // to start
    type(root, "X");
    expect(typed(root)).toContain("Xabc");
    press(root, "e", { ctrlKey: true }); // to end
    type(root, "Z");
    expect(typed(root)).toContain("XabcZ");
  });

  it("^U kills to the start, ^K to the end", () => {
    const root = mount();
    type(root, "keep DROP");
    // cursor at end; ^U removes everything before it
    press(root, "u", { ctrlKey: true });
    expect(typed(root).trim()).toBe("");
    type(root, "one two");
    press(root, "a", { ctrlKey: true }); // start
    press(root, "e", { ctrlKey: true }); // end (no-op sanity)
    press(root, "k", { ctrlKey: true }); // kill to end from end = no change
    expect(typed(root)).toContain("one two");
  });

  it("^W deletes the previous word", () => {
    const root = mount();
    type(root, "alpha beta");
    press(root, "w", { ctrlKey: true });
    expect(typed(root)).toContain("alpha ");
    expect(typed(root)).not.toContain("beta");
  });
});

/** The full inline suggestion currently shown (cursor char + dimmed rest). */
function ghost(root: HTMLElement): string {
  const rest = root.querySelector(".term-ghost");
  if (!rest) return "";
  const cursor = root.querySelector(".term-typed .term-cursor");
  return (cursor?.textContent ?? "") + (rest.textContent ?? "");
}

describe("inline autosuggestion (ghost text)", () => {
  it("suggests the rest of a command as you type", () => {
    const root = mount();
    type(root, "neof");
    expect(ghost(root)).toBe("etch");
  });

  it("suggests a filename from the filesystem", () => {
    const root = mount();
    type(root, "cat wel");
    expect(ghost(root)).toBe("come.txt");
  });

  it("suggests a command's own arguments (brew subcommand)", () => {
    const root = mount();
    type(root, "brew i");
    expect(ghost(root)).toBe("nstall");
  });

  it("suggests package names after `brew install`", () => {
    const root = mount();
    type(root, "brew install ca");
    expect(ghost(root)).toBe("l"); // cal
  });

  it("accepts the suggestion with the → key", () => {
    const root = mount();
    type(root, "neof");
    press(root, "ArrowRight");
    expect(typed(root)).toContain("neofetch");
    expect(ghost(root)).toBe("");
  });

  it("accepts the suggestion by tapping it", () => {
    const root = mount();
    type(root, "neof");
    root
      .querySelector(".term-ghost")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(typed(root)).toContain("neofetch");
  });

  it("shows no suggestion when the cursor is not at the end", () => {
    const root = mount();
    type(root, "neof");
    press(root, "ArrowLeft");
    expect(ghost(root)).toBe("");
  });

  it("shows a +N chip and cycles matches with Tab", () => {
    const root = mount();
    type(root, "c"); // cat, cd, changelog, clear, column, cp, crontab, crt, cut
    expect(ghost(root)).toBe("at");
    expect(root.querySelector(".term-more")?.textContent).toContain("+8");
    press(root, "Tab");
    expect(ghost(root)).toBe("d"); // cd
    press(root, "Tab");
    expect(ghost(root)).toBe("hangelog"); // changelog
  });

  it("cycles when the +N chip is tapped", () => {
    const root = mount();
    type(root, "c");
    root
      .querySelector(".term-more")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(ghost(root)).toBe("d");
  });
});

describe("swipe gestures", () => {
  function swipe(root: HTMLElement, fromX: number, toX: number): void {
    root.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: fromX, clientY: 40, bubbles: true }),
    );
    root.dispatchEvent(
      new MouseEvent("pointerup", { clientX: toX, clientY: 42, bubbles: true }),
    );
  }

  it("scrubs the cursor left with a horizontal swipe", () => {
    const root = mount();
    type(root, "hello");
    swipe(root, 200, 130); // ~3 chars left
    type(root, "X");
    expect(typed(root)).toContain("heXllo");
  });

  it("ignores a mostly-vertical drag (leaves it to scroll)", () => {
    const root = mount();
    type(root, "hello");
    root.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, clientY: 20, bubbles: true }),
    );
    root.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 108, clientY: 120, bubbles: true }),
    );
    type(root, "X");
    expect(typed(root)).toContain("helloX"); // cursor stayed at the end
  });
});

describe("filename globbing", () => {
  const out = (root: HTMLElement) =>
    [...root.querySelectorAll(".term-line")].map((n) => n.textContent);

  it("expands * against the filesystem, sorted", async () => {
    const root = mount();
    await runLine(root, "touch b.md");
    await runLine(root, "touch a.md");
    await runLine(root, "touch c.txt");
    await runLine(root, "echo *.md");
    expect(out(root)).toContain("a.md b.md");
  });

  it("quoting protects a wildcard (literal)", async () => {
    const root = mount();
    await runLine(root, "touch a.md");
    await runLine(root, 'echo "*.md"');
    expect(out(root)).toContain("*.md");
  });

  it("leaves a non-matching pattern literal", async () => {
    const root = mount();
    await runLine(root, "echo *.zip");
    expect(out(root)).toContain("*.zip");
  });

  it("feeds the expanded files to the command (cat *.md)", async () => {
    const root = mount();
    await runLine(root, "echo alpha > a.md");
    await runLine(root, "echo beta > b.md");
    await runLine(root, "cat *.md");
    const lines = out(root);
    expect(lines).toContain("alpha");
    expect(lines).toContain("beta");
  });

  it("ls *.md lists every match, not just the first", async () => {
    const root = mount();
    await runLine(root, "touch a.md");
    await runLine(root, "touch b.md");
    await runLine(root, "ls *.md");
    expect(out(root)).toContain("a.md  b.md");
  });
});

describe("command chaining", () => {
  const out = (root: HTMLElement) =>
    [...root.querySelectorAll(".term-line")].map((n) => n.textContent);

  it("; runs both commands in turn", async () => {
    const root = mount();
    await runLine(root, "echo one ; echo two");
    const lines = out(root);
    expect(lines).toContain("one");
    expect(lines).toContain("two");
  });

  it("&& runs the second when the first succeeds", async () => {
    const root = mount();
    await runLine(root, "echo ok && echo yes");
    expect(out(root)).toContain("yes");
  });

  it("&& short-circuits when the first fails", async () => {
    const root = mount();
    await runLine(root, "cd nope && echo unreached");
    // the echo output line never appears (the typed line is a separate element)
    expect(out(root)).not.toContain("unreached");
  });

  it("|| runs the second only when the first fails", async () => {
    const root = mount();
    await runLine(root, "cd nope || echo recovered");
    expect(out(root)).toContain("recovered");
  });

  it("|| skips the second when the first succeeds", async () => {
    const root = mount();
    await runLine(root, "echo fine || echo skipped");
    const lines = out(root);
    expect(lines).toContain("fine");
    expect(lines).not.toContain("skipped");
  });

  it("a screen app refused inside a pipeline fails the chain", async () => {
    const root = mount();
    // snake can't run captured; the refusal must count as a failure so && stops
    await runLine(root, "snake | cat && echo unreached");
    expect(out(root)).not.toContain("unreached");
  });
});

describe("Ctrl-C interrupts a running command", () => {
  /** Mount a terminal whose registry also has a command that blocks until its
   * `ctx.signal` fires — so a test can interrupt it mid-run. */
  function mountBlocking(): {
    root: HTMLElement;
    vfs: VFS;
    started: Promise<void>;
    sawSignal: () => boolean;
    markRan: () => boolean;
  } {
    const root = document.createElement("div");
    document.body.append(root);
    let sawSignal = false;
    let markRan = false;
    let announceStart: () => void;
    const started = new Promise<void>((r) => (announceStart = r));
    const blocker: Command = {
      name: "block",
      help: "block until interrupted (test only)",
      run: (_args, ctx) =>
        new Promise<void>((resolve) => {
          announceStart();
          if (ctx.signal?.aborted) return resolve();
          ctx.signal?.addEventListener(
            "abort",
            () => {
              sawSignal = true;
              resolve();
            },
            { once: true },
          );
        }),
    };
    // A downstream stage that records whether it ran (and emits output a
    // redirect would capture), to prove Ctrl-C stops the rest of the pipeline.
    const mark: Command = {
      name: "mark",
      help: "record that a later pipeline stage ran (test only)",
      run: (_args, ctx) => {
        markRan = true;
        ctx.print("marked");
      },
    };
    const registry = buildRegistry();
    registry.register(blocker);
    registry.register(mark);
    const vfs = VFS.seed();
    term = new Terminal(root, {
      vfs,
      adapter: new MemoryStorageAdapter(),
      registry,
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
    });
    return { root, vfs, started, sawSignal: () => sawSignal, markRan: () => markRan };
  }

  it("delivers the abort signal and echoes ^C, then frees the prompt", async () => {
    const { root, started, sawSignal } = mountBlocking();
    type(root, "block");
    press(root, "Enter");
    await started; // the command is now running and waiting on the signal

    press(root, "c", { ctrlKey: true }); // Ctrl-C
    await flush();

    expect(sawSignal()).toBe(true);
    const lines = [...root.querySelectorAll(".term-line")].map((n) => n.textContent);
    expect(lines).toContain("^C");
    // The prompt is usable again (the input line is no longer collapsed).
    expect(root.querySelector(".term-inputline")?.classList.contains("collapsed")).toBe(false);
  });

  it("ignores other keys while busy but still takes Ctrl-C", async () => {
    const { root, started } = mountBlocking();
    type(root, "block");
    press(root, "Enter");
    await started;

    type(root, "xyz"); // typing while busy must not reach the buffer
    press(root, "Enter"); // …nor submit anything
    await flush();
    expect(root.querySelector(".term-inputline")?.classList.contains("collapsed")).toBe(true);

    press(root, "c", { ctrlKey: true });
    await flush();
    expect(root.querySelector(".term-inputline")?.classList.contains("collapsed")).toBe(false);
  });

  it("stops the rest of a pipeline (and its redirect) on interrupt", async () => {
    const { root, vfs, started, markRan } = mountBlocking();
    type(root, "block | mark > out.txt");
    press(root, "Enter");
    await started; // `block` is running as the first stage

    press(root, "c", { ctrlKey: true });
    await flush();

    expect(markRan()).toBe(false); // the downstream stage never ran…
    expect(vfs.getNode(vfs.resolve("/home/guest", "out.txt"))).toBeNull(); // …and nothing was written
  });
});

describe("history", () => {
  const out = (root: HTMLElement) =>
    [...root.querySelectorAll(".term-line")].map((n) => n.textContent);

  it("lists the commands run this session, numbered", async () => {
    const root = mount();
    await runLine(root, "echo one");
    await runLine(root, "history");
    // history() includes the echo and the history command itself
    expect(out(root)).toContain("1  echo one");
  });

  it("-c empties the history", async () => {
    const root = mount();
    await runLine(root, "echo one");
    await runLine(root, "history -c");
    await runLine(root, "history");
    // after clearing, only the post-clear `history` invocations remain
    expect(out(root)).not.toContain("1  echo one");
  });
});
