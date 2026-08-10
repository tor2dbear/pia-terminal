/**
 * The published-pages projection behind the adapter seam — the storage that a
 * `~/public_html` publish COPIES into, kept out of the private `filesystems`
 * blob so a policy slip can't leak a private file (see
 * `roadmap/publish-garden.md`). The terminal's `publish` command talks only to
 * this interface; guests get {@link NullPublicPagesStore}, tests get
 * {@link MemoryPublicPagesStore}, cloud users get the Supabase implementation (a
 * `public_pages` table read by the Cloudflare Pages Function as anon).
 *
 * Publishing is REPLACE-ALL: a publish makes the live set under a handle exactly
 * the pages handed in — present paths upserted, absent ones removed — because
 * the `~/public_html` folder is the source of truth. `createdAt` survives a
 * republish; only `updatedAt` moves.
 *
 * Only the Markdown *source* is stored — never rendered HTML. Rendering happens
 * at the serving boundary (the Pages Function), so a hand-crafted RPC call can't
 * smuggle arbitrary markup onto a PIA origin by supplying its own HTML.
 */

/** A page as handed to {@link PublicPagesStore.publish}: its path and Markdown
 *  source. */
export interface PublicPageInput {
  path: string;
  content: string;
}

/** A stored page, with the timestamps the projection keeps. */
export interface PublicPage extends PublicPageInput {
  createdAt: string;
  updatedAt: string;
}

export interface PublicPagesStore {
  /** Whether a real backend is wired (a cloud account). Guests: false. */
  available(): boolean;
  /**
   * Make the live set under `handle` exactly `pages`: upsert the ones present
   * (preserving each page's `createdAt`), delete the ones absent. Resolves to
   * the number of pages now live.
   */
  publish(handle: string, pages: PublicPageInput[]): Promise<number>;
  /** The pages currently live under `handle`. */
  list(handle: string): Promise<PublicPage[]>;
}

/** No publishing: the guest build with no cloud backend. */
export class NullPublicPagesStore implements PublicPagesStore {
  available(): boolean {
    return false;
  }
  async publish(): Promise<number> {
    throw new Error("publishing needs an account — run `login` first");
  }
  async list(): Promise<PublicPage[]> {
    return [];
  }
}

/** Per-handle backing: handle → (path → page). A monotonic `tick` stands in for
 *  timestamps so tests stay deterministic without touching the clock. */
export interface PublicPagesBacking {
  pages: Map<string, Map<string, PublicPage>>;
  tick: number;
}

/** In-memory PublicPagesStore for tests. Models the replace-all + createdAt-
 *  preserving semantics the Supabase implementation enforces. */
export class MemoryPublicPagesStore implements PublicPagesStore {
  static backing(): PublicPagesBacking {
    return { pages: new Map(), tick: 0 };
  }

  constructor(private readonly db: PublicPagesBacking = MemoryPublicPagesStore.backing()) {}

  available(): boolean {
    return true;
  }

  private stamp(): string {
    return String(++this.db.tick);
  }

  async publish(handle: string, pages: PublicPageInput[]): Promise<number> {
    const prev = this.db.pages.get(handle) ?? new Map<string, PublicPage>();
    const next = new Map<string, PublicPage>();
    for (const page of pages) {
      const existing = prev.get(page.path);
      next.set(page.path, {
        path: page.path,
        content: page.content,
        createdAt: existing?.createdAt ?? this.stamp(),
        updatedAt: this.stamp(),
      });
    }
    this.db.pages.set(handle, next);
    return next.size;
  }

  async list(handle: string): Promise<PublicPage[]> {
    return [...(this.db.pages.get(handle)?.values() ?? [])]
      .map((p) => ({ ...p }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
