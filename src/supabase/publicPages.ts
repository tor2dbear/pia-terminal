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
  html: string;
  created_at: string;
  updated_at: string;
}

/** The row we write (owner + handle + payload; timestamps are DB-managed). */
interface WriteRow {
  owner: string;
  handle: string;
  path: string;
  content: string;
  html: string;
}

/**
 * The slice of the Supabase client the projection touches: an upsert, a
 * scoped delete, and a select on `public_pages`. Cast to at construction.
 */
interface PagesClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
  from(table: string): {
    upsert(rows: WriteRow[], opts: { onConflict: string }): PromiseLike<Result<unknown>>;
    delete(): {
      eq(column: string, value: string): {
        in(column: string, values: string[]): PromiseLike<Result<unknown>>;
      };
    };
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<Result<PageRow[] | null>>;
    };
  };
}

const TABLE = "public_pages";

/**
 * Cloud-backed published-pages projection. Publishing is replace-all: upsert the
 * pages present (an upsert that omits `created_at`, so the DB keeps the original
 * on a republish) and delete the paths no longer there. RLS makes the rows
 * anon-readable (the Pages Function serves them) and owner-writable — the owner
 * must also own the handle, enforced by the insert policy (see the SQL).
 */
export class SupabasePublicPagesStore implements PublicPagesStore {
  private readonly db: PagesClient;

  constructor(client: SupabaseLike) {
    this.db = client as unknown as PagesClient;
  }

  available(): boolean {
    return true;
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  async publish(handle: string, pages: PublicPageInput[]): Promise<number> {
    const uid = await this.uid();
    if (!uid) throw new Error("publishing needs an account — run `login` first");

    if (pages.length > 0) {
      const rows: WriteRow[] = pages.map((p) => ({
        owner: uid,
        handle,
        path: p.path,
        content: p.content,
        html: p.html,
      }));
      const { error } = await this.db.from(TABLE).upsert(rows, { onConflict: "handle,path" });
      if (error) throw new Error(error.message);
    }

    // Remove the pages that are no longer part of the folder. Delete only the
    // truly-absent paths (by exact list, so the SDK escapes them) rather than a
    // hand-built `not in` filter — publishing an empty folder still clears all.
    const live = await this.list(handle);
    const keep = new Set(pages.map((p) => p.path));
    const removed = live.filter((p) => !keep.has(p.path)).map((p) => p.path);
    if (removed.length > 0) {
      const { error } = await this.db.from(TABLE).delete().eq("handle", handle).in("path", removed);
      if (error) throw new Error(error.message);
    }

    return pages.length;
  }

  async list(handle: string): Promise<PublicPage[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select("path,content,html,created_at,updated_at")
      .eq("handle", handle);
    if (error) throw new Error(error.message);
    return ((data as PageRow[] | null) ?? [])
      .map((r) => ({
        path: r.path,
        content: r.content,
        html: r.html,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
