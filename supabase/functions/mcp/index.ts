// mcp — a remote Model Context Protocol server over the user's PIA filesystem,
// with OAuth 2.1 authorization so OAuth-only clients (Claude's custom connector)
// can connect.
//
// Two request families share this one function, routed by path:
//   • OAuth 2.1 (discovery / register / authorize / token) — how a client gets a
//     token. The authorize step authenticates the user by a token they minted in
//     the terminal (`mcp token`), so the terminal stays the source of truth — no
//     separate login page of our own.
//   • MCP JSON-RPC (POST to the base path) — the tools themselves, authenticated
//     by `Authorization: Bearer <token>`, hashed and looked up in mcp_tokens.
//
// Deployed with JWT verification off (our own bearer, not a Supabase JWT).
// Mirrors src/mcp/tokens.ts (hashToken) and the filesystems optimistic-
// concurrency guard in src/supabase/storage.ts.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// The project's own base URL, derived from the injected env — so discovery,
// redirects, and the authorize form always point at the project this function is
// deployed to (dev / staging / self-hosted), not a hardcoded one.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const BASE = `${SUPABASE_URL}/functions/v1/mcp`;
// The PIA web app's public origin, which renders the OAuth connect form (Supabase
// forces text/plain on any HTML a function returns, so it can't live here). This
// is its own config, not derivable from SUPABASE_URL.
const APP_URL = "https://pia.tor2dbear.com";

// ── Filesystem tree (mirror of src/vfs/types.ts) ─────────────────────────────
interface FileNode {
  type: "file";
  name: string;
  content: string;
  shareId?: string;
}
interface DirNode {
  type: "dir";
  name: string;
  children: Record<string, VNode>;
}
type VNode = FileNode | DirNode;

const emptyRoot = (): DirNode => ({ type: "dir", name: "", children: {} });

/** Path → clean segments. Rejects `.`/`..` so a path can never escape the tree. */
function segments(path: string): string[] | null {
  const parts = (path ?? "").split("/").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.some((p) => p === "." || p === "..")) return null;
  return parts;
}

