import { describe, expect, it } from "vitest";
import { mcpCommands } from "./mcp.js";
import { MemoryTokenStore, NullTokenStore } from "../mcp/tokens.js";
import type { CommandContext } from "./registry.js";

const mcp = mcpCommands[0];

/** A minimal auth stub: logged in as `user`, or logged out when null. */
function fakeAuth(user: string | null): CommandContext["auth"] {
  return { current: async () => (user ? { user } : null) } as unknown as CommandContext["auth"];
}

function makeCtx(
  tokens: CommandContext["tokens"],
  auth: CommandContext["auth"] = fakeAuth("torbjorn"),
): {
  ctx: CommandContext;
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const ctx = {
    tokens,
    auth,
    print: (t?: string) => out.push(t ?? ""),
    error: (t: string) => err.push(t),
  } as unknown as CommandContext;
  return { ctx, out, err };
}

describe("mcp", () => {
  it("reports off (and points at login) for a guest with no cloud backend", async () => {
    const { ctx, out } = makeCtx(new NullTokenStore());
    await mcp.run([], ctx);
    expect(out[0]).toMatch(/off/);
    expect(out[0]).toMatch(/cloud account/);
  });

  it("refuses to mint a token without a cloud backend", async () => {
    const { ctx, err } = makeCtx(new NullTokenStore());
    await mcp.run(["token", "iphone"], ctx);
    expect(err[0]).toMatch(/cloud account/);
  });

  it("points a logged-out cloud session at login rather than looking authenticated", async () => {
    // A cloud build still installs the token store when logged out; the command
    // must gate on an actual session, not just the store being wired.
    const { ctx, out } = makeCtx(new MemoryTokenStore(), fakeAuth(null));
    await mcp.run([], ctx);
    expect(out[0]).toMatch(/needs a logged-in account/);

    const err: string[] = [];
    const ctx2 = {
      tokens: new MemoryTokenStore(),
      auth: fakeAuth(null),
      print: () => {},
      error: (t: string) => err.push(t),
    } as unknown as CommandContext;
    await mcp.run(["token", "iphone"], ctx2);
    expect(err[0]).toMatch(/log in first/);
  });

  it("shows the endpoint and token count on a bare `mcp`", async () => {
    const { ctx, out } = makeCtx(new MemoryTokenStore());
    await mcp.run([], ctx);
    const joined = out.join("\n");
    expect(joined).toMatch(/MCP connector/);
    expect(joined).toMatch(/functions\/v1\/mcp/);
    expect(joined).toMatch(/0 active/);
  });

  it("prints just the URL for `mcp url`", async () => {
    const { ctx, out } = makeCtx(new MemoryTokenStore());
    await mcp.run(["url"], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/functions\/v1\/mcp/);
  });

  it("mints a token, shows it once, and reflects it in the count", async () => {
    const store = new MemoryTokenStore();
    const { ctx, out } = makeCtx(store);
    await mcp.run(["token", "iphone"], ctx);
    const joined = out.join("\n");
    expect(joined).toMatch(/created/);
    expect(joined).toMatch(/pia_/); // the secret is printed
    expect(joined).toMatch(/write only under inbox\//); // scope is spelled out
    expect((await store.list()).map((t) => t.label)).toEqual(["iphone"]);
  });

  it("requires a label to mint", async () => {
    const { ctx, err } = makeCtx(new MemoryTokenStore());
    await mcp.run(["token"], ctx);
    expect(err[0]).toMatch(/name the token/);
  });

  it("lists tokens, or says there are none", async () => {
    const store = new MemoryTokenStore();
    const { ctx, out } = makeCtx(store);
    await mcp.run(["tokens"], ctx);
    expect(out[0]).toMatch(/no tokens/);

    out.length = 0;
    await store.create("laptop");
    await mcp.run(["tokens"], ctx);
    expect(out[0]).toMatch(/laptop/);
    expect(out[0]).toMatch(/never used/);
  });

  it("revokes a token, and errors on an unknown label", async () => {
    const store = new MemoryTokenStore();
    await store.create("iphone");
    const { ctx, out, err } = makeCtx(store);
    await mcp.run(["revoke", "iphone"], ctx);
    expect(out[0]).toMatch(/revoked/);
    expect(await store.list()).toEqual([]);

    await mcp.run(["revoke", "ghost"], ctx);
    expect(err[0]).toMatch(/no token named/);
  });

  it("rejects an unknown subcommand", async () => {
    const { ctx, err } = makeCtx(new MemoryTokenStore());
    await mcp.run(["frobnicate"], ctx);
    expect(err[0]).toMatch(/unknown subcommand/);
  });
});
