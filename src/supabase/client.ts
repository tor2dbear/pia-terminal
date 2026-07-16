import type { DirNode } from "../vfs/types.js";
import type { CloudConfig } from "../config.js";

/**
 * The narrow slice of the Supabase client this app uses. Depending on this
 * (rather than the full generated types) keeps the adapters simple and makes
 * them trivial to stub in tests.
 */
interface AuthUser {
  id: string;
  email: string | null;
  user_metadata?: { username?: string };
}

export interface SupabaseLike {
  auth: {
    getUser(): Promise<{ data: { user: AuthUser | null } }>;
    getSession(): Promise<{ data: { session: { user: AuthUser } | null } }>;
    signInWithPassword(c: { email: string; password: string }): Promise<{
      data: { user: AuthUser | null };
      error: { message: string } | null;
    }>;
    signInWithOtp(c: {
      email: string;
      options?: { shouldCreateUser?: boolean; emailRedirectTo?: string };
    }): Promise<{ error: { message: string } | null }>;
    signUp(c: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }): Promise<{
      data: { user: AuthUser | null };
      error: { message: string } | null;
    }>;
    updateUser(attrs: { data?: Record<string, unknown> }): Promise<{
      error: { message: string } | null;
    }>;
    signOut(): Promise<{ error: { message: string } | null }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { tree: DirNode } | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert(row: Record<string, unknown>): Promise<{
      error: { message: string } | null;
    }>;
  };
}

/**
 * Create a Supabase client. The `@supabase/supabase-js` module is loaded via a
 * dynamic import so it is code-split into its own chunk — the base bundle stays
 * lean, and the chunk only loads when cloud is configured.
 */
export async function createSupabase(config: CloudConfig): Promise<SupabaseLike> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  }) as unknown as SupabaseLike;
}
