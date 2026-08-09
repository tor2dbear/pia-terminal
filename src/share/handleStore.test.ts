import { describe, expect, it } from "vitest";
import { MemoryHandleStore, NullHandleStore } from "./handleStore.js";

describe("NullHandleStore (guest)", () => {
  const store = new NullHandleStore();
  it("is unavailable and holds nothing", async () => {
    expect(store.available()).toBe(false);
    expect(await store.mine()).toBeNull();
    expect(await store.isAvailable("tor")).toBe(false);
  });
  it("refuses to claim, pointing at login", async () => {
    await expect(store.claim("tor")).rejects.toThrow(/account/i);
  });
});

describe("MemoryHandleStore", () => {
  it("starts with no handle", async () => {
    const store = new MemoryHandleStore("u1");
    expect(await store.mine()).toBeNull();
  });

  it("claims a free handle and reports it", async () => {
    const store = new MemoryHandleStore("u1");
    await store.claim("tor2dbear");
    expect(await store.mine()).toBe("tor2dbear");
  });

  it("normalises to lowercase on claim and lookup", async () => {
    const store = new MemoryHandleStore("u1");
    await store.claim("Tor2dbear");
    expect(await store.mine()).toBe("tor2dbear");
    expect(await store.isAvailable("TOR2DBEAR")).toBe(false);
  });

  it("rejects an invalid or reserved handle", async () => {
    const store = new MemoryHandleStore("u1");
    await expect(store.claim("a")).rejects.toThrow(/invalid handle/i);
    await expect(store.claim("api")).rejects.toThrow(/reserved/i);
    expect(await store.mine()).toBeNull();
  });

  it("is idempotent when re-claiming the same handle", async () => {
    const store = new MemoryHandleStore("u1");
    await store.claim("tor");
    await expect(store.claim("tor")).resolves.toBeUndefined();
    expect(await store.mine()).toBe("tor");
  });

  it("refuses a second, different handle (one identity)", async () => {
    const store = new MemoryHandleStore("u1");
    await store.claim("tor");
    await expect(store.claim("bjorn")).rejects.toThrow(/already publish as ~tor/i);
  });

  it("lets exactly one of two racing users win the same name", async () => {
    const db = MemoryHandleStore.backing();
    const a = new MemoryHandleStore("u1", db);
    const b = new MemoryHandleStore("u2", db);

    expect(await a.isAvailable("shared-name")).toBe(true);
    expect(await b.isAvailable("shared-name")).toBe(true);

    await a.claim("shared-name");
    expect(await b.isAvailable("shared-name")).toBe(false);
    await expect(b.claim("shared-name")).rejects.toThrow(/taken/i);

    expect(await a.mine()).toBe("shared-name");
    expect(await b.mine()).toBeNull();
    // b can still take a different one.
    await b.claim("other-name");
    expect(await b.mine()).toBe("other-name");
  });

  it("isAvailable is false for a taken name, true for a fresh valid one", async () => {
    const db = MemoryHandleStore.backing();
    const a = new MemoryHandleStore("u1", db);
    await a.claim("tor");
    const b = new MemoryHandleStore("u2", db);
    expect(await b.isAvailable("tor")).toBe(false);
    expect(await b.isAvailable("tor2")).toBe(true);
  });
});
