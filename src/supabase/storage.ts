import type { DirNode } from "../vfs/types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { SupabaseLike } from "./client.js";

const TABLE = "filesystems";

/**
 * Persists the whole filesystem tree as a single `jsonb` row per user. Row-Level
 * Security in the database restricts each row to its owner, so a guest (no
 * session) simply has nothing to read or write here.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(private readonly client: SupabaseLike) {}

  async load(): Promise<DirNode | null> {
    const uid = await this.uid();
    if (!uid) return null;
    const { data, error } = await this.client
      .from(TABLE)
      .select("tree")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.tree ?? null;
  }

  async save(root: DirNode): Promise<void> {
    const uid = await this.uid();
    if (!uid) return; // guest — cloud has nothing to persist
    const { error } = await this.client
      .from(TABLE)
      .upsert({ user_id: uid, tree: root });
    if (error) throw new Error(error.message);
  }

  private async uid(): Promise<string | null> {
    // Read the id from the locally-stored session (no network) so a flaky
    // getUser() request can never make load() spuriously return null — which
    // would otherwise be mistaken for "new user" and clobber saved files.
    const { data } = await this.client.auth.getSession();
    return data.session?.user?.id ?? null;
  }
}
