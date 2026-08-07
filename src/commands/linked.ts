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

/**
 * Would leaving/removing this shared list leave it ownerless? True only when the
 * caller is its *sole* owner and other members remain — the case the leave guard
 * refuses (there's no one to promote until ownership transfer, a later step). So
 * `rm` can reject *before* mutating rather than delete locally, fail to leave,
 * and have the list reappear. Best-effort: an offline/failed lookup returns
 * false so `rm` falls back to its best-effort leave (the server still gates).
 */
export async function wouldOrphanShare(ctx: CommandContext, shareId: string): Promise<boolean> {
  try {
    const my = (await ctx.share?.mine())?.find((l) => l.id === shareId);
    if (my?.role !== "owner") return false; // not the owner → leaving is always fine
    const joined = ((await ctx.share?.members(shareId)) ?? []).filter(
      (m) => m.status === "member",
    );
    const owners = joined.filter((m) => m.role === "owner");
    return joined.length > 1 && owners.length <= 1;
  } catch {
    return false;
  }
}

/** Subscribe to a linked file's cloud changes; returns an unsubscribe (or none). */
export function linkedSubscribe(
  ctx: CommandContext,
  shareId: string,
  onChange: (content: string) => void,
): (() => void) | undefined {
  return ctx.share?.subscribe?.(shareId, onChange);
}
