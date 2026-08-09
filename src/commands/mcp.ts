import type { Command, CommandContext } from "./registry.js";
import { describeWriteScope, normalizeScopeDir, DEFAULT_WRITE_SCOPE } from "../mcp/tokens.js";

/**
 * `mcp` — manage the Model Context Protocol connector: the bridge that lets an
 * external AI client (e.g. Claude on iOS) read and, scoped, write *your* PIA
 * files as you. You mint a bearer token here and paste it — with the connector
 * URL — into the AI client; the `mcp` Edge Function authenticates the token and
 * acts on your filesystem row.
 *
 *   mcp                 show connector status + URL
 *   mcp url             print just the connector URL (for scripting)
 *   mcp token <label>   mint a token named <label> (shown once)
 *     --write <dir>       widen writes to <dir> (repeatable; `.` = all of home)
 *     --full / --all      writes to the whole home (shorthand for `--write .`)
 *     --read-only         no writes at all
 *   mcp scope <label>   change an existing token's write scope in place (same
 *                       flags as `token`) — no new secret, so no reconnect
 *   mcp tokens          list your active tokens (with their scopes)
 *   mcp revoke <label>  revoke a token
 *
 * A token can always read the whole home; `--write`/`--read-only` choose what it
 * may write. Default (no flags) is write only under `inbox/` — safe by default,
 * so an agent can't overwrite `docs/` or `.pia/` unless you say so. `scope` is
 * the `chmod` of a token: the Edge Function reads the scope per request, so a
 * change takes effect on the connector's next call without re-pasting anything.
 *
 * `mcp` is the protocol's real name (a proper noun, like `ssh`/`git`), not a
 * friendly coinage. Minting a token is an API-key flow with no Unix equivalent —
 * an accepted web divergence, flagged like share→URL.
 */

const SUB = ["url", "token", "scope", "tokens", "revoke"];
const TOKEN_FLAGS = ["--write", "--full", "--read-only"];

/** Parse the free-form label words and scope flags shared by `token`/`scope`.
 * Flags may be interspersed with the label: `my phone --write docs --full`. */
function parseLabelAndScopeFlags(
  rest: string[],
): { label: string; readOnly: boolean; writeDirs: string[] } | { error: string } {
  const isFlag = (s: string | undefined): boolean =>
    s === "--read-only" || s === "-r" || s === "--full" || s === "--all" ||
    s === "--write" || s === "-w";
  let readOnly = false;
  const writeDirs: string[] = [];
  const words: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--read-only" || a === "-r") {
      readOnly = true;
    } else if (a === "--full" || a === "--all") {
      // Whole home — shorthand for `--write .` (the `.` collapse below wins).
      writeDirs.push(".");
    } else if (a === "--write" || a === "-w") {
      // Don't swallow a following flag (or nothing) as the directory —
      // `--write --read-only` is a malformed invocation, not a dir named
      // "--read-only", and consuming it would drop the flag silently.
      const dir = rest[i + 1];
      if (dir === undefined || isFlag(dir)) {
        return { error: "--write needs a directory — e.g. --write docs" };
      }
      i++;
      writeDirs.push(dir);
    } else {
      words.push(a);
    }
  }
  return { label: words.join(" ").trim(), readOnly, writeDirs };
}

/** Resolve parsed flags to a concrete write scope (a list of home-relative dir
 * prefixes), or an error. Rejects `--read-only` + `--write`, validates each dir,
 * and collapses a whole-home `.` so it subsumes any named dirs. */
function scopeFromFlags(
  readOnly: boolean,
  writeDirs: string[],
): { scope: string[] } | { error: string } {
  if (readOnly && writeDirs.length > 0) {
    return { error: "--read-only can't be combined with --write" };
  }
  if (readOnly) return { scope: [] };
  const scope: string[] = [];
  for (const dir of writeDirs) {
    const norm = normalizeScopeDir(dir);
    if (norm === null) return { error: `bad --write path "${dir}" (no . or .. segments)` };
    if (!scope.includes(norm)) scope.push(norm);
  }
  if (scope.includes(".")) return { scope: ["."] };
  return { scope };
}

