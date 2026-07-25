import type { DirNode } from "../vfs/types.js";

/**
 * Persistence contract for the filesystem tree.
 *
 * Deliberately async so that swapping the local implementation for a backend
 * (ApiAdapter) is a change of implementation, not of every call site. The
 * terminal awaits {@link load} once at boot and calls {@link save} after
 * mutations.
 */
export interface StorageAdapter {
  /** Return the persisted root, or null if nothing has been saved yet. */
  load(): Promise<DirNode | null>;
  /**
   * Persist the root tree. May reject with {@link StorageConflictError} when the
   * backing store changed since this client last loaded — so the caller can
   * reconcile instead of the store silently overwriting a concurrent write.
   */
  save(root: DirNode): Promise<void>;
}

/**
 * Thrown by {@link StorageAdapter.save} when the backing store moved since this
 * client last loaded it — another device or tab wrote in the meantime, so an
 * unconditional overwrite would silently eat their changes. Carries the current
 * remote tree so the caller can adopt it and set the local version aside rather
 * than clobber. Local adapters (single writer) never throw this.
 */
export class StorageConflictError extends Error {
  constructor(readonly remoteTree: DirNode) {
    super("filesystem changed on another device");
    this.name = "StorageConflictError";
  }
}
