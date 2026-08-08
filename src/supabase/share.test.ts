import { describe, expect, it } from "vitest";
import { SupabaseShareStore } from "./share.js";
import type { SupabaseLike } from "./client.js";

/**
 * A tiny fake of the PostgREST surface the share store touches, focused on the
 * one subtlety RLS introduces: an UPDATE a viewer isn't allowed to make is
 * *filtered out* (zero rows affected) rather than erroring. `updatable` models
 * whether the current caller may edit the row.
 */
function fakeClient(updatable: boolean): SupabaseLike {
  return {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: "u1" } } } };
      },
    },
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                // `.select()` after the update returns the rows it touched —
                // empty when RLS filtered the row out.
                async select() {
                  return { data: updatable ? [{ id: "list-1" }] : [], error: null };
                },
                // bare await (no .select) — unused by save() now, but keep it thenable.
                then(resolve: (v: unknown) => void) {
                  resolve({ data: null, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;
}

describe("SupabaseShareStore.save (RLS-aware)", () => {
  it("succeeds when the caller may edit (a row comes back)", async () => {
    const store = new SupabaseShareStore(fakeClient(true));
    await expect(store.save("list-1", "[ ] milk")).resolves.toBeUndefined();
  });

  it("throws when the update is filtered to zero rows (a viewer's write)", async () => {
    const store = new SupabaseShareStore(fakeClient(false));
    await expect(store.save("list-1", "[ ] milk")).rejects.toThrow(/read-only/);
  });
});
