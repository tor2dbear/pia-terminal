import { describe, expect, it } from "vitest";
import type { DirNode } from "../vfs/types.js";
import type { SupabaseLike } from "./client.js";
import { SupabaseAuthAdapter } from "./auth.js";
import { SupabaseStorageAdapter } from "./storage.js";
import { HybridStorageAdapter } from "./hybrid.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";

/** A minimal in-memory stand-in for the Supabase client. */
function stubClient(): SupabaseLike {
  let user: { id: string; email: string } | null = null;
  const rows: Record<string, DirNode> = {};
  const client = {
    auth: {
      async getUser() {
        return { data: { user } };
      },
      async getSession() {
        return { data: { session: user ? { user: { id: user.id } } : null } };
      },
      async signInWithPassword({ email }: { email: string; password: string }) {
        user = { id: `uid:${email}`, email };
        return { data: { user }, error: null };
      },
      async signUp({ email }: { email: string; password: string }) {
        user = { id: `uid:${email}`, email };
        return { data: { user }, error: null };
      },
      async signOut() {
        user = null;
        return { error: null };
      },
    },
    from() {
      return {
        select() {
          return {
            eq(_col: string, uid: string) {
              return {
                async maybeSingle() {
                  const tree = rows[uid];
                  return { data: tree ? { tree } : null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: Record<string, unknown>) {
          rows[row.user_id as string] = row.tree as DirNode;
          return { error: null };
        },
      };
    },
  };
  return client as unknown as SupabaseLike;
}

const tree = (): DirNode => ({ type: "dir", name: "", children: {} });

describe("SupabaseAuthAdapter", () => {
  it("has no session until you log in", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    expect(await auth.current()).toBeNull();
  });

  it("logs in and reports a short handle from the email", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    const session = await auth.login("pia@example.com", "secret");
    expect(session.user).toBe("pia");
    expect(await auth.current()).toEqual({ user: "pia" });
  });

  it("requires a password", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    await expect(auth.login("pia@example.com")).rejects.toThrow(/password/);
  });

  it("registers, then logs out", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    await auth.register("new@example.com", "secret");
    expect(await auth.current()).toEqual({ user: "new" });
    await auth.logout();
    expect(await auth.current()).toBeNull();
  });
});

describe("SupabaseStorageAdapter", () => {
  it("is empty and inert for a guest", async () => {
    const store = new SupabaseStorageAdapter(stubClient());
    expect(await store.load()).toBeNull();
    await store.save(tree()); // no-op, must not throw
    expect(await store.load()).toBeNull();
  });

  it("round-trips a tree for a logged-in user", async () => {
    const client = stubClient();
    await client.auth.signInWithPassword({ email: "a@b.c", password: "x" });
    const store = new SupabaseStorageAdapter(client);
    const t = tree();
    t.children["notes.txt"] = { type: "file", name: "notes.txt", content: "hi" };
    await store.save(t);
    const loaded = await store.load();
    expect(loaded?.children["notes.txt"]).toBeDefined();
  });
});

describe("HybridStorageAdapter", () => {
  it("routes to local for guests and cloud once authed", async () => {
    const client = stubClient();
    const local = new MemoryStorageAdapter();
    const cloud = new SupabaseStorageAdapter(client);
    const hybrid = new HybridStorageAdapter(local, cloud, client);

    const guestTree = tree();
    guestTree.children["local.txt"] = { type: "file", name: "local.txt", content: "" };
    await hybrid.save(guestTree);
    expect((await local.load())?.children["local.txt"]).toBeDefined();
    expect(await cloud.load()).toBeNull(); // nothing went to the cloud

    await client.auth.signInWithPassword({ email: "a@b.c", password: "x" });
    const userTree = tree();
    userTree.children["cloud.txt"] = { type: "file", name: "cloud.txt", content: "" };
    await hybrid.save(userTree);
    expect((await hybrid.load())?.children["cloud.txt"]).toBeDefined();
    expect((await cloud.load())?.children["cloud.txt"]).toBeDefined();
  });
});