/** Resolve a path against the tree, or null if any segment is missing. */
function resolve(root: DirNode, parts: string[]): VNode | null {
  let node: VNode = root;
  for (const part of parts) {
    if (node.type !== "dir") return null;
    const next: VNode | undefined = node.children[part];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Write `content` at `<home>/inbox/…`, creating parent dirs as needed. Returns a
 * status string starting with "wrote " on success, or a refusal reason. */
function writeFile(root: DirNode, homeParts: string[], parts: string[], content: string): string {
  if (parts.length < 2 || parts[0] !== "inbox") {
    return "write refused: only paths under inbox/ are writable";
  }
  const full = [...homeParts, ...parts];
  let dir: DirNode = root;
  for (let i = 0; i < full.length - 1; i++) {
    const name = full[i];
    let child: VNode | undefined = dir.children[name];
    if (!child) {
      child = { type: "dir", name, children: {} };
      dir.children[name] = child;
    }
    if (child.type !== "dir") return "write refused: a file blocks that path";
    dir = child;
  }
  const leaf = full[full.length - 1];
  const existing = dir.children[leaf];
  if (existing && existing.type !== "file") return "write refused: a directory exists there";
  if (existing && existing.type === "file" && existing.shareId) {
    return "write refused: that file is linked to a shared list - edit it in PIA";
  }
  dir.children[leaf] = { type: "file", name: leaf, content };
  return `wrote ${parts.join("/")}`;
}

// ── Home resolution ──────────────────────────────────────────────────────────
interface AuthUser {
  email: string | null;
  user_metadata?: { username?: string };
}

/** The home directory name for a user — mirrors handle() in src/supabase/auth.ts. */
function handle(user: AuthUser | null | undefined): string {
  if (!user) return "user";
  return user.user_metadata?.username ?? (user.email ? user.email.split("@")[0] : null) ?? "user";
}

/** The path segments of a user's home dir, or null if the user can't be resolved
 * (transient error / missing) — never default the name, which would misroute. */
async function homeSegments(db: SupabaseClient, userId: string): Promise<string[] | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return ["home", handle(data.user as AuthUser)];
}

// ── Crypto helpers ───────────────────────────────────────────────────────────
/** Bytes → URL-safe base64, no padding. */
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256bytes(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}
/** SHA-256 hex — identical to src/mcp/tokens.ts hashToken. */
async function sha256hex(input: string): Promise<string> {
  return [...await sha256bytes(input)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** A random opaque id with a prefix (256 bits of entropy). */
function randomId(prefix: string): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return prefix + b64url(b);
}

// ── Token auth (MCP requests) ────────────────────────────────────────────────
interface Caller {
  userId: string;
  tokenId: string;
}

/** Resolve the Authorization bearer token to a user, or null if unknown. */
async function authenticate(db: SupabaseClient, req: Request): Promise<Caller | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const hash = await sha256hex(match[1].trim());
  const { data } = await db.from("mcp_tokens").select("id, user_id").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  return { userId: data.user_id, tokenId: data.id };
}

// ── Filesystem row access (service role, scoped to the caller) ───────────────
async function loadTree(
  db: SupabaseClient,
  userId: string,
): Promise<{ tree: DirNode; version: string | null }> {
  const { data, error } = await db
    .from("filesystems")
    .select("tree, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`filesystem load failed: ${error.message}`);
  return { tree: (data?.tree as DirNode) ?? emptyRoot(), version: data?.updated_at ?? null };
}

/** A file's live content — a linked file (shareId) resolves through the shared
 * backend (membership-checked), falling back to the local cache on any error. */
async function liveContent(db: SupabaseClient, userId: string, node: FileNode): Promise<string> {
  if (!node.shareId) return node.content;
  try {
    const { data } = await db
      .from("shared_lists")
      .select("content, shared_list_members!inner(user_id)")
      .eq("id", node.shareId)
      .eq("shared_list_members.user_id", userId)
      .maybeSingle();
    return typeof data?.content === "string" ? data.content : node.content;
  } catch {
    return node.content;
  }
}

/** Guarded save mirroring SupabaseStorageAdapter (optimistic concurrency). */
async function saveTree(
  db: SupabaseClient,
  userId: string,
  tree: DirNode,
  version: string | null,
): Promise<boolean> {
  if (version === null) {
    const { error } = await db.from("filesystems").insert({ user_id: userId, tree });
    return !error;
  }
  const { data, error } = await db
    .from("filesystems")
    .update({ tree })
    .eq("user_id", userId)
    .eq("updated_at", version)
    .select("updated_at");
  return !error && !!data && data.length > 0;
}

// ── MCP tools ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "pia_list",
    description: "List the entries of a directory in the user's PIA home. Paths are relative to home (~); omit path for the home directory itself.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path relative to home, e.g. 'inbox' or 'docs/notes'. Home if omitted." } },
    },
  },
  {
    name: "pia_read",
    description: "Read the text content of a file in the user's PIA home. Paths are relative to home (~).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "File path relative to home, e.g. 'todo.md' or 'docs/plan.md'." } },
      required: ["path"],
    },
  },
  {
    name: "pia_write",
    description: "Create or overwrite a file under the home inbox/ (i.e. ~/inbox/). Writing anywhere else is refused.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path under inbox/, relative to home, e.g. 'inbox/idea.md'." },
        content: { type: "string", description: "The file's full new text content." },
      },
      required: ["path", "content"],
    },
  },
];

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (s: string, isError = false): ToolResult => ({ content: [{ type: "text", text: s }], isError });

