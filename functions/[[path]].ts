// Cloudflare Pages Function: serve published ~/public_html pages.
//
// The web-native "publish to the world" path (roadmap/publish-garden.md): the
// `publish` command copies rendered pages into the public_pages table, and this
// Function serves them at PIA's own origin under the Unix mod_userdir idiom —
// `pia.tor2dbear.com/~<handle>/<slug>`. It is the read half; writing stays in
// the terminal. Everything else on the site is static; `_routes.json` scopes
// this Function to `/~*` so static assets never pay for it.
//
// It reads public_pages as the anonymous role — the table's RLS makes published
// rows world-readable, and the row only ever holds public data (a materialised
// projection, never the private filesystem). The stored `html` is already a
// safe, escaped fragment (see src/pia/publishHtml.ts); this Function only wraps
// it in the themed page shell and derives the <title>.

interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

// Public config (project ref + publishable anon key are not secrets — they ship
// in the client bundle). Read from env when set, else fall back to the committed
// public values, mirroring the mcp proxy's hardcoded upstream.
const FALLBACK_URL = "https://fmamkwyiaojwgayhbdyk.supabase.co";
const FALLBACK_ANON = "sb_publishable_7NS5-9gKcorNchcgeAk5wQ_w9jstkxE";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** First `# heading` of the Markdown source, for the browser tab title. */
function firstHeading(md: string): string | null {
  for (const line of md.split("\n")) {
    const h = /^#\s+(.*)$/.exec(line);
    if (h) return h[1].trim();
  }
  return null;
}

/** A minimal, theme-aware reader shell around the pre-rendered body fragment.
 *  Self-contained (inline CSS, no scripts) so it needs no external origins. */
function page(title: string, bodyHtml: string, handle: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --fg: #1a1a1a; --bg: #fdfdfc; --muted: #6b6b6b; --accent: #2b6cb0; --rule: #e4e4e0; --code-bg: #f2f2ef; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e6e6e6; --bg: #16171a; --muted: #9aa0a6; --accent: #7fb3ff; --rule: #2a2c30; --code-bg: #222429; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2rem 0 0.6rem; }
  h1 { font-size: 1.9rem; } h2 { font-size: 1.45rem; } h3 { font-size: 1.2rem; }
  p, ul, ol, blockquote, pre { margin: 0 0 1rem; }
  a { color: var(--accent); }
  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; }
  pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid var(--rule); margin-left: 0; padding-left: 1rem; color: var(--muted); }
  hr { border: none; border-top: 1px solid var(--rule); margin: 2rem 0; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: 0.85rem; }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<main>
${bodyHtml}
<footer>~${escapeHtml(handle)} · published with <a href="/">PIA</a></footer>
</main>
</body>
</html>`;
}

/** A themed 404 for an unknown handle/page. */
function notFound(): Response {
  const body = page("Not found", "<h1>Not found</h1><p>No page here (yet).</p>", "");
  return new Response(body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP },
  });
}

// Self-contained: only this origin's inline styles, no scripts, images from
// https/data. Matches the strict posture of the static site's CSP.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'";

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // /~<handle>            → index.md (the home page)
  // /~<handle>/           → index.md
  // /~<handle>/<slug>     → <slug>.md
  const match = /^\/~([a-z0-9-]+)(?:\/(.*))?$/.exec(url.pathname);
  if (!match) return next(); // not a tilde URL — let static assets handle it

  const handle = match[1];
  // Decode the slug: the browser percent-encodes spaces/non-ASCII in the path
  // (`/~tor/trip%20notes`), but pages are stored under the decoded filename
  // (`trip notes.md`). A malformed escape can't match any page → 404.
  let rest: string;
  try {
    rest = decodeURIComponent((match[2] ?? "").replace(/\/+$/, ""));
  } catch {
    return notFound();
  }
  const path = rest === "" ? "index.md" : `${rest}.md`;

  const baseUrl = env.VITE_SUPABASE_URL ?? FALLBACK_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY ?? FALLBACK_ANON;
  const query =
    `${baseUrl}/rest/v1/public_pages` +
    `?handle=eq.${encodeURIComponent(handle)}` +
    `&path=eq.${encodeURIComponent(path)}` +
    `&select=html,content&limit=1`;

  let rows: { html: string; content: string }[];
  try {
    const resp = await fetch(query, {
      headers: { apikey: anon, authorization: `Bearer ${anon}`, accept: "application/json" },
    });
    if (!resp.ok) return new Response("upstream error", { status: 502 });
    rows = (await resp.json()) as { html: string; content: string }[];
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }

  if (!rows.length) return notFound();

  const { html, content } = rows[0];
  const title = firstHeading(content) ?? handle;
  return new Response(page(title, html, handle), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CSP,
      // Short edge cache; republish updates the row and the next fetch refreshes.
      "cache-control": "public, max-age=60",
    },
  });
};
