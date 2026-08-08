// mcp — a remote Model Context Protocol server over the user's PIA filesystem.
// An external AI client (e.g. Claude on iOS, added as a custom connector) talks
// JSON-RPC here with a `pia_*` bearer token; we hash the token, resolve it to a
// user via public.mcp_tokens (service role), and expose that user's filesystem
// row as MCP tools: read anything, write only under inbox/.
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

/** Write `content` at a path under inbox/, creating parent dirs as needed.
 * Returns false if the path is outside inbox/ or malformed. Mutates `root`. */
function writeUnderInbox(root: DirNode, parts: string[] | null, content: string): boolean {
  if (!parts || parts.length < 2 || parts[0] !== "inbox") return false;
  let dir: DirNode = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts[i];
    let child: VNode | undefined = dir.children[name];
    if (!child) {
      child = { type: "dir", name, children: {} };
      dir.children[name] = child;
    }
    if (child.type !== "dir") return false; // a file sits where a dir must be
    dir = child;
  }
  const leaf = parts[parts.length - 1];
  const existing = dir.children[leaf];
  if (existing && existing.type !== "file") return false; // can't overwrite a dir
  dir.children[leaf] = { type: "file", name: leaf, content };
  return true;
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
    description: "List the entries of a directory in the user's PIA filesystem. Omit path for the root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path, e.g. 'inbox' or 'docs/notes'. Root if omitted." } },
    },
  },
  {
    name: "pia_read",
    description: "Read the text content of a file in the user's PIA filesystem.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "File path, e.g. 'todo.md' or 'docs/plan.md'." } },
      required: ["path"],
    },
  },
  {
    name: "pia_write",
    description: "Create or overwrite a file under inbox/. Writing outside inbox/ is refused.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path under inbox/, e.g. 'inbox/idea.md'." },
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
  if (name === "pia_list") {
    const parts = segments(String(args.path ?? ""));
    if (!parts) return text("invalid path", true);
    const { tree } = await loadTree(db, userId);
    const node = resolve(tree, parts);
    if (!node) return text(`not found: ${args.path ?? "/"}`, true);
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
    const node = resolve(tree, parts);
    if (!node) return text(`not found: ${args.path}`, true);
    if (node.type !== "file") return text(`not a file: ${args.path}`, true);
    return text(node.content);
  }

  if (name === "pia_write") {
    const parts = segments(String(args.path ?? ""));
    const content = typeof args.content === "string" ? args.content : null;
    if (content === null) return text("content must be a string", true);
    if (!parts || parts[0] !== "inbox" || parts.length < 2) {
      return text("write refused: only paths under inbox/ are writable", true);
    }
    // One retry on a concurrent write (another device saved between our read and
    // update); a second conflict is surfaced rather than looping.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { tree, version } = await loadTree(db, userId);
      if (!writeUnderInbox(tree, parts, content)) return text("write refused: invalid path", true);
      if (await saveTree(db, userId, tree, version)) return text(`wrote ${parts.join("/")}`);
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
    const clientVersion = (params?.protocolVersion as string) || PROTOCOL_VERSION;
    return rpcResult(id, {
      protocolVersion: clientVersion,
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
