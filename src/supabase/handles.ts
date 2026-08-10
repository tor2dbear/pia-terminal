import type { SupabaseLike } from "./client.js";
import type { HandleStore } from "../share/handleStore.js";
import { validateHandle } from "../share/handle.js";

interface Result<T> {
  data: T;
  error: { message: string } | null;
}

/** A `handles` row as PostgREST returns it. */
interface HandleRow {
  handle: string;
}

/**
 * The slice of the Supabase client the handle store touches: the `claim_handle`
 * RPC plus a couple of reads of the (public-readable) `handles` table. Cast to
 * at construction, the same narrow-interface trick the other adapters use.
 */
interface HandleClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Result<unknown>>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<Result<HandleRow | null>>;
      };
    };
  };
}

const TABLE = "handles";

/**
 * Cloud-backed handle namespace. Reads of the `handles` table go straight
 * through PostgREST (RLS makes it public-readable so the route can resolve
 * `~<handle>`); the one write — claiming — goes through the `claim_handle`
 * SECURITY DEFINER RPC, which enforces the reserved-word denylist, the
 * one-identity rule, and race-safe uniqueness (see `supabase/public_pages.sql`).
 */
export class SupabaseHandleStore implements HandleStore {
  private readonly db: HandleClient;

  constructor(client: SupabaseLike) {
    this.db = client as unknown as HandleClient;
  }

  available(): boolean {
    return true;
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  async mine(): Promise<string | null> {
    const uid = await this.uid();
    if (!uid) return null;
    const { data, error } = await this.db
      .from(TABLE)
      .select("handle")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.handle ?? null;
  }

  async isAvailable(handle: string): Promise<boolean> {
    const h = handle.toLowerCase();
    if (!validateHandle(h).ok) return false;
    const { data, error } = await this.db
      .from(TABLE)
      .select("handle")
      .eq("handle", h)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data === null;
  }

  async claim(handle: string): Promise<void> {
    // Fail fast on the client for a malformed name, so an obvious mistake never
    // makes a round trip. The server re-checks (charset CHECK + reserved-word
    // guard) — it's the real boundary; this is just courtesy.
    const check = validateHandle(handle.toLowerCase());
    if (!check.ok) throw new Error(`invalid handle: ${check.reason}`);
    const { error } = await this.db.rpc("claim_handle", { p_handle: handle });
    if (error) throw new Error(error.message);
  }
}
