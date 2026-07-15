/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent → cloud features stay dormant. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key (safe to be public; RLS protects the data). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
