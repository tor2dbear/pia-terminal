// Cloudflare Pages Function: reverse-proxy /mcp/* to the Supabase Edge Function.
//
// Why: an MCP client (e.g. Claude's connector) shows the icon of the connector
// URL's origin. Pointing the connector at the Supabase functions domain meant a
// Supabase icon and an off-brand URL. Serving the connector from PIA's own
// origin (pia.tor2dbear.com/mcp) makes the client fetch PIA's favicon and gives
// an on-brand URL — while the actual MCP/OAuth logic stays in the one Edge
// Function. This is the app's only server-side piece; everything else is static.
//
// It forwards method, headers, and body verbatim, and tells the function its
// public base via `x-pia-public-base` so discovery advertises this origin's
// /mcp (not the supabase.co URL). The header is trusted because only this proxy
// sets it; a direct caller to the function that forges it only affects the
// discovery document in its *own* response (it's computed per-request, never
// stored), so there's no cross-user impact — standard X-Forwarded-* handling.

// The upstream Edge Function. Public URL (the project ref is not a secret — it
// ships in the client bundle as VITE_SUPABASE_URL); kept in sync with that.
const UPSTREAM = "https://fmamkwyiaojwgayhbdyk.supabase.co/functions/v1/mcp";

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);
  // /mcp -> "", /mcp/authorize -> "/authorize", /mcp/.well-known/x -> "/.well-known/x"
  const rest = url.pathname.replace(/^\/mcp/, "");
  const target = `${UPSTREAM}${rest}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("x-pia-public-base", `${url.origin}/mcp`);
  // Let fetch derive these from the upstream URL rather than forwarding ours.
  headers.delete("host");
  headers.delete("content-length");

  const method = request.method;
  // Buffer the body (MCP payloads are small JSON / a tiny auth form) so we avoid
  // streaming-request duplex handling; the original content-type header is kept.
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  const resp = await fetch(target, { method, headers, body, redirect: "manual" });
  // Pass the response through unchanged (status, CORS headers, 302 Location).
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
};
