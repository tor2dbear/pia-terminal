import type { SupabaseLike } from "./client.js";
import type {
  PublicPage,
  PublicPageInput,
  PublicPagesStore,
} from "../share/publicPages.js";

interface Result<T> {
  data: T;
  error: { message: string } | null;
}

/** A `public_pages` row as PostgREST returns it. */
interface PageRow {
  path: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/**
 * The slice of the Supabase client the projection touches: the `publish_pages`
 * RPC (the only write path) and a select on `public_pages` for reads. Cast to at
 * construction.
 */
interface PagesClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Result<unknown>>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<Result<PageRow[] | null>>;
    };
  };
}

const TABLE = "public_pages";

/**
 * Cloud-backed published-pages projection. Publishing goes through the
 * `publish_pages` SECURITY DEFINER RPC, which does the whole replace-all in one
 * transaction — verifies the caller owns the handle, upserts the given pages
 * (preserving `created_at`), and deletes the ones no longer present. Doing it
 * server-side keeps it atomic (concurrent publishes can't interleave into a
 * half-empty site) and closes the direct-write hole where an UPDATE couldn't
 * re-check handle ownership (see `supabase/public_pages.sql`). Reads are a plain
 * anon-readable select — that's what the Pages Function serves.
 */
export class SupabasePublicPagesStore implements PublicPagesStore {
  private readonly db: PagesClient;

  constructor(client: SupabaseLike) {
    this.db = client as unknown as PagesClient;
  }

  available(): boolean {
    return true;
  }

  async publish(handle: string, pages: PublicPageInput[]): Promise<number> {
    const { data, error } = await this.db.rpc("publish_pages", {
      p_handle: handle,
      p_pages: pages.map((p) => ({ path: p.path, content: p.content })),
    });
    if (error) throw new Error(error.message);
    return Number(data ?? pages.length);
  }

  async list(handle: string): Promise<PublicPage[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select("path,content,created_at,updated_at")
      .eq("handle", handle);
    if (error) throw new Error(error.message);
    return ((data as PageRow[] | null) ?? [])
      .map((r) => ({
        path: r.path,
        content: r.content,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
