import type { VFS } from "../vfs/vfs.js";
import { parseShareHash } from "../share/share.js";
import { parsePublishHash, type PublishedPage } from "../share/publish.js";

/**
 * Content that arrived via a share/publish link (`#s=` or `#p=`), normalized to
 * one shape. A shared *file* is `folder: null` with one entry; a published
 * *folder* carries the folder name so it can land in its own subfolder.
 */
export interface Incoming {
  folder: string | null;
  files: PublishedPage[];
}

/** Read an incoming payload from a URL hash — either the `#p=` (folder) or the
 * older `#s=` (single file) form. Null if the hash carries neither. */
export function parseIncoming(hash: string): Incoming | null {
  const site = parsePublishHash(hash);
  if (site) return { folder: site.title, files: site.pages };
  const file = parseShareHash(hash);
  if (file) return { folder: null, files: [{ name: file.name, content: file.content }] };
  return null;
}

/**
 * Drop incoming files into `~/incoming` (a scratch inbox) in the current
 * session, in memory only — the caller does NOT persist, so opening a link
 * never silently writes to your account. You keep what you want with `cp`.
 * Returns the directory the files landed in.
 */
export function materializeIncoming(vfs: VFS, incoming: Incoming): string {
  const base = `${vfs.home}/incoming${incoming.folder ? `/${incoming.folder}` : ""}`;
  vfs.mkdirp(base);
  for (const file of incoming.files) {
    vfs.writeFile(`${base}/${file.name}`, file.content);
  }
  return base;
}
