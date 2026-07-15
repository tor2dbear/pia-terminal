import type { DirNode } from "../vfs/types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { SupabaseLike } from "./client.js";

/**
 * Routes persistence by auth state: a guest's files stay in localStorage, while
 * a logged-in user's files live in the cloud (and follow them between devices).
 */
export class HybridStorageAdapter implements StorageAdapter {
  constructor(
    private readonly local: StorageAdapter,
    private readonly cloud: StorageAdapter,
    private readonly client: SupabaseLike,
  ) {}

  async load(): Promise<DirNode | null> {
    return (await this.authed()) ? this.cloud.load() : this.local.load();
  }

  async save(root: DirNode): Promise<void> {
    if (await this.authed()) await this.cloud.save(root);
    else await this.local.save(root);
  }

  private async authed(): Promise<boolean> {
    const { data } = await this.client.auth.getSession();
    return data.session !== null;
  }
}