async function callTool(
  db: SupabaseClient,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const home = await homeSegments(db, userId);
  if (!home) return text("could not resolve your account - please try again", true);

  if (name === "pia_list") {
    const parts = segments(String(args.path ?? ""));
    if (!parts) return text("invalid path", true);
    const { tree } = await loadTree(db, userId);
    const node = resolve(tree, [...home, ...parts]);
    if (!node) return text(`not found: ${args.path ?? "~"}`, true);
    if (node.type !== "dir") return text(`not a directory: ${args.path}`, true);
    const entries = Object.values(node.children)
      .map((c) => (c.type === "dir" ? `${c.name}/` : c.name))
      .sort();
    return text(entries.length ? entries.join("\n") : "(empty)");
  }

  if (name === "pia_read") {
    const parts = segments(String(args.path ?? ""));
    if (!parts || parts.length === 0) return text("invalid path", true);
    const { tree } = await loadTree(db, userId);
    const node = resolve(tree, [...home, ...parts]);
    if (!node) return text(`not found: ${args.path}`, true);
    if (node.type !== "file") return text(`not a file: ${args.path}`, true);
    return text(await liveContent(db, userId, node));
  }

  if (name === "pia_write") {
    const parts = segments(String(args.path ?? ""));
    const content = typeof args.content === "string" ? args.content : null;
    if (content === null) return text("content must be a string", true);
    if (!parts) return text("write refused: invalid path", true);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { tree, version } = await loadTree(db, userId);
      const status = writeFile(tree, home, parts, content);
      if (!status.startsWith("wrote")) return text(status, true);
      if (await saveTree(db, userId, tree, version)) return text(status);
    }
    return text("write conflict: the filesystem changed - try again", true);
  }

  return text(`unknown tool: ${name}`, true);
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const PROTOCOL_VERSION = "2024-11-05";
const RESOURCE_METADATA_URL = `${BASE}/.well-known/oauth-protected-resource`;

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}
function rpcError(id: unknown, code: number, message: string, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: { ...CORS, ...extra } });
}
function jsonRes(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

// ── OAuth 2.1 ────────────────────────────────────────────────────────────────
// Discovery: tell the client we're a protected resource and where our AS lives.
function protectedResourceMetadata(): Response {
  return jsonRes({ resource: BASE, authorization_servers: [BASE] });
}
function authServerMetadata(): Response {
  return jsonRes({
    issuer: BASE,
    authorization_endpoint: `${BASE}/authorize`,
    token_endpoint: `${BASE}/token`,
    registration_endpoint: `${BASE}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["pia"],
  });
}

// Dynamic Client Registration (RFC 7591): hand back a client_id for the client's
// redirect URIs. Public client (no secret) — auth is via PKCE + the pasted token.
async function handleRegister(db: SupabaseClient, req: Request): Promise<Response> {
  let body: { redirect_uris?: unknown; client_name?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid_client_metadata", error_description: "body must be JSON" }, 400);
  }
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    return jsonRes({ error: "invalid_redirect_uri", error_description: "redirect_uris required" }, 400);
  }
  const clientId = randomId("pia-client-");
  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  const { error } = await db.from("oauth_clients").insert({
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: clientName,
  });
  if (error) return jsonRes({ error: "server_error", error_description: error.message }, 500);
  return jsonRes({
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: clientName ?? undefined,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  }, 201);
}

// The connect FORM is rendered by the PIA app (Supabase forces text/plain on any
// HTML a function returns), so GET /authorize just forwards the OAuth query to
// the app; the app POSTs the pasted token back to handleAuthorizePost below.
function handleAuthorizeGet(url: URL): Response {
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}/${url.search}` } });
}

