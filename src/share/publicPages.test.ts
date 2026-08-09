import { describe, expect, it } from "vitest";
import {
  type PublicPagesStore,
  MemoryPublicPagesStore,
  NullPublicPagesStore,
} from "./publicPages.js";

const page = (path: string, body: string) => ({
  path,
  content: body,
  html: `<p>${body}</p>`,
});

describe("NullPublicPagesStore (guest)", () => {
  const store: PublicPagesStore = new NullPublicPagesStore();
  it("is unavailable and holds nothing", async () => {
    expect(store.available()).toBe(false);
    expect(await store.list("tor")).toEqual([]);
  });
  it("refuses to publish, pointing at login", async () => {
    await expect(store.publish("tor", [page("index.md", "hi")])).rejects.toThrow(/account/i);
  });
});

describe("MemoryPublicPagesStore", () => {
  it("publishes a set and lists it back (sorted by path)", async () => {
    const store = new MemoryPublicPagesStore();
    const n = await store.publish("tor", [page("b.md", "B"), page("index.md", "I")]);
    expect(n).toBe(2);
    const list = await store.list("tor");
    expect(list.map((p) => p.path)).toEqual(["b.md", "index.md"]);
    expect(list[1].html).toBe("<p>I</p>");
  });

  it("replaces the whole set — absent paths are removed", async () => {
    const store = new MemoryPublicPagesStore();
    await store.publish("tor", [page("a.md", "A"), page("b.md", "B")]);
    await store.publish("tor", [page("a.md", "A2")]); // b.md dropped
    const list = await store.list("tor");
    expect(list.map((p) => p.path)).toEqual(["a.md"]);
    expect(list[0].content).toBe("A2");
  });

  it("preserves createdAt across a republish but bumps updatedAt", async () => {
    const store = new MemoryPublicPagesStore();
    await store.publish("tor", [page("index.md", "v1")]);
    const [before] = await store.list("tor");
    await store.publish("tor", [page("index.md", "v2")]);
    const [after] = await store.list("tor");
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).not.toBe(before.updatedAt);
    expect(after.content).toBe("v2");
  });

  it("keeps handles in separate namespaces", async () => {
    const db = MemoryPublicPagesStore.backing();
    const a = new MemoryPublicPagesStore(db);
    const b = new MemoryPublicPagesStore(db);
    await a.publish("alice", [page("index.md", "A")]);
    await b.publish("bob", [page("index.md", "B")]);
    expect((await a.list("alice"))[0].content).toBe("A");
    expect((await a.list("bob"))[0].content).toBe("B");
    expect(await a.list("carol")).toEqual([]);
  });

  it("publishing an empty set clears the namespace", async () => {
    const store = new MemoryPublicPagesStore();
    await store.publish("tor", [page("index.md", "x")]);
    expect(await store.publish("tor", [])).toBe(0);
    expect(await store.list("tor")).toEqual([]);
  });
});
