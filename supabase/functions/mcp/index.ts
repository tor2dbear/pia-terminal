// mcp — a remote Model Context Protocol server over the user's PIA filesystem.
// An external AI client (e.g. Claude on iOS, added as a custom connector) talks
// JSON-RPC here with a `pia_*` bearer token; we hash the token, resolve it to a
// user via public.mcp_tokens (service role), and expose that user's home
// directory as MCP tools: paths are relative to ~, read anything, write ~/inbox/.
//
// Deployed to the live project via MCP; kept here for version control. It
// authenticates with our OWN opaque token, not a Supabase JWT, so deploy with
// JWT verification off:
//   supabase functions deploy mcp --no-verify-jwt
//
// Mirrors src/mcp/tokens.ts (hashToken) and the filesystems optimistic-
// concurrency guard in src/supabase/storage.ts — keep them in sync.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

/** Write `content` at `<home>/inbox/…`, creating parent dirs as needed. `parts`
 * is the client path relative to home. Returns a status string starting with
 * "wrote " on success, or a refusal reason otherwise. Mutates `root`. */
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
  // A linked file's real content lives in the shared backend; overwriting here
  // would silently detach the cloud link (VFS.writeFile preserves shareId, and a
  // linked edit must update the shared object). Refuse rather than lie.
  if (existing && existing.type === "file" && existing.shareId) {
    return "write refused: that file is linked to a shared list — edit it in PIA";
  }
  dir.children[leaf] = { type: "file", name: leaf, content };
  return `wrote ${parts.join("/")}`;
}

// ── Home resolution ──────────────────────────────────────────────────────────
// The persisted tree is the whole VFS root; a user's files live under
// /home/<username> (the terminal does `home = /home/${session.user}` on login).
// So every tool path is resolved relative to that home — which also sandboxes an
// agent to the user's home (it can't read /etc) as a side benefit.

interface AuthUser {
  email: string | null;
  user_metadata?: { username?: string };
}

/** The home directory name for a user — mirrors handle() in src/supabase/auth.ts. */
function handle(user: AuthUser | null | undefined): string {
  if (!user) return "user";
  return user.user_metadata?.username ?? (user.email ? user.email.split("@")[0] : null) ?? "user";
}

/** The path segments of a user's home dir, e.g. ["home", "alice"], or null if the
 * user can't be resolved (transient admin error, missing user). Never fall back
 * to a default name — that would silently write to the wrong home. */
async function homeSegments(db: SupabaseClient, userId: string): Promise<string[] | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return ["home", handle(data.user as AuthUser)];
}

// ── Token auth ───────────────────────────────────────────────────────────────
/** SHA-256 hex — identical to src/mcp/tokens.ts hashToken. */
async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const { data } = await db
    .from("mcp_tokens")
    .select("id, user_id")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) return null;
  return { userId: data.user_id, tokenId: data.id };
}

// ── Filesystem row access (service role, scoped to the caller) ───────────────
async function loadTree(
  db: SupabaseClient,
  userId: string,
): Promise<{ tree: DirNode; version: string | null }> {
  const { data } = await db
    .from("filesystems")
    .select("tree, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return { tree: (data?.tree as DirNode) ?? emptyRoot(), version: data?.updated_at ?? null };
}

/** A file's live content. A linked file (shareId) is only a local cache here —
 * the shared object is the source of truth — so return the current shared
 * content when the user is still a member, falling back to the cache otherwise
 * (link revoked, or any error) so a read never hard-fails. */
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

/** Guarded save mirroring SupabaseStorageAdapter: insert a first row, or update
 * only the row we last read (optimistic concurrency). Returns false on conflict. */
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
  // All tool paths are relative to the user's home directory. If we can't
  // resolve it, fail rather than defaulting to a wrong home (see homeSegments).
  const home = await homeSegments(db, userId);
  if (!home) return text("could not resolve your account — please try again", true);

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
    // One retry on a concurrent write (another device saved between our read and
    // update). A refusal (outside inbox/, or a linked file) is returned at once.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { tree, version } = await loadTree(db, userId);
      const status = writeFile(tree, home, parts, content);
      if (!status.startsWith("wrote")) return text(status, true);
      if (await saveTree(db, userId, tree, version)) return text(status);
    }
    return text("write conflict: the filesystem changed — try again", true);
  }

  return text(`unknown tool: ${name}`, true);
}

// ── JSON-RPC dispatch ────────────────────────────────────────────────────────
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PROTOCOL_VERSION = "2024-11-05";

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}
function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: CORS });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return rpcError(null, -32600, "POST required", 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await authenticate(db, req);
  if (!caller) return rpcError(null, -32001, "unauthorized: unknown or missing bearer token", 401);
  // Best-effort "last used" bump — never blocks the request.
  void db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", caller.tokenId);

  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, "parse error");
  }
  const { id, method, params } = msg;

  // Notifications (no id) — acknowledge with 202 and no body.
  if (method?.startsWith("notifications/")) return new Response(null, { status: 202, headers: CORS });

  if (method === "initialize") {
    // Respond with the version we actually implement, not whatever the client
    // asked for — per MCP, an unsupported requested version must be answered with
    // one the server supports (the client may then reject it).
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
