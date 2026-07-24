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

/** App metadata, injected from package.json at build time (see vite.config). */
declare const __PIA_VERSION__: string;
declare const __PIA_REPO_URL__: string;
declare const __PIA_HOMEPAGE__: string;
declare const __PIA_NPM_URL__: string;

/** Raw text imports (`import s from "./x.md?raw"`). */
declare module "*.md?raw" {
  const content: string;
  export default content;
}
