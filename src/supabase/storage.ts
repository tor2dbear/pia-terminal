import type { DirNode } from "../vfs/types.js";
import { StorageConflictError, type StorageAdapter } from "../storage/adapter.js";
import type { SupabaseLike } from "./client.js";

const TABLE = "filesystems";

const emptyTree = (): DirNode => ({ type: "dir", name: "", children: {} });

/**
 * Persists the whole filesystem tree as a single `jsonb` row per user. Row-Level
 * Security in the database restricts each row to its owner, so a guest (no
 * session) simply has nothing to read or write here.
 *
 * Writes are optimistic-concurrency guarded: every row carries an `updated_at`
 * (bumped by a trigger on each write), which we remember at load and require to
 * still match at save. If it moved, another device wrote since we loaded — we
 * refuse to overwrite and raise {@link StorageConflictError} carrying the newer
 * remote tree, so the caller can reconcile instead of silently eating changes.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  /** The row's `updated_at` as of our last successful load/save — the token we
   *  guard writes against. null means "no row seen yet" (a brand-new user). */
  private baseVersion: string | null = null;

  constructor(private readonly client: SupabaseLike) {}

  async load(): Promise<DirNode | null> {
    const uid = await this.uid();
    if (!uid) return null;
    const row = await this.fetchRow(uid);
    this.baseVersion = row?.updated_at ?? null;
    return row?.tree ?? null;
  }

  async save(root: DirNode): Promise<void> {
    const uid = await this.uid();
    if (!uid) return; // guest — cloud has nothing to persist

    if (this.baseVersion === null) {
      // No row seen yet → create one. If a row already exists, another device
      // beat us to it: that's a conflict to reconcile, not an overwrite.
      const { data, error } = await this.client
        .from(TABLE)
        .insert({ user_id: uid, tree: root })
        .select("updated_at")
        .maybeSingle();
      if (error) {
        await this.raiseIfConflict(uid);
        throw new Error(error.message);
      }
      this.baseVersion = data?.updated_at ?? null;
      return;
    }

    // Guarded update: overwrite only the exact row we last read. A zero row
    // count means `updated_at` moved under us — someone else wrote. The trigger
    // bumps `updated_at`; we read the new value back to re-sync for next time.
    const { data, error } = await this.client
      .from(TABLE)
      .update({ tree: root })
      .match({ user_id: uid, updated_at: this.baseVersion })
      .select("updated_at");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      await this.raiseIfConflict(uid);
      // No row and no differing remote row → the row vanished (e.g. account
      // deleted). Reset so a subsequent save re-creates it rather than looping.
      this.baseVersion = null;
      return;
    }
    this.baseVersion = data[0].updated_at;
  }

  /** Fetch the current row, adopt its version as our base (so a follow-up save
   *  lands), and throw a conflict carrying its tree. No-op if no row exists. */
  private async raiseIfConflict(uid: string): Promise<void> {
    const row = await this.fetchRow(uid);
    if (!row) return;
    this.baseVersion = row.updated_at;
    throw new StorageConflictError(row.tree ?? emptyTree());
  }

  private async fetchRow(
    uid: string,
  ): Promise<{ tree: DirNode; updated_at: string } | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("tree, updated_at")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  }

  private async uid(): Promise<string | null> {
    // Read the id from the locally-stored session (no network) so a flaky
    // getUser() request can never make load() spuriously return null — which
    // would otherwise be mistaken for "new user" and clobber saved files.
    const { data } = await this.client.auth.getSession();
    return data.session?.user?.id ?? null;
  }
}
