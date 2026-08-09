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
 *     --read-only         no writes at all
 *   mcp tokens          list your active tokens (with their scopes)
 *   mcp revoke <label>  revoke a token
 *
 * A token can always read the whole home; `--write`/`--read-only` choose what it
 * may write. Default (no flags) is write only under `inbox/` — safe by default,
 * so an agent can't overwrite `docs/` or `.pia/` unless you say so.
 *
 * `mcp` is the protocol's real name (a proper noun, like `ssh`/`git`), not a
 * friendly coinage. Minting a token is an API-key flow with no Unix equivalent —
 * an accepted web divergence, flagged like share→URL.
 */

const SUB = ["url", "token", "tokens", "revoke"];
const TOKEN_FLAGS = ["--write", "--read-only"];

const mcp: Command<CommandContext> = {
  name: "mcp",
  help: "manage the MCP connector — mint tokens so an AI client can read/write your files (mcp [token|tokens|revoke|url])",
  usage: "mcp [url | token <label> [--write <dir>] [--read-only] | tokens | revoke <label>]",
  complete(args) {
    // First operand: offer the subcommands. After `token <label>` the remaining
    // operands are a free-form label plus scope flags, so offer the flags.
    if (args.length === 0) return SUB;
    if (args[0] === "token") return TOKEN_FLAGS;
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
      // Parse the label (free-form words) alongside scope flags, which may be
      // interspersed: `mcp token my phone --write docs --write notes`.
      let readOnly = false;
      const writeDirs: string[] = [];
      const words: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--read-only" || a === "-r") {
          readOnly = true;
        } else if (a === "--write" || a === "-w") {
          const dir = rest[++i];
          if (dir === undefined) {
            ctx.error("mcp: --write needs a directory — e.g. mcp token <label> --write docs");
            return;
          }
          writeDirs.push(dir);
        } else {
          words.push(a);
        }
      }
      const label = words.join(" ").trim();
      if (!label) {
        ctx.error("mcp: name the token — mcp token <label>");
        return;
      }
      if (readOnly && writeDirs.length > 0) {
        ctx.error("mcp: --read-only can't be combined with --write");
        return;
      }
      let scope: string[];
      if (readOnly) {
        scope = [];
      } else if (writeDirs.length > 0) {
        scope = [];
        for (const dir of writeDirs) {
          const norm = normalizeScopeDir(dir);
          if (norm === null) {
            ctx.error(`mcp: bad --write path "${dir}" (no . or .. segments)`);
            return;
          }
          if (!scope.includes(norm)) scope.push(norm);
        }
        // Whole-home write subsumes any named dirs — collapse to just that.
        if (scope.includes(".")) scope = ["."];
      } else {
        scope = [...DEFAULT_WRITE_SCOPE];
      }

      let token: string;
      try {
        token = await store.create(label, scope);
      } catch (e) {
        ctx.error(`mcp: ${(e as Error).message}`);
        return;
      }
      ctx.print(`token "${label}" created — shown once, copy it now:`, "accent");
      ctx.print(`  ${token}`);
      ctx.print("");
      ctx.print(`  endpoint  ${url ?? "(unavailable)"}`, "dim");
      ctx.print(`  scope     ${describeWriteScope(scope)}`, "dim");
      ctx.print("Add these to your AI client as a custom MCP connector.", "dim");
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

    ctx.error(`mcp: unknown subcommand "${sub}" — try mcp [token|tokens|revoke|url]`);
  },
};

export const mcpCommands: Command<CommandContext>[] = [mcp];
