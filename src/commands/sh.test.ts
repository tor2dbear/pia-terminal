// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS, HOME } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let term: Terminal | undefined;

/** Mount a real terminal over a (possibly pre-seeded) VFS. */
function mount(vfs: VFS = VFS.seed()): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
  });
  return root;
}

function type(root: HTMLElement, text: string): void {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

async function runLine(root: HTMLElement, text: string): Promise<void> {
  type(root, text);
  (root.querySelector(".term-kbd") as HTMLInputElement).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await flush();
}

afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
});

describe("sh — run script files", () => {
  it("runs each line of a script through the shell (multi-line, chaining, globbing)", async () => {
    const vfs = VFS.seed();
    // A script that exercises real shell machinery: `&&`, a pipe/redirect, and a
    // glob — everything `sh` should get for free by going through `ctx.exec`.
    vfs.writeFile(
      `${HOME}/build.sh`,
      ["mkdir out", "echo hello > out/a.txt", "echo world > out/b.txt", "cat out/*.txt > out/all.txt"].join(
        "\n",
      ),
    );
    const root = mount(vfs);

    await runLine(root, "sh build.sh");
    expect(vfs.getNode(`${HOME}/out`)?.type).toBe("dir");
    // The glob expanded inside the script and both files were concatenated.
    expect(vfs.readFile(`${HOME}/out/all.txt`)).toBe("hello\nworld");
  });

  it("skips blank lines and `#` comments (including a shebang)", async () => {
    const vfs = VFS.seed();
    vfs.writeFile(
      `${HOME}/s.sh`,
      ["#!/bin/sh", "# make a marker", "", "touch marker", "   # trailing comment"].join("\n"),
    );
    const root = mount(vfs);

    await runLine(root, "sh s.sh");
    expect(vfs.getNode(`${HOME}/marker`)).not.toBeNull();
    // A shebang/comment must not surface as `unknown command`.
    expect(root.textContent).not.toContain("unknown command");
  });

  it("`sh -c` runs a command string", async () => {
    const vfs = VFS.seed();
    const root = mount(vfs);
    await runLine(root, 'sh -c "mkdir a && mkdir a/b"');
    expect(vfs.getNode(`${HOME}/a/b`)?.type).toBe("dir");
  });

  it("runs stdin as the script when given no file (`echo cmd | sh`)", async () => {
    const vfs = VFS.seed();
    const root = mount(vfs);
    await runLine(root, 'echo "mkdir piped" | sh');
    expect(vfs.getNode(`${HOME}/piped`)?.type).toBe("dir");
  });

  it("treats an empty piped script as a valid no-op, not a usage error", async () => {
    const vfs = VFS.seed();
    const root = mount(vfs);
    await runLine(root, 'echo "" | sh'); // empty script piped in
    expect(root.textContent).not.toContain("usage: sh"); // did nothing, silently
    // A truly bare `sh` (no pipe) still shows the hint.
    await runLine(root, "sh");
    expect(root.textContent).toContain("usage: sh");
  });

  it("runs like a subprocess: a `cd` in the script doesn't move the caller's shell", async () => {
    const vfs = VFS.seed();
    // The script cd's into a subdir and creates a file there (proving cd took
    // effect *inside* the script), but the interactive prompt must return home.
    vfs.writeFile(`${HOME}/enter.sh`, ["mkdir sub", "cd sub", "touch inside.txt"].join("\n"));
    const root = mount(vfs);

    await runLine(root, "sh enter.sh");
    expect(vfs.getNode(`${HOME}/sub/inside.txt`)).not.toBeNull(); // cd worked within the script
    // Caller's cwd restored → prompt back at ~ (not ~/sub).
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@pia:~$");

    // `sh -c "cd …"` likewise leaves the caller where it was.
    await runLine(root, 'sh -c "cd sub"');
    expect(root.querySelector(".term-prompt")?.textContent).toBe("guest@pia:~$");
  });

  it("reports a missing file and a directory clearly", async () => {
    const vfs = VFS.seed();
    const root = mount(vfs);
    await runLine(root, "sh nope.sh");
    expect(root.textContent).toContain("cannot open nope.sh: no such file");

    await runLine(root, "mkdir adir");
    await runLine(root, "sh adir");
    expect(root.textContent).toContain("adir: is a directory");
  });

  it("continues past a failing line but reports the last command's status to `&&`", async () => {
    const vfs = VFS.seed();
    // First line fails, second succeeds → sh continues, and its exit status is
    // the *last* command's (success), so a trailing `&& ` runs.
    vfs.writeFile(`${HOME}/ok-last.sh`, ["rm /nope", "mkdir did-run"].join("\n"));
    // Last line fails → sh's status is failure, so `&&` short-circuits.
    vfs.writeFile(`${HOME}/fail-last.sh`, ["mkdir first", "rm /nope"].join("\n"));
    const root = mount(vfs);

    await runLine(root, "sh ok-last.sh && mkdir after-ok");
    expect(vfs.getNode(`${HOME}/did-run`)?.type).toBe("dir"); // continued past the failure
    expect(vfs.getNode(`${HOME}/after-ok`)?.type).toBe("dir"); // last line ok → && ran

    await runLine(root, "sh fail-last.sh && mkdir after-fail");
    expect(vfs.getNode(`${HOME}/first`)?.type).toBe("dir"); // earlier line ran
    expect(vfs.getNode(`${HOME}/after-fail`)).toBeNull(); // last line failed → && skipped
  });
});
