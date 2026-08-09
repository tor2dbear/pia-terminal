import {
  generateToken,
  hashToken,
  type TokenInfo,
  type TokenStore,
} from "../mcp/tokens.js";
import type { SupabaseLike } from "./client.js";

/** Result envelope shared by supabase-js query/command builders. */
interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

interface TokenRow {
  label: string;
  created_at: string;
  last_used_at: string | null;
}

/** A chainable, awaitable filter builder — the slice of supabase-js we use. */
interface Filter<T> extends Promise<Result<T[]>> {
  eq(column: string, value: string): Filter<T>;
  order(column: string, opts?: { ascending?: boolean }): Filter<T>;
}

interface Table {
  select(columns: string): Filter<TokenRow>;
  insert(row: Record<string, unknown>): Promise<Result<unknown>>;
  delete(): { eq(column: string, value: string): { select(columns: string): Promise<Result<unknown[]>> } };
}

interface TokenClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  from(table: string): Table;
}

/**
 * The cloud token store: rows in `public.mcp_tokens`, one per minted token, with
 * only the SHA-256 hash persisted. RLS keeps each user to their own rows; the
 * `mcp` Edge Function (service role) is what looks a presented token up and acts
 * as its owner. See `supabase/mcp.sql`.
 */
export class SupabaseTokenStore implements TokenStore {
  private readonly db: TokenClient;

  // Same narrow-interface trick the other adapters use: accept the shared client
  // type, then treat it as the slice this store needs. `supabaseUrl` is the
  // project origin, from which the connector endpoint is derived.
  constructor(
    client: SupabaseLike,
    private readonly supabaseUrl: string,
  ) {
    this.db = client as unknown as TokenClient;
  }

  available(): boolean {
    return true;
  }

  connectorUrl(): string | null {
    return `${this.supabaseUrl.replace(/\/$/, "")}/functions/v1/mcp`;
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.db.auth.getUser();
    return data.user?.id ?? null;
  }

  async create(label: string): Promise<string> {
    const uid = await this.uid();
    if (!uid) throw new Error("log in to mint a token (run `login`)");
    const token = generateToken();
    const { error } = await this.db.from("mcp_tokens").insert({
      user_id: uid,
      label,
      token_hash: await hashToken(token),
    });
    if (error) {
      // The (user_id, label) unique constraint turns a duplicate into a clear
      // message rather than a raw Postgres error.
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error(`a token named "${label}" already exists — revoke it first`);
      }
      throw new Error(error.message);
    }
    return token;
  }

  async list(): Promise<TokenInfo[]> {
    const { data, error } = await this.db
      .from("mcp_tokens")
      .select("label, created_at, last_used_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      label: r.label,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at ?? undefined,
    }));
  }

  async revoke(label: string): Promise<boolean> {
    // RLS already scopes deletes to auth.uid(); matching the label removes just
    // this one. `select` returns the deleted rows so we can report whether one
    // actually matched.
    const { data, error } = await this.db
      .from("mcp_tokens")
      .delete()
      .eq("label", label)
      .select("label");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }
}
