// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";
import { parsePublishHash } from "../share/publish.js";
import { bootPublishedSession } from "../pia/publishSession.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
let term: Terminal | undefined;

function mount(): { root: HTMLElement; vfs: VFS } {
  const vfs = VFS.seed();
  vfs.mkdirp("/home/guest/notes");
  vfs.writeFile("/home/guest/notes/index.md", "# Home\n\nWelcome.");
  vfs.writeFile("/home/guest/notes/about.md", "About *us*.");
  vfs.writeFile("/home/guest/notes/photo.png", "not markdown");
  const root = document.createElement("div");
  document.body.append(root);
  term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
  });
  return { root, vfs };
}

const lines = (root: HTMLElement) =>
  [...root.querySelectorAll(".term-line")].map((n) => n.textContent ?? "");

async function run(root: HTMLElement, text: string): Promise<void> {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
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

describe("publish command", () => {
  it("prints a #p= link carrying the folder's .md files (only)", async () => {
    const { root } = mount();
    await run(root, "publish notes");
    const url = lines(root).find((l) => l.includes("#p="));
    expect(url).toBeDefined();
    const site = parsePublishHash(url!.slice(url!.indexOf("#")));
    expect(site?.title).toBe("notes");
    expect(site?.pages.map((p) => p.name)).toEqual(["index.md", "about.md"]); // no .png
  });

  it("errors clearly on bad input", async () => {
    const { root, vfs } = mount();
    vfs.mkdirp("/home/guest/empty");

    await run(root, "publish");
    expect(root.querySelector(".term-line.error")?.textContent).toContain("specify a folder");

    await run(root, "publish nope");
    expect(lines(root).join("\n")).toContain("no such directory");

    await run(root, "publish notes/index.md");
    expect(lines(root).join("\n")).toContain("not a directory");

    await run(root, "publish empty");
    expect(lines(root).join("\n")).toContain("no .md files");
  });
});

describe("published-folder session (opening a #p= link)", () => {
  const site = {
    title: "my-notes",
    pages: [
      { name: "index.md", content: "# Home\n\nWelcome to my notes." },
      { name: "todo.md", content: "- ship it" },
    ],
  };

  it("opens a terminal, banners the folder, and auto-lists the files", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    term = await bootPublishedSession(root, site);
    const text = [...root.querySelectorAll(".term-line")].map((n) => n.textContent).join("\n");
    expect(text).toContain("published folder: my-notes");
    expect(text).toContain("ls"); // the echoed auto-command
    expect(text).toContain("index.md");
    expect(text).toContain("todo.md");
    // A real prompt is present — it's a terminal, not a static page.
    expect(root.querySelector(".term-prompt")).not.toBeNull();
  });

  it("lets the viewer read a published file with cat", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    term = await bootPublishedSession(root, site);
    await term.exec("cat index.md");
    const text = [...root.querySelectorAll(".term-line")].map((n) => n.textContent).join("\n");
    expect(text).toContain("Welcome to my notes.");
  });

  it("mounts only the published files — no default welcome file", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    term = await bootPublishedSession(root, site);
    await term.exec("ls");
    const text = [...root.querySelectorAll(".term-line")].map((n) => n.textContent).join("\n");
    expect(text).not.toContain("welcome.txt");
  });
});
