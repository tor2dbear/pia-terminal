import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "../commands/index.js";
import { Terminal } from "../terminal/terminal.js";
import { piaExtendContext } from "./context.js";
import type { PublishedSite } from "../share/publish.js";

/**
 * Open a published folder (decoded from a `#p=` URL) as a real PIA terminal
 * rather than a rendered web page — so a shared link *is* a little computer you
 * poke at, the same idiom as `share <file>`. The folder's files are mounted in a
 * fresh, ephemeral home (nothing persists — a refresh gives a clean copy), a
 * short banner explains it, and `ls` runs so the files are visible at once.
 */
export async function bootPublishedSession(
  root: HTMLElement,
  site: PublishedSite,
): Promise<Terminal> {
  // A clean tree with just the published files — no default welcome file, so
  // `ls` shows exactly what was published and nothing else.
  const vfs = new VFS({ type: "dir", name: "", children: {} });
  vfs.mkdirp(vfs.home);
  for (const page of site.pages) {
    vfs.writeFile(`${vfs.home}/${page.name}`, page.content);
  }

  const term = new Terminal(root, {
    vfs,
    // In-memory + fake auth: the whole session is a throwaway sandbox.
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
  });

  const n = site.pages.length;
  term.print(`published folder: ${site.title}`, "accent");
  term.print(
    `${n} file${n === 1 ? "" : "s"} · a throwaway sandbox — nothing you do here is saved`,
    "dim",
  );
  term.print("look around: `ls` · read: `cat <file>` · render markdown: `glow <file>`", "dim");
  term.print();
  await term.exec("ls");
  return term;
}
