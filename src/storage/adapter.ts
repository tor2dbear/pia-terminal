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
  /** Persist the root tree. */
  save(root: DirNode): Promise<void>;
}
