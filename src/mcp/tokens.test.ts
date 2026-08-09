import { describe, expect, it } from "vitest";
import {
  describeWriteScope,
  generateToken,
  hashToken,
  MemoryTokenStore,
  normalizeScopeDir,
  NullTokenStore,
  type TokenStore,
} from "./tokens.js";

describe("token helpers", () => {
  it("generates prefixed, high-entropy, unique tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^pia_[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars
    expect(a).not.toBe(b);
  });

  it("hashes deterministically to 64 hex chars, and never reveals the token", async () => {
    const token = generateToken();
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toContain(token);
    expect(await hashToken(generateToken())).not.toBe(h1);
  });
});

describe("NullTokenStore (guest)", () => {
  it("is unavailable, has no URL, mints nothing", async () => {
    const store: TokenStore = new NullTokenStore();
    expect(store.available()).toBe(false);
    expect(store.connectorUrl()).toBeNull();
    expect(await store.list()).toEqual([]);
    expect(await store.revoke("x")).toBe(false);
    await expect(store.create("x")).rejects.toThrow(/cloud account/);
  });
});

describe("MemoryTokenStore", () => {
  it("mints a token shown once, then lists it by label (never the secret)", async () => {
    const store = new MemoryTokenStore();
    const token = await store.create("iphone");
    expect(token).toMatch(/^pia_/);
    const list = await store.list();
    expect(list.map((t) => t.label)).toEqual(["iphone"]);
    // The listing carries metadata, not the secret.
    expect(JSON.stringify(list)).not.toContain(token);
  });

  it("rejects a duplicate label", async () => {
    const store = new MemoryTokenStore();
    await store.create("iphone");
    await expect(store.create("iphone")).rejects.toThrow(/already exists/);
  });

  it("revokes by label and reports whether one matched", async () => {
    const store = new MemoryTokenStore();
    await store.create("iphone");
    expect(await store.revoke("nope")).toBe(false);
    expect(await store.revoke("iphone")).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("lists newest first", async () => {
    const store = new MemoryTokenStore();
    await store.create("one");
    await store.create("two");
    expect((await store.list()).map((t) => t.label)).toEqual(["two", "one"]);
  });

  it("defaults a token's write scope to inbox, and records a custom one", async () => {
    const store = new MemoryTokenStore();
    await store.create("default");
    await store.create("wide", ["docs", "notes"]);
    await store.create("readonly", []);
    const byLabel = Object.fromEntries((await store.list()).map((t) => [t.label, t.writeScope]));
    expect(byLabel.default).toEqual(["inbox"]);
    expect(byLabel.wide).toEqual(["docs", "notes"]);
    expect(byLabel.readonly).toEqual([]);
  });
});

describe("normalizeScopeDir", () => {
  it("maps home-ish inputs to '.' and cleans real dirs", () => {
    for (const whole of ["", ".", "~", "/", "~/"]) expect(normalizeScopeDir(whole)).toBe(".");
    expect(normalizeScopeDir("docs")).toBe("docs");
    expect(normalizeScopeDir("/docs/")).toBe("docs");
    expect(normalizeScopeDir("~/docs/notes")).toBe("docs/notes");
  });
  it("rejects traversal segments", () => {
    expect(normalizeScopeDir("../etc")).toBeNull();
    expect(normalizeScopeDir("docs/../secret")).toBeNull();
  });
});

describe("describeWriteScope", () => {
  it("phrases each shape", () => {
    expect(describeWriteScope(["inbox"])).toMatch(/write inbox\//);
    expect(describeWriteScope([])).toMatch(/read-only/);
    expect(describeWriteScope(["."])).toMatch(/all of home/);
    expect(describeWriteScope(["docs", "notes"])).toMatch(/docs\/, notes\//);
  });
});