const mcp: Command<CommandContext> = {
  name: "mcp",
  help: "manage the MCP connector — mint tokens so an AI client can read/write your files (mcp [token|tokens|revoke|url])",
  usage: "mcp [url | token <label> [--write <dir>] [--full] [--read-only] | scope <label> <flags> | tokens | revoke <label>]",
  complete(args) {
    // First operand: offer the subcommands. After `token`/`scope` the remaining
    // operands are a free-form label plus scope flags, so offer the flags.
    if (args.length === 0) return SUB;
    if (args[0] === "token" || args[0] === "scope") return TOKEN_FLAGS;
    return [];
  },
  async run(args, ctx) {
    const store = ctx.tokens;
    const [sub, ...rest] = args;

    // No cloud backend (guest build): the connector can't mean anything. Answer a
    // bare `mcp` with the honest state rather than an error, mirroring `notify`.
    if (!store || !store.available()) {
      if (!sub) {
        ctx.print("MCP connector: off — needs a cloud account (run `login`).", "dim");
        return;
      }
      ctx.error("mcp: the connector needs a cloud account — run `login`");
      return;
    }

    // Cloud is wired, but a logged-out cloud session still carries a token store
    // (RLS would just return no rows). Without this check `mcp`/`mcp tokens` would
    // look authenticated; gate the whole command on an actual login.
    const session = ctx.auth ? await ctx.auth.current() : null;
    if (!session) {
      if (!sub) {
        ctx.print("MCP connector: needs a logged-in account — run `login`.", "dim");
        return;
      }
      ctx.error("mcp: log in first — run `login`");
      return;
    }

    const url = store.connectorUrl();

    if (!sub) {
      const tokens = await store.list();
      ctx.print("MCP connector", "accent");
      ctx.print(`  endpoint  ${url ?? "(unavailable)"}`);
      ctx.print(`  tokens    ${tokens.length} active`);
      ctx.print("");
      ctx.print("Mint one with `mcp token <label>`, then add it as a custom", "dim");
      ctx.print("connector in your AI client (URL above, token as the bearer).", "dim");
      return;
    }

    if (sub === "url") {
      ctx.print(url ?? "(unavailable)");
      return;
    }

    if (sub === "token") {
      const parsed = parseLabelAndScopeFlags(rest);
      if ("error" in parsed) {
        ctx.error(`mcp: ${parsed.error}`);
        return;
      }
      const { label, readOnly, writeDirs } = parsed;
      if (!label) {
        ctx.error("mcp: name the token — mcp token <label>");
        return;
      }
      // No scope flags → the safe default (write only under inbox/).
      const resolved =
        !readOnly && writeDirs.length === 0
          ? { scope: [...DEFAULT_WRITE_SCOPE] }
          : scopeFromFlags(readOnly, writeDirs);
      if ("error" in resolved) {
        ctx.error(`mcp: ${resolved.error}`);
        return;
      }

      let token: string;
      try {
        token = await store.create(label, resolved.scope);
      } catch (e) {
        ctx.error(`mcp: ${(e as Error).message}`);
        return;
      }
      ctx.print(`token "${label}" created — shown once, copy it now:`, "accent");
      ctx.print(`  ${token}`);
      ctx.print("");
      ctx.print(`  endpoint  ${url ?? "(unavailable)"}`, "dim");
      ctx.print(`  scope     ${describeWriteScope(resolved.scope)}`, "dim");
      ctx.print("Add these to your AI client as a custom MCP connector.", "dim");
      return;
    }

    if (sub === "scope") {
      const parsed = parseLabelAndScopeFlags(rest);
      if ("error" in parsed) {
        ctx.error(`mcp: ${parsed.error}`);
        return;
      }
      const { label, readOnly, writeDirs } = parsed;
      if (!label) {
        ctx.error("mcp: name the token — mcp scope <label> [--write <dir> | --full | --read-only]");
        return;
      }
      // Unlike `token`, `scope` has nothing to change without an explicit flag.
      if (!readOnly && writeDirs.length === 0) {
        ctx.error("mcp: specify a scope — --full, --write <dir>, or --read-only");
        return;
      }
      const resolved = scopeFromFlags(readOnly, writeDirs);
      if ("error" in resolved) {
        ctx.error(`mcp: ${resolved.error}`);
        return;
      }
      const updated = await store.updateScope(label, resolved.scope);
      if (!updated) {
        ctx.error(`mcp: no token named "${label}"`);
        return;
      }
      ctx.print(`token "${label}" scope updated — takes effect on the next call.`);
      ctx.print(`  scope     ${describeWriteScope(resolved.scope)}`, "dim");
      return;
    }

    if (sub === "tokens") {
      const tokens = await store.list();
      if (tokens.length === 0) {
        ctx.print("no tokens — mint one with `mcp token <label>`", "dim");
        return;
      }
      for (const t of tokens) {
        const used = t.lastUsedAt ? `last used ${t.lastUsedAt}` : "never used";
        ctx.print(`${t.label}  —  created ${t.createdAt}, ${used}`);
        ctx.print(`    ${describeWriteScope(t.writeScope)}`, "dim");
      }
      return;
    }

    if (sub === "revoke") {
      const label = rest.join(" ").trim();
      if (!label) {
        ctx.error("mcp: name the token to revoke — mcp revoke <label>");
        return;
      }
      const removed = await store.revoke(label);
      if (removed) ctx.print(`token "${label}" revoked.`);
      else ctx.error(`mcp: no token named "${label}"`);
      return;
    }

    ctx.error(`mcp: unknown subcommand "${sub}" — try mcp [token|scope|tokens|revoke|url]`);
  },
};

export const mcpCommands: Command<CommandContext>[] = [mcp];
