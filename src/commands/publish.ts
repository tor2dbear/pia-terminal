import { isDir, isFile } from "../vfs/types.js";
import {
  encodePublish,
  MAX_PUBLISH_PAYLOAD,
  type PublishedPage,
} from "../share/publish.js";
import { renderMarkdownHtml } from "../pia/publishHtml.js";
import { handleCandidates } from "../share/handle.js";
import type { PublicPageInput } from "../share/publicPages.js";
import type { Command, CommandContext } from "./registry.js";

/**
 * Collect a folder's top-level files as publishable pages. `index.md` /
 * `README.md` lead (like a home page), the rest follow alphabetically.
 * Subfolders are left out — one flat set keeps the model (and the URL) simple.
 * All files count, not just Markdown: opening the link drops them into the
 * recipient's `~/incoming`, where `cat`/`glow` read whatever they are.
 */
export function collectFolderPages(ctx: CommandContext, dirAbs: string): PublishedPage[] {
  const rank = (name: string): number => {
    const lower = name.toLowerCase();
    return lower === "index.md" ? 0 : lower === "readme.md" ? 1 : 2;
  };
  return ctx.vfs
    .list(dirAbs)
    .filter((entry) => entry.type === "file")
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .map((entry) => {
      const fileNode = ctx.vfs.getNode(ctx.vfs.resolve(dirAbs, entry.name));
      return {
        name: entry.name,
        content: fileNode && isFile(fileNode) ? fileNode.content : "",
      };
    });
}

/**
 * Turn a folder into a shareable `#p=` link, or return a reason it can't. Shared
 * by `publish` and `share <folder>` so both build the exact same link.
 */
export function folderLink(
  ctx: CommandContext,
  name: string,
): { url: string; count: number } | { error: string } {
  const dir = ctx.vfs.resolve(ctx.cwd, name);
  const node = ctx.vfs.getNode(dir);
  if (!node) return { error: `no such directory: ${name}` };
  if (!isDir(node)) return { error: `not a directory: ${name}` };

  const pages = collectFolderPages(ctx, dir);
  if (pages.length === 0) return { error: `no files in ${name}` };

  const title = dir.split("/").filter(Boolean).pop() ?? "folder";
  const payload = encodePublish({ title, pages });
  if (payload.length > MAX_PUBLISH_PAYLOAD) {
    return {
      error:
        `${name} is too large to fit in a link ` +
        `(${Math.round(payload.length / 1024)} KB > ${Math.round(MAX_PUBLISH_PAYLOAD / 1024)} KB). ` +
        "Share a smaller folder or fewer files.",
    };
  }
  return { url: `${ctx.baseUrl}#p=${payload}`, count: pages.length };
}

/** The special folder that publishes to the web — the Unix `~/public_html`
 *  (mod_userdir) idiom. Files here are served at `<origin>/~<handle>/…`. */
const PUBLIC_HTML = "~/public_html";

/**
 * The stored path for a published file, in step with how the Pages Function
 * reconstructs it from a URL (`<slug>.md`, empty slug → `index.md`). The route
 * hardcodes a lowercase `.md`, so the extension is lowercased here too; `index`
 * is normalised so `Index.md` still answers the bare `/~handle/`. The base name's
 * case is otherwise preserved — the URL slug carries it verbatim.
 */
function routablePath(name: string): string {
  const base = name.replace(/\.md$/i, "");
  return (base.toLowerCase() === "index" ? "index" : base) + ".md";
}

/** Collect the top-level `.md` files of `~/public_html` as pages to publish,
 *  `index.md` first (the home page) then the rest alphabetically. Only Markdown
 *  for now — the web view renders prose; other file types come later. */
function collectWebPages(ctx: CommandContext, dirAbs: string): PublicPageInput[] {
  const rank = (name: string): number => (name.toLowerCase() === "index.md" ? 0 : 1);
  return ctx.vfs
    .list(dirAbs)
    .filter((e) => e.type === "file" && /\.md$/i.test(e.name))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .map((e) => {
      const node = ctx.vfs.getNode(ctx.vfs.resolve(dirAbs, e.name));
      const content = node && isFile(node) ? node.content : "";
      return { path: routablePath(e.name), content, html: renderMarkdownHtml(content) };
    });
}

/**
 * Ensure the current account holds a `~handle`, claiming one lazily the first
 * time (never at signup — see `roadmap/publish-garden.md`). The candidate is
 * pre-filled from the display username; if taken, numbered fallbacks are tried
 * until one is free. Prints the claimed handle. Throws if publishing is off or
 * no free handle turns up.
 */
async function ensureHandle(ctx: CommandContext): Promise<string> {
  const store = ctx.handles;
  if (!store?.available()) throw new Error("publishing to the web needs an account — run `login` first");

  const existing = await store.mine();
  if (existing) return existing;

  let tries = 0;
  for (const candidate of handleCandidates(ctx.session.user)) {
    if (++tries > 30) break; // bound the numbered fallbacks
    if (!(await store.isAvailable(candidate))) continue;
    try {
      await store.claim(candidate);
      ctx.print(`claimed ~${candidate} as your public handle`, "dim");
      return candidate;
    } catch (e) {
      // A concurrent publish (another tab/device) may have claimed a handle for
      // this account meanwhile — reuse it rather than churning through numbered
      // fallbacks that would all fail with "you already publish as ~…".
      const now = await store.mine();
      if (now) return now;
      // Not a race for this *name* — a fatal condition (e.g. not logged in).
      // Surface it instead of retrying 30 unauthenticated calls.
      const message = e instanceof Error ? e.message : "";
      if (/not logged in|log in/i.test(message)) {
        throw new Error("publishing to the web needs an account — run `login` first");
      }
      // Otherwise the name was taken by someone else — try the next candidate.
    }
  }
  throw new Error("could not find a free handle — pick one and claim it manually");
}

