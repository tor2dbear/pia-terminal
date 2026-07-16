import type { VFS } from "../vfs/vfs.js";
import type { ShareStore } from "./store.js";
import { kindOf } from "./kind.js";

/**
 * Drop any memberships not yet placed in the tree into a `~/shared/` inbox as
 * real, linked files — so files shared *with* you show up alongside your own
 * (in `ls`, `cat`, `nano`, `mv`) instead of only in the `shared` command. Runs
 * at boot; idempotent (already-linked memberships are skipped). Returns how many
 * files it placed.
 */
export async function materializeShared(
  vfs: VFS,
  share: ShareStore | undefined,
): Promise<number> {
  if (!share?.available()) return 0;
  let items;
  try {
    items = await share.mine();
  } catch {
    return 0; // offline / transient
  }

  const linked = vfs.linkedShareIds();
  const dir = `${vfs.home}/shared`;
  let placed = 0;

  for (const item of items) {
    if (linked.has(item.id)) continue; // already somewhere in the tree
    // Give a checklist a `.list` name so it lands as a list file.
    const name =
      kindOf(item.name, item.content) === "list" && !/\.list$/i.test(item.name)
        ? `${item.name}.list`
        : item.name;
    const path = `${dir}/${name}`;
    if (vfs.getNode(path)) continue; // don't clobber something already there

    vfs.mkdirp(dir);
    vfs.writeFile(path, item.content); // cache the content
    vfs.link(path, item.id); // and link it to the cloud object
    placed++;
  }
  return placed;
}
