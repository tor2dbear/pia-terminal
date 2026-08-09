import type { Command, CommandContext } from "./registry.js";

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
 *   mcp tokens          list your active tokens
 *   mcp revoke <label>  revoke a token
 *
 * `mcp` is the protocol's real name (a proper noun, like `ssh`/`git`), not a
 * friendly coinage. Minting a token is an API-key flow with no Unix equivalent —
 * an accepted web divergence, flagged like share→URL.
 */

const SUB = ["url", "token", "tokens", "revoke"];

const mcp: Command<CommandContext> = {
  name: "mcp",
  help: "manage the MCP connector — mint tokens so an AI client can read/write your files (mcp [token|tokens|revoke|url])",
  usage: "mcp [url | token <label> | tokens | revoke <label>]",
  complete(args) {
    // First operand: offer the subcommands. Beyond that the operand is a
    // free-form label, so nothing to suggest.
    return args.length === 0 ? SUB : [];
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
      const label = rest.join(" ").trim();
      if (!label) {
        ctx.error("mcp: name the token — mcp token <label>");
        return;
      }
      let token: string;
      try {
        token = await store.create(label);
      } catch (e) {
        ctx.error(`mcp: ${(e as Error).message}`);
        return;
      }
      ctx.print(`token "${label}" created — shown once, copy it now:`, "accent");
      ctx.print(`  ${token}`);
      ctx.print("");
      ctx.print(`  endpoint  ${url ?? "(unavailable)"}`, "dim");
      ctx.print("  scope     read all; write only under inbox/", "dim");
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
