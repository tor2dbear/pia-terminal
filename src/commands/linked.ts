import type { CommandContext } from "./registry.js";

/**
 * Helpers for files that are *linked* to a cloud shared object (they carry a
 * `shareId`). The file stays where it lives in the tree; its content is a local
 * cache, and reads/writes go through the share backend. These keep the cache
 * and the cloud in step so `nano`/`todo`/`cat` can treat a linked file almost
 * like a local one.
 */

/** A linked file's freshest content — the cloud copy, or the cache if offline. */
export async function linkedContent(
  ctx: CommandContext,
  shareId: string,
  cache: string,
): Promise<string> {
  try {
    const fresh = await ctx.share?.get(shareId);
    if (fresh) return fresh.content;
  } catch {
    /* offline / transient — fall back to the cache */
  }
  return cache;
}

/** A save function for a linked file: write to the cloud, then refresh the cache. */
export function linkedSave(
  ctx: CommandContext,
  path: string,
  shareId: string,
): (text: string) => Promise<void> {
  return async (text) => {
    await ctx.share?.save(shareId, text);
    ctx.vfs.writeFile(path, text); // refresh the cache (writeFile keeps the link)
    await ctx.persist();
  };
}

/** Subscribe to a linked file's cloud changes; returns an unsubscribe (or none). */
export function linkedSubscribe(
  ctx: CommandContext,
  shareId: string,
  onChange: (content: string) => void,
): (() => void) | undefined {
  return ctx.share?.subscribe?.(shareId, onChange);
}
