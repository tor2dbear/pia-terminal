// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";
import { parsePublishHash } from "../share/publish.js";
import { MemoryHandleStore } from "../share/handleStore.js";
import { MemoryPublicPagesStore } from "../share/publicPages.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
let term: Terminal | undefined;

function mount(): { root: HTMLElement; vfs: VFS } {
  const vfs = VFS.seed();
  vfs.mkdirp("/home/guest/notes");
  vfs.writeFile("/home/guest/notes/index.md", "# Home\n\nWelcome.");
  vfs.writeFile("/home/guest/notes/about.md", "About *us*.");
  vfs.writeFile("/home/guest/notes/plan.txt", "not markdown, still shared");
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

const linkSite = (root: HTMLElement) => {
  const url = lines(root).find((l) => l.includes("#p="));
  return url ? parsePublishHash(url.slice(url.indexOf("#"))) : null;
};

describe("publish command", () => {
  it("prints a #p= link carrying all the folder's files (index.md first)", async () => {
    const { root } = mount();
    await run(root, "publish notes");
    const site = linkSite(root);
    expect(site?.title).toBe("notes");
    // All files, not just Markdown; index.md leads, then alphabetical.
    expect(site?.pages.map((p) => p.name)).toEqual(["index.md", "about.md", "plan.txt"]);
  });

  it("errors clearly on bad input", async () => {
    const { root, vfs } = mount();
    vfs.mkdirp("/home/guest/empty");

    // No arg now targets ~/public_html (web publish); a guest has no account.
    await run(root, "publish");
    expect(lines(root).join("\n")).toContain("needs an account");

    await run(root, "publish nope");
    expect(lines(root).join("\n")).toContain("no such directory");

    await run(root, "publish notes/index.md");
    expect(lines(root).join("\n")).toContain("not a directory");

    await run(root, "publish empty");
    expect(lines(root).join("\n")).toContain("no files");
  });
});

function mountWeb(loggedIn = true): { root: HTMLElement; vfs: VFS; pages: MemoryPublicPagesStore } {
  const vfs = VFS.seed();
  vfs.mkdirp("/home/tor/public_html");
  vfs.writeFile("/home/tor/public_html/index.md", "# My site\n\nHello **world**.");
  vfs.writeFile("/home/tor/public_html/solresor.md", "# Solresor\n\nNotes.");
  vfs.writeFile("/home/tor/public_html/draft.txt", "not markdown");
  const pages = new MemoryPublicPagesStore();
  const auth = new MemoryAuthAdapter();
  if (loggedIn) void auth.login("tor"); // represent a signed-in cloud user
  const root = document.createElement("div");
  document.body.append(root);
  term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "tor" },
    extendContext: piaExtendContext(
      auth,
      undefined,
      "https://pia.example/",
      undefined,
      undefined,
      undefined,
      new MemoryHandleStore("tor"),
      pages,
    ),
  });
  return { root, vfs, pages };
}

describe("publish ~/public_html (web)", () => {
  it("claims a handle, publishes the .md pages, and prints tilde-URLs", async () => {
    const { root, pages } = mountWeb();
    await run(root, "publish");
    const text = lines(root).join("\n");
    // Handle derived from the display username, claimed on first publish.
    expect(text).toContain("claimed ~tor");
    expect(text).toContain("https://pia.example/~tor/");
    // Per-page: index.md → the bare root, others → slug without .md.
    expect(text).toContain("https://pia.example/~tor/solresor");
    // Only Markdown is published (draft.txt is skipped), index first.
    const live = await pages.list("tor");
    expect(live.map((p) => p.path).sort()).toEqual(["index.md", "solresor.md"]);
    // The Markdown *source* is stored (the Pages Function renders at serve time).
    const index = live.find((p) => p.path === "index.md");
    expect(index?.content).toBe("# My site\n\nHello **world**.");
  });

  it("reuses the existing handle on a second publish and removes deleted pages", async () => {
    const { root, vfs, pages } = mountWeb();
    await run(root, "publish");
    // Delete a page, republish → it drops from the live set (replace-all).
    vfs.remove("/home/tor/public_html/solresor.md");
    await run(root, "publish");
    const live = await pages.list("tor");
    expect(live.map((p) => p.path)).toEqual(["index.md"]);
    // Handle wasn't re-claimed the second time (still just one).
    expect(lines(root).filter((l) => l.includes("claimed ~tor")).length).toBe(1);
  });

  it("errors when ~/public_html is missing or has no markdown", async () => {
    const { root, vfs } = mountWeb();
    vfs.remove("/home/tor/public_html/index.md");
    vfs.remove("/home/tor/public_html/solresor.md");
    await run(root, "publish");
    expect(lines(root).join("\n")).toContain("no .md pages");
  });

  it("tells a signed-out user to log in — even with a folder present (not just 'make a folder')", async () => {
    const { root } = mountWeb(false); // cloud wired but nobody logged in
    await run(root, "publish");
    const text = lines(root).join("\n");
    expect(text).toContain("needs an account");
    expect(text).not.toContain("no ~/public_html");
  });

  it("unpublishes an existing site when the folder is emptied (mirror)", async () => {
    const { root, vfs, pages } = mountWeb();
    await run(root, "publish");
    expect((await pages.list("tor")).length).toBe(2);
    // Empty the folder and republish → the live set is cleared.
    vfs.remove("/home/tor/public_html/index.md");
    vfs.remove("/home/tor/public_html/solresor.md");
    await run(root, "publish");
    expect(await pages.list("tor")).toEqual([]);
    expect(lines(root).join("\n")).toContain("unpublished");
  });

  it("refuses when two files collide onto the same routable path", async () => {
    const { root, vfs, pages } = mountWeb();
    vfs.writeFile("/home/tor/public_html/post.md", "# a");
    vfs.writeFile("/home/tor/public_html/post.MD", "# b");
    await run(root, "publish");
    expect(lines(root).join("\n")).toContain("map to the same page");
    // Nothing was published (the collision is caught before the store is touched).
    expect(await pages.list("tor")).toEqual([]);
  });

  it("slugifies filenames to a URL-safe, bijective path", async () => {
    const { root, vfs, pages } = mountWeb();
    vfs.remove("/home/tor/public_html/index.md");
    vfs.remove("/home/tor/public_html/solresor.md");
    vfs.writeFile("/home/tor/public_html/Index.MD", "# Home");
    vfs.writeFile("/home/tor/public_html/Trip Notes.md", "# Trip");
    vfs.writeFile("/home/tor/public_html/Smith,John.md", "# Bio");
    await run(root, "publish");
    const paths = (await pages.list("tor")).map((p) => p.path).sort();
    // index normalised; spaces/punctuation/case → [a-z0-9-] so the route and
    // the PostgREST filter can never choke on them.
    expect(paths).toEqual(["index.md", "smith-john.md", "trip-notes.md"]);
  });
});

describe("share <folder>", () => {
  it("shares a folder as the same #p= link publish makes", async () => {
    const { root } = mount();
    await run(root, "share notes");
    const site = linkSite(root);
    expect(site?.title).toBe("notes");
    expect(site?.pages.map((p) => p.name)).toEqual(["index.md", "about.md", "plan.txt"]);
  });

  it("refuses to co-edit a folder", async () => {
    const { root } = mount();
    await run(root, "share notes bob@example.com");
    expect(root.querySelector(".term-line.error")?.textContent).toContain("can't co-edit a folder");
  });

  it("still shares a single file as a #s= link", async () => {
    const { root } = mount();
    await run(root, "share notes/index.md");
    expect(lines(root).join("\n")).toContain("#s=");
  });
});