async function handleAuthorizePost(db: SupabaseClient, req: Request): Promise<Response> {
  const form = await req.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const token = String(form.get("token") ?? "").trim();

  // Re-prompt in the app (carrying an error) for a recoverable failure.
  const reprompt = (error: string): Response => {
    const q = new URLSearchParams({
      response_type: "code",
      code_challenge_method: "S256",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      state,
      mcp_error: error,
    });
    return new Response(null, { status: 302, headers: { Location: `${APP_URL}/?${q.toString()}` } });
  };

  const { data: client } = await db
    .from("oauth_clients")
    .select("redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client || !(client.redirect_uris as string[]).includes(redirectUri)) {
    return new Response("invalid client or redirect_uri", { status: 400 });
  }

  if (!token) return reprompt("Paste a token to connect.");
  const { data: row } = await db.from("mcp_tokens").select("user_id").eq("token_hash", await sha256hex(token)).maybeSingle();
  if (!row) return reprompt("That token wasn't recognised. Mint one with `mcp token <name>` and paste it here.");

  const code = randomId("pia-code-");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await db.from("oauth_codes").insert({
    code,
    user_id: row.user_id,
    access_token: token,
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
    client_id: clientId,
    expires_at: expiresAt,
  });
  if (error) return reprompt("Something went wrong issuing the code - try again.");
  // Mark the client active so the retention sweep keeps it (see supabase/mcp.sql).
  await db.from("oauth_clients").update({ last_used_at: new Date().toISOString() }).eq("client_id", clientId);

  const sep = redirectUri.includes("?") ? "&" : "?";
  const location = `${redirectUri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}

async function handleToken(db: SupabaseClient, req: Request): Promise<Response> {
  let params: URLSearchParams;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    params = new URLSearchParams(await req.text());
  } else {
    try {
      const j = await req.json();
      params = new URLSearchParams(j as Record<string, string>);
    } catch {
      params = new URLSearchParams(await req.text());
    }
  }
  if (params.get("grant_type") !== "authorization_code") {
    return jsonRes({ error: "unsupported_grant_type" }, 400);
  }
  const code = params.get("code") ?? "";
  const verifier = params.get("code_verifier") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";

  // Atomic one-time redemption: DELETE … RETURNING. Only the request that
  // actually removes the row gets it back, so a concurrent exchange with the same
  // code gets nothing. Expired/abandoned codes are swept by a pg_cron job, so
  // redemption doesn't depend on later /token traffic (see supabase/mcp.sql).
  const { data: row } = await db.from("oauth_codes").delete().eq("code", code).select("*").maybeSingle();
  if (!row) return jsonRes({ error: "invalid_grant", error_description: "unknown code" }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return jsonRes({ error: "invalid_grant", error_description: "code expired" }, 400);
  if (row.redirect_uri !== redirectUri) return jsonRes({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
  if (b64url(await sha256bytes(verifier)) !== row.code_challenge) {
    return jsonRes({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }
  return jsonRes({ access_token: row.access_token, token_type: "Bearer", scope: "pia" });
}

// ── Router ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname;
  const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // OAuth discovery — served at the function sub-path; some clients also probe
  // the OpenID configuration URL, so answer that with the same AS metadata.
  if (path.endsWith("/.well-known/oauth-protected-resource")) return protectedResourceMetadata();
  if (path.endsWith("/.well-known/oauth-authorization-server")) return authServerMetadata();
  if (path.endsWith("/.well-known/openid-configuration")) return authServerMetadata();
  if (path.endsWith("/register") && req.method === "POST") return handleRegister(db, req);
  if (path.endsWith("/authorize")) {
    if (req.method === "GET") return handleAuthorizeGet(url);
    if (req.method === "POST") return handleAuthorizePost(db, req);
  }
  if (path.endsWith("/token") && req.method === "POST") return handleToken(db, req);

  // Otherwise: the MCP JSON-RPC endpoint.
  if (req.method !== "POST") return rpcError(null, -32600, "POST required", 405);

  const caller = await authenticate(db, req);
  if (!caller) {
    // Point OAuth clients at our resource metadata so they can start the flow.
    return rpcError(null, -32001, "unauthorized: unknown or missing bearer token", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`,
    });
  }
  // Best-effort "last used" bump. Awaited so the (lazy) PostgREST request issues.
  await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", caller.tokenId);

  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, "parse error");
  }
  const { id, method, params } = msg;

  if (method?.startsWith("notifications/")) return new Response(null, { status: 202, headers: CORS });
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pia", version: "1.0.0" },
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) ?? {};
    try {
      return rpcResult(id, await callTool(db, caller.userId, name, args));
    } catch (e) {
      return rpcResult(id, text(`error: ${(e as Error).message}`, true));
    }
  }
  return rpcError(id, -32601, `method not found: ${method}`);
});
