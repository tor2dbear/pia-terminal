/**
 * MCP access tokens: the seam behind `mcp` (the Model Context Protocol
 * connector). A token lets an external AI client — Claude on iOS, say — read
 * (and, scoped, write) *this user's* filesystem through the `mcp` Edge Function,
 * as the user. Like {@link ShareStore} and {@link ReminderStore}, the terminal
 * talks only to this interface: guests get {@link NullTokenStore}, logged-in
 * cloud users get the Supabase implementation, tests get {@link MemoryTokenStore}.
 *
 * The connector itself is a web bridge with no terminal equivalent (an accepted
 * divergence, like share→URL): generating a bearer token to paste into another
 * app is an API-key flow, not a Unix idiom. `mcp` is the honest proper-noun name
 * for the protocol (like `ssh`/`git`), not a friendly coinage.
 *
 * Only a token's SHA-256 hash is ever stored; the plaintext is shown once at
 * creation and never again. The Edge Function hashes the presented bearer token
 * the same way and looks it up — so {@link hashToken} is a contract mirrored in
 * `supabase/functions/mcp/index.ts` (kept in sync by parity, like cron.ts).
 */

/** A token as listed back — never the secret, only its metadata. */
export interface TokenInfo {
  label: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp the connector last authenticated with it, if ever. */
  lastUsedAt?: string;
  /** Where this token may write (see {@link describeWriteScope}). */
  writeScope: string[];
}

export interface TokenStore {
  /** Whether a cloud backend is wired up (tokens need one to mean anything). */
  available(): boolean;
  /** The MCP endpoint to hand an agent, or null when cloud is off. */
  connectorUrl(): string | null;
  /** Mint a token under `label`, scoped to `writeScope` (defaults to
   * {@link DEFAULT_WRITE_SCOPE}); resolves to the plaintext secret, shown *once*.
   * Rejects a duplicate label so `revoke` stays unambiguous. */
  create(label: string, writeScope?: string[]): Promise<string>;
  /** The user's active tokens, newest first. */
  list(): Promise<TokenInfo[]>;
  /** Change the write scope of the token named `label` in place (the secret is
   * unchanged, so no reconnect); resolves to whether one matched. */
  updateScope(label: string, writeScope: string[]): Promise<boolean>;
  /** Revoke the token named `label`; resolves to whether one was removed. */
  revoke(label: string): Promise<boolean>;
}

// ── Write scope ──────────────────────────────────────────────────────────────
// A token can always *read* the whole home; what it may *write* is a per-token
// list of home-relative directory prefixes. `["inbox"]` (the default) keeps the
// original "safe by default" behaviour; `[]` is read-only; `["."]` is the whole
// home; `["docs", "notes"]` widens to named dirs. The Edge Function enforces the
// same shape (parity, like {@link hashToken}) — see supabase/functions/mcp.

/** The default write scope for a new token: only under `~/inbox/`. */
export const DEFAULT_WRITE_SCOPE: string[] = ["inbox"];

/** Normalise a user-supplied `--write` dir to a home-relative scope prefix, or
 * null if it's malformed (contains `.`/`..` segments). `.`/`~`/`/`/empty all
 * mean the whole home, represented as `"."`. */
export function normalizeScopeDir(dir: string): string | null {
  const t = dir.trim();
  if (t === "" || t === "." || t === "~" || t === "/" || t === "~/") return ".";
  const cleaned = t.replace(/^~\//, "").replace(/^\/+/, "");
  const segs = cleaned.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segs.length === 0) return ".";
  if (segs.some((s) => s === "." || s === "..")) return null;
  return segs.join("/");
}

/** A human phrase for a token's write scope — shared by `mcp token`'s output and
 * `mcp tokens`. The Edge Function keeps a parallel copy for its refusals. */
export function describeWriteScope(scope: string[]): string {
  if (scope.length === 0) return "read all; no write (read-only)";
  const dirs = scope.map((s) => (s === "." ? "~/ (all of home)" : `${s}/`)).join(", ");
  return `read all; write ${dirs}`;
}

// ── Token + hash helpers (shared contract with the Edge Function) ────────────

/** Bytes → URL-safe base64 with no padding. */
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh opaque token: `pia_` + 32 random bytes, base64url. The `pia_` prefix
 * makes it greppable/recognisable (like `sk-`/`ghp_`), and 256 bits of entropy
 * is well past guessable. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `pia_${base64url(bytes)}`;
}

/** SHA-256 of the token, as lowercase hex — the only form ever persisted. The
 * Edge Function computes this identically over the presented bearer token to
 * look the row up; keep the two in sync. */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Guest / test implementations ─────────────────────────────────────────────

/** Tokens turned off: the local/guest build with no cloud backend. */
export class NullTokenStore implements TokenStore {
  available(): boolean {
    return false;
  }
  connectorUrl(): string | null {
    return null;
  }
  async create(_label?: string, _writeScope?: string[]): Promise<string> {
    throw new Error("the MCP connector needs a cloud account — run `login`");
  }
  async list(): Promise<TokenInfo[]> {
    return [];
  }
  async updateScope(): Promise<boolean> {
    return false;
  }
  async revoke(): Promise<boolean> {
    return false;
  }
}

/**
 * In-memory token store for tests. Models the real store's shape: hashes the
 * secret (never keeps plaintext), rejects duplicate labels, and hands back the
 * plaintext only from {@link create}. A fixed connector URL stands in for the
 * deployed Edge Function.
 */
export class MemoryTokenStore implements TokenStore {
  private rows: {
    label: string;
    hash: string;
    createdAt: string;
    lastUsedAt?: string;
    writeScope: string[];
  }[] = [];
  private seq = 0;

  available(): boolean {
    return true;
  }
  connectorUrl(): string | null {
    return "https://example.test/functions/v1/mcp";
  }
  async create(label: string, writeScope: string[] = DEFAULT_WRITE_SCOPE): Promise<string> {
    if (this.rows.some((r) => r.label === label)) {
      throw new Error(`a token named "${label}" already exists — revoke it first`);
    }
    const token = generateToken();
    // A monotonic, deterministic timestamp so tests stay stable without a clock.
    const createdAt = `2026-01-01T00:00:${String(this.seq++).padStart(2, "0")}.000Z`;
    this.rows.unshift({ label, hash: await hashToken(token), createdAt, writeScope: [...writeScope] });
    return token;
  }
  async list(): Promise<TokenInfo[]> {
    return this.rows.map(({ label, createdAt, lastUsedAt, writeScope }) => ({
      label,
      createdAt,
      lastUsedAt,
      writeScope: [...writeScope],
    }));
  }
  async updateScope(label: string, writeScope: string[]): Promise<boolean> {
    const row = this.rows.find((r) => r.label === label);
    if (!row) return false;
    row.writeScope = [...writeScope];
    return true;
  }
  async revoke(label: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.label !== label);
    return this.rows.length < before;
  }
}
