/**
 * Best-effort lookup of a brew package's real gzip chunk size.
 *
 * The sizes are emitted at build time as `package-sizes.json` (see the
 * packageSizes plugin in vite.config.ts) and fetched once, same-origin — PIA's
 * CSP allows `connect-src 'self'`, the same lane `ping` uses. Only the
 * production build carries the manifest, so outside it (a dev server, a test, a
 * bare `tsc`) we don't even try. Any miss — no manifest, an older deploy, a
 * fetch failure — returns null, and the caller simply omits the size rather than
 * inventing one (the honest-or-nothing spirit of `ping`).
 */

let cache: Promise<Record<string, number> | null> | undefined;

function load(baseUrl: string): Promise<Record<string, number> | null> {
  cache ??= (async () => {
    // The manifest is a production build artifact; nothing to fetch otherwise.
    if (!import.meta.env?.PROD) return null;
    try {
      const res = await fetch(new URL("package-sizes.json", baseUrl), { cache: "no-store" });
      return res.ok ? ((await res.json()) as Record<string, number>) : null;
    } catch {
      return null;
    }
  })();
  return cache;
}

/** A package's real gzip size in bytes, or null when it can't be known honestly. */
export async function packageGzipSize(name: string, baseUrl: string): Promise<number | null> {
  return (await load(baseUrl))?.[name] ?? null;
}

/** Human-friendly size in the build's own style ("8.6 kB", "512 B"). */
export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}
