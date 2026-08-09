import { describe, expect, it, vi } from "vitest";
import { SupabaseHandleStore } from "./handles.js";
import type { SupabaseLike } from "./client.js";

/** A fake of the narrow PostgREST/RPC surface the handle store touches. */
function fakeClient(opts: {
  uid?: string | null;
  row?: { handle: string } | null;
  rpcError?: string;
  rpc?: ReturnType<typeof vi.fn>;
}): SupabaseLike {
  return {
    auth: {
      async getSession() {
        return { data: { session: opts.uid ? { user: { id: opts.uid } } : null } };
      },
    },
    rpc:
      opts.rpc ??
      (async () => ({ data: opts.row?.handle ?? null, error: opts.rpcError ? { message: opts.rpcError } : null })),
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: opts.row ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;
}

describe("SupabaseHandleStore", () => {
  it("mine returns the claimed handle", async () => {
    const store = new SupabaseHandleStore(fakeClient({ uid: "u1", row: { handle: "tor" } }));
    expect(await store.mine()).toBe("tor");
  });

  it("mine is null for a guest (no session)", async () => {
    const store = new SupabaseHandleStore(fakeClient({ uid: null }));
    expect(await store.mine()).toBeNull();
  });

  it("isAvailable is false when a row exists, true when none", async () => {
    const taken = new SupabaseHandleStore(fakeClient({ uid: "u1", row: { handle: "tor" } }));
    expect(await taken.isAvailable("tor")).toBe(false);
    const free = new SupabaseHandleStore(fakeClient({ uid: "u1", row: null }));
    expect(await free.isAvailable("tor")).toBe(true);
  });

  it("isAvailable is false for a malformed name without a round trip", async () => {
    const rpc = vi.fn();
    const store = new SupabaseHandleStore(fakeClient({ uid: "u1", row: null, rpc }));
    expect(await store.isAvailable("a")).toBe(false); // too short
  });

  it("claim rejects a malformed name locally, before any RPC", async () => {
    const rpc = vi.fn();
    const store = new SupabaseHandleStore(fakeClient({ uid: "u1", rpc }));
    await expect(store.claim("BAD_NAME")).rejects.toThrow(/invalid handle/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("claim calls claim_handle and surfaces the server error (e.g. taken)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "~tor is taken" } }));
    const store = new SupabaseHandleStore(fakeClient({ uid: "u1", rpc }));
    await expect(store.claim("tor")).rejects.toThrow(/taken/i);
    expect(rpc).toHaveBeenCalledWith("claim_handle", { p_handle: "tor" });
  });
});
