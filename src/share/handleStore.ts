/**
 * The handle namespace behind the adapter seam — the storage half of the
 * `~user` story whose pure rules live in `handle.ts`. It mirrors how
 * {@link ShareStore} sits behind collaboration: the terminal and the `publish`
 * command talk only to this interface. Guests get {@link NullHandleStore}, tests
 * get {@link MemoryHandleStore}, logged-in cloud users get the Supabase
 * implementation (a `handles` table with a unique constraint — the thing account
 * metadata can't give us).
 *
 * A handle is claimed *lazily*, the first time you publish — never at signup
 * (see `roadmap/publish-garden.md`). Uniqueness is enforced here, atomically:
 * two people racing for the same name, exactly one wins.
 */

import { validateHandle } from "./handle.js";

export interface HandleStore {
  /** Whether a real backend is wired (a cloud account). Guests: false. */
  available(): boolean;
  /** The current user's claimed handle, or null if they haven't claimed one. */
  mine(): Promise<string | null>;
  /** Whether `handle` is free to claim: valid *and* not already taken. A
   *  malformed or reserved name is never available. */
  isAvailable(handle: string): Promise<boolean>;
  /**
   * Reserve `handle` for the current user, atomically. Idempotent if they
   * already hold exactly this handle. Throws if: the name is invalid/reserved,
   * it's taken by someone else, or the caller already holds a *different* handle
   * (one identity — renaming is a separate, later path).
   */
  claim(handle: string): Promise<void>;
}

/** No handle namespace: the guest build with no cloud backend. */
export class NullHandleStore implements HandleStore {
  available(): boolean {
    return false;
  }
  async mine(): Promise<string | null> {
    return null;
  }
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async claim(): Promise<void> {
    throw new Error("publishing needs an account — run `login` first");
  }
}

/** Shared backing so two {@link MemoryHandleStore} instances (two users) can
 *  contend for the same namespace in a test. */
export interface HandleBacking {
  /** handle (lowercased) → owner key. The unique index, in miniature. */
  byHandle: Map<string, string>;
  /** owner key → their handle. The one-identity invariant, reverse side. */
  byUser: Map<string, string>;
}

/**
 * In-memory HandleStore for tests. Each instance acts as one user (keyed by
 * {@link userKey}) over a shared backing, so a test can hand two instances the
 * same backing and watch a claim race resolve to a single winner — the same
 * gate the Supabase unique constraint enforces in production.
 */
export class MemoryHandleStore implements HandleStore {
  static backing(): HandleBacking {
    return { byHandle: new Map(), byUser: new Map() };
  }

  constructor(
    public userKey: string,
    private readonly db: HandleBacking = MemoryHandleStore.backing(),
  ) {}

  available(): boolean {
    return true;
  }

  async mine(): Promise<string | null> {
    return this.db.byUser.get(this.userKey) ?? null;
  }

  async isAvailable(handle: string): Promise<boolean> {
    const h = handle.toLowerCase();
    if (!validateHandle(h).ok) return false;
    return !this.db.byHandle.has(h);
  }

  async claim(handle: string): Promise<void> {
    const h = handle.toLowerCase();
    const check = validateHandle(h);
    if (!check.ok) throw new Error(`invalid handle: ${check.reason}`);

    const existing = this.db.byUser.get(this.userKey);
    if (existing) {
      if (existing === h) return; // idempotent re-claim of the same handle
      throw new Error(`you already publish as ~${existing}`);
    }

    const owner = this.db.byHandle.get(h);
    if (owner && owner !== this.userKey) throw new Error(`~${h} is taken`);

    this.db.byHandle.set(h, this.userKey);
    this.db.byUser.set(this.userKey, h);
  }
}
