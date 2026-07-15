export interface CloudConfig {
  url: string;
  anonKey: string;
}

/**
 * The Supabase config, read from build-time env vars, or null when unset.
 * Null keeps PIA fully local (guest + localStorage) — the cloud path stays
 * dormant until both vars are provided.
 */
export const cloudConfig: CloudConfig | null =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? {
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      }
    : null;