/** Publish `~/public_html` to the web: render its Markdown to HTML and push it
 *  to the public projection, then print the tilde-URL. */
async function publishToWeb(ctx: CommandContext, dirAbs: string): Promise<void> {
  // Publishing to the web needs a logged-in cloud account. `available()` only
  // says the cloud is wired (it's true for a guest in a cloud build too), so
  // check the session itself — and check it *first*, before the folder, so a
  // guest gets the login hint rather than "make a folder".
  const loggedIn = ctx.handles?.available() && ctx.publicPages?.available() && (await ctx.auth.current());
  if (!loggedIn) {
    return ctx.error(
      "publish: publishing to the web needs an account — run `login` first\n" +
        "(any other folder still makes a portable link: `publish <folder>`)",
    );
  }

  const node = ctx.vfs.getNode(dirAbs);
  if (!node || !isDir(node)) {
    return ctx.error("publish: no ~/public_html yet — `mkdir ~/public_html`, then write pages in it");
  }

  const pages = collectWebPages(ctx, dirAbs);

  // Nothing to publish. If there's already a live site, an empty folder means
  // "take it all down" (the mirror promise) — clear it. Otherwise there's just
  // nothing to do, and claiming a handle for an empty site would be pointless.
  if (pages.length === 0) {
    const existing = await ctx.handles!.mine();
    if (existing) {
      let live;
      try {
        live = await ctx.publicPages!.list(existing);
      } catch (e) {
        return ctx.error(`publish: ${e instanceof Error ? e.message : "publish failed"}`);
      }
      if (live.length > 0) {
        try {
          await ctx.publicPages!.publish(existing, []);
        } catch (e) {
          return ctx.error(`publish: ${e instanceof Error ? e.message : "publish failed"}`);
        }
        ctx.print(
          `unpublished ${live.length} page${live.length === 1 ? "" : "s"} — ~${existing} is now empty`,
          "dim",
        );
        return;
      }
    }
    return ctx.error("publish: ~/public_html has no .md pages to publish");
  }

  // Two files that differ only by case or extension case (`post.md` vs
  // `post.MD`, `index.md` vs `Index.md`) normalise to one routable path — the
  // publish RPC would reject the whole batch. Catch it here with a clear message.
  const collision = pages.find((p, i) => pages.findIndex((q) => q.path === p.path) !== i);
  if (collision) {
    return ctx.error(
      `publish: two files map to the same page "${collision.path}" — ` +
        "rename one (names that differ only by case or .md/.MD collide)",
    );
  }

  let handle: string;
  try {
    handle = await ensureHandle(ctx);
  } catch (e) {
    return ctx.error(`publish: ${e instanceof Error ? e.message : "could not claim a handle"}`);
  }

  let count: number;
  try {
    count = await ctx.publicPages!.publish(handle, pages);
  } catch (e) {
    return ctx.error(`publish: ${e instanceof Error ? e.message : "publish failed"}`);
  }

  const base = `${new URL(ctx.baseUrl).origin}/~${handle}/`;
  ctx.print(`published ${count} page${count === 1 ? "" : "s"} to the web:`, "dim");
  ctx.print(base, "accent");
  for (const page of pages) {
    const slug = /^index\.md$/i.test(page.path) ? "" : page.path.replace(/\.md$/i, "");
    // Encode so a slug with spaces/non-ASCII prints a URL that resolves (the
    // route decodes it back to the stored filename).
    ctx.print(`  ${base}${encodeURIComponent(slug)}`, "dim");
  }
}

/**
 * `publish` — put your writing on the web. With no argument (or the folder
 * `~/public_html`) it publishes that folder as a public site at
 * `<origin>/~<handle>/`, the Unix `mod_userdir` idiom: publishing is writing a
 * file to a well-known place. Any *other* folder falls back to the original
 * self-contained `#p=` link (no server, works for guests), whose files land in
 * the opener's `~/incoming` (see `pia/incoming.ts`). Both are accepted web
 * divergences — `publish` has always returned a URL.
 */
export const publish: Command = {
  name: "publish",
  help: "publish ~/public_html to the web, or `publish <folder>` for a portable link",
  usage: "publish [folder]",
  async run(args, ctx) {
    const name = args[0];
    const publicHtml = ctx.vfs.resolve(ctx.cwd, PUBLIC_HTML);
    const target = name ? ctx.vfs.resolve(ctx.cwd, name) : publicHtml;

    // No arg, or explicitly ~/public_html → publish to the web.
    if (target === publicHtml) {
      return publishToWeb(ctx, publicHtml);
    }

    // Any other folder → the portable, serverless #p= link.
    const result = folderLink(ctx, name);
    if ("error" in result) return ctx.error(`publish: ${result.error}`);
    ctx.print(result.url, "accent");
    ctx.print(
      `(${result.count} file${result.count === 1 ? "" : "s"} — open the link to receive them)`,
      "dim",
    );
  },
};

export const publishCommands: Command[] = [publish];
