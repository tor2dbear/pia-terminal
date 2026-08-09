import { describe, expect, it, vi } from "vitest";
import { SupabasePublicPagesStore } from "./publicPages.js";
import type { SupabaseLike } from "./client.js";

/**
 * A fake of the narrow surface the projection touches: the `publish_pages` RPC
 * (the only write path) and a select for reads. Records the RPC args so we can
 * assert the replace-all payload is handed to the server verbatim.
 */
function fakeClient(opts: {
  live?: { path: string }[];
  rpc?: ReturnType<typeof vi.fn>;
}): SupabaseLike {
  const liveRows = (opts.live ?? []).map((r) => ({
    path: r.path,
    content: "x",
    html: "<p>x</p>",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  }));
  return {
    rpc: opts.rpc ?? (async () => ({ data: liveRows.length, error: null })),
    from() {
      return {
        select() {
          return {
            async eq() {
              return { data: liveRows, error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;
}

describe("SupabasePublicPagesStore", () => {
  it("publishes through the publish_pages RPC with the full page set", async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    const store = new SupabasePublicPagesStore(fakeClient({ rpc }));
    const n = await store.publish("tor", [
      { path: "index.md", content: "hi", html: "<p>hi</p>" },
    ]);
    expect(n).toBe(1);
    expect(rpc).toHaveBeenCalledWith("publish_pages", {
      p_handle: "tor",
      p_pages: [{ path: "index.md", content: "hi", html: "<p>hi</p>" }],
    });
  });

  it("passes an empty set to the RPC (clears the site) without special-casing", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const store = new SupabasePublicPagesStore(fakeClient({ rpc }));
    const n = await store.publish("tor", []);
    expect(n).toBe(0);
    expect(rpc).toHaveBeenCalledWith("publish_pages", { p_handle: "tor", p_pages: [] });
  });

  it("surfaces an RPC error (e.g. not your handle)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "not your handle: ~tor" } }));
    const store = new SupabasePublicPagesStore(fakeClient({ rpc }));
    await expect(store.publish("tor", [])).rejects.toThrow(/not your handle/i);
  });

  it("list maps rows and sorts by path", async () => {
    const store = new SupabasePublicPagesStore(
      fakeClient({ live: [{ path: "b.md" }, { path: "a.md" }] }),
    );
    const list = await store.list("tor");
    expect(list.map((p) => p.path)).toEqual(["a.md", "b.md"]);
    expect(list[0].createdAt).toBe("2026-01-01");
  });
});
