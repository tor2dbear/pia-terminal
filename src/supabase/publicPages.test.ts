import { describe, expect, it, vi } from "vitest";
import { SupabasePublicPagesStore } from "./publicPages.js";
import type { SupabaseLike } from "./client.js";

/**
 * A fake that records the upsert payload and the delete's `.in` path list, and
 * serves a fixed set of "currently live" rows from select — enough to check the
 * replace-all wiring (upsert present, delete absent) without a real database.
 */
function fakeClient(opts: {
  uid?: string | null;
  live?: { path: string }[];
  upsert?: ReturnType<typeof vi.fn>;
  deleteIn?: ReturnType<typeof vi.fn>;
}): SupabaseLike {
  const liveRows = (opts.live ?? []).map((r) => ({
    path: r.path,
    content: "x",
    html: "<p>x</p>",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  }));
  return {
    auth: {
      async getSession() {
        return { data: { session: opts.uid ? { user: { id: opts.uid } } : null } };
      },
    },
    from() {
      return {
        upsert: opts.upsert ?? (async () => ({ data: null, error: null })),
        delete() {
          return {
            eq() {
              return {
                in: opts.deleteIn ?? (async () => ({ data: null, error: null })),
              };
            },
          };
        },
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
  it("refuses to publish without a session", async () => {
    const store = new SupabasePublicPagesStore(fakeClient({ uid: null }));
    await expect(store.publish("tor", [])).rejects.toThrow(/account/i);
  });

  it("upserts the pages with owner + onConflict handle,path", async () => {
    const upsert = vi.fn(async () => ({ data: null, error: null }));
    const store = new SupabasePublicPagesStore(fakeClient({ uid: "u1", live: [], upsert }));
    const n = await store.publish("tor", [
      { path: "index.md", content: "hi", html: "<p>hi</p>" },
    ]);
    expect(n).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      [{ owner: "u1", handle: "tor", path: "index.md", content: "hi", html: "<p>hi</p>" }],
      { onConflict: "handle,path" },
    );
  });

  it("deletes only the paths no longer present (replace-all)", async () => {
    const deleteIn = vi.fn(async () => ({ data: null, error: null }));
    // Live set has a.md + b.md; we publish only a.md → b.md must be deleted.
    const store = new SupabasePublicPagesStore(
      fakeClient({ uid: "u1", live: [{ path: "a.md" }, { path: "b.md" }], deleteIn }),
    );
    await store.publish("tor", [{ path: "a.md", content: "A", html: "<p>A</p>" }]);
    expect(deleteIn).toHaveBeenCalledWith("path", ["b.md"]);
  });

  it("does not delete when nothing was removed", async () => {
    const deleteIn = vi.fn(async () => ({ data: null, error: null }));
    const store = new SupabasePublicPagesStore(
      fakeClient({ uid: "u1", live: [{ path: "a.md" }], deleteIn }),
    );
    await store.publish("tor", [{ path: "a.md", content: "A", html: "<p>A</p>" }]);
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("clears everything when publishing an empty set", async () => {
    const deleteIn = vi.fn(async () => ({ data: null, error: null }));
    const store = new SupabasePublicPagesStore(
      fakeClient({ uid: "u1", live: [{ path: "a.md" }, { path: "b.md" }], deleteIn }),
    );
    const n = await store.publish("tor", []);
    expect(n).toBe(0);
    expect(deleteIn).toHaveBeenCalledWith("path", ["a.md", "b.md"]);
  });

  it("list maps rows and sorts by path", async () => {
    const store = new SupabasePublicPagesStore(
      fakeClient({ uid: "u1", live: [{ path: "b.md" }, { path: "a.md" }] }),
    );
    const list = await store.list("tor");
    expect(list.map((p) => p.path)).toEqual(["a.md", "b.md"]);
    expect(list[0].createdAt).toBe("2026-01-01");
  });
});
