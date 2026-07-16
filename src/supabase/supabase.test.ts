import { describe, expect, it } from "vitest";
import type { DirNode } from "../vfs/types.js";
import type { SupabaseLike } from "./client.js";
import { SupabaseAuthAdapter } from "./auth.js";
import { SupabaseStorageAdapter } from "./storage.js";
import { HybridStorageAdapter } from "./hybrid.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";

/** A minimal in-memory stand-in for the Supabase client. */
interface StubUser {
  id: string;
  email: string;
  user_metadata: { username?: string };
}

function stubClient(): SupabaseLike {
  let user: StubUser | null = null;
  const rows: Record<string, DirNode> = {};
  const client = {
    auth: {
      async getUser() {
        return { data: { user } };
      },
      async getSession() {
        return { data: { session: user ? { user } : null } };
      },
      async signInWithPassword({ email }: { email: string; password: string }) {
        user = { id: `uid:${email}`, email, user_metadata: {} };
        return { data: { user }, error: null };
      },
      async signInWithOtp() {
        // A real OTP only logs in once the emailed link is clicked; here it just
        // "sends". Tests that care about the arguments override this.
        return { error: null };
      },
      async signUp({
        email,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        user = { id: `uid:${email}`, email, user_metadata: options?.data ?? {} };
        return { data: { user }, error: null };
      },
      async updateUser({ data }: { data?: Record<string, unknown> }) {
        if (user) user.user_metadata = { ...user.user_metadata, ...data };
        return { error: null };
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

  it("reports the user from the session even if getUser() flakes", async () => {
    const client = stubClient();
    await client.auth.signInWithPassword({ email: "pia@example.com", password: "x" });
    // Simulate a flaky network getUser — current() must not depend on it
    // (this is what dropped a magic-link login back to guest).
    (client.auth as { getUser: unknown }).getUser = async () => ({
      data: { user: null },
    });
    const auth = new SupabaseAuthAdapter(client);
    expect(await auth.current()).toEqual({ user: "pia" });
  });

  it("registers with a chosen username stored as metadata", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    await auth.register("tor2dbear", "new@example.com", "secret");
    expect(await auth.current()).toEqual({ user: "tor2dbear" });
  });

  it("requires email + password to register", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    await expect(auth.register("tor2dbear")).rejects.toThrow(/email and password/);
  });

  it("renames the current user via metadata", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    await auth.register("old", "a@b.c", "secret");
    await auth.rename("tor2dbear");
    expect(await auth.current()).toEqual({ user: "tor2dbear" });
  });

  it("logs out", async () => {
    const auth = new SupabaseAuthAdapter(stubClient());
    await auth.register("x", "new@example.com", "secret");
    await auth.logout();
    expect(await auth.current()).toBeNull();
  });

  it("sets a password via updateUser", async () => {
    const client = stubClient();
    const calls: Array<{ password?: string }> = [];
    client.auth.updateUser = async (attrs) => {
      calls.push(attrs);
      return { error: null };
    };
    const auth = new SupabaseAuthAdapter(client);
    await auth.setPassword!("hunter2");
    expect(calls[0]?.password).toBe("hunter2");
  });

  it("flags a fresh (username-less) account as needing setup", async () => {
    const client = stubClient();
    await client.auth.signInWithPassword({ email: "new@example.com", password: "x" });
    const auth = new SupabaseAuthAdapter(client);
    expect(await auth.needsSetup!()).toBe(true);
    await auth.rename("torbjorn"); // picks a username
    expect(await auth.needsSetup!()).toBe(false);
  });

  it("sends a magic-link invite that creates the account on click", async () => {
    const client = stubClient();
    const calls: Array<{
      email: string;
      options?: { shouldCreateUser?: boolean; emailRedirectTo?: string };
    }> = [];
    client.auth.signInWithOtp = async (c) => {
      calls.push(c);
      return { error: null };
    };
    const auth = new SupabaseAuthAdapter(client);
    await auth.inviteByEmail!("wife@example.com", "https://app.example/pia/");
    expect(calls).toHaveLength(1);
    expect(calls[0].email).toBe("wife@example.com");
    expect(calls[0].options).toMatchObject({
      shouldCreateUser: true,
      emailRedirectTo: "https://app.example/pia/",
    });
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

  it("loads off the session id even if getUser() fails (no clobber)", async () => {
    const client = stubClient();
    await client.auth.signInWithPassword({ email: "a@b.c", password: "x" });
    const store = new SupabaseStorageAdapter(client);
    const t = tree();
    t.children["keep.txt"] = { type: "file", name: "keep.txt", content: "x" };
    await store.save(t);
    // Simulate a flaky network getUser — load must not depend on it.
    (client.auth as { getUser: unknown }).getUser = async () => ({
      data: { user: null },
    });
    const loaded = await store.load();
    expect(loaded?.children["keep.txt"]).toBeDefined();
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
