import type { DirNode } from "../vfs/types.js";
import type { StorageAdapter } from "./adapter.js";

const KEY = "vera:fs:v1";

/** Persists the filesystem tree to the browser's localStorage. */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private key: string = KEY) {}

  async load(): Promise<DirNode | null> {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DirNode;
    } catch {
      // Corrupt payload: treat as empty rather than wedging boot.
      return null;
    }
  }

  async save(root: DirNode): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(root));
  }
}

/** In-memory adapter — handy for tests and SSR/no-storage environments. */
export class MemoryStorageAdapter implements StorageAdapter {
  private data: DirNode | null = null;

  async load(): Promise<DirNode | null> {
    return this.data;
  }

  async save(root: DirNode): Promise<void> {
    this.data = JSON.parse(JSON.stringify(root)) as DirNode;
  }
}
