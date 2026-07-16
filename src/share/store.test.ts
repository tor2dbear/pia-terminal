import { describe, expect, it } from "vitest";
import { MemoryShareStore, NullShareStore } from "./store.js";

describe("MemoryShareStore (invite/claim flow)", () => {
  it("shares a list between two users once the invite is claimed", async () => {
    const backing = MemoryShareStore.backing();
    const me = new MemoryShareStore("me@example.com", backing);
    const wife = new MemoryShareStore("wife@example.com", backing);

    const id = await me.create("handla", "[ ] mjölk");
    await me.invite(id, "wife@example.com");

    // Before claiming, the invitee sees nothing.
    expect(await wife.mine()).toEqual([]);

    const claimed = await wife.claim();
    expect(claimed).toBe(1);

    const hers = await wife.mine();
    expect(hers.map((l) => l.name)).toEqual(["handla"]);

    // An edit by one is visible to the other (shared backing).
    await wife.save(id, "[ ] mjölk\n[ ] ost");
    const mine = await me.mine();
    expect(mine[0].content).toBe("[ ] mjölk\n[ ] ost");
  });

  it("notifies live-sync subscribers on save, until unsubscribed", async () => {
    const backing = MemoryShareStore.backing();
    const a = new MemoryShareStore("a@example.com", backing);
    const b = new MemoryShareStore("b@example.com", backing);
    const id = await a.create("handla", "");

    const seen: string[] = [];
    const unsubscribe = b.subscribe(id, (c) => seen.push(c));
    await a.save(id, "[ ] milk");
    expect(seen).toEqual(["[ ] milk"]);

    unsubscribe();
    await a.save(id, "[ ] milk\n[ ] ost");
    expect(seen).toEqual(["[ ] milk"]); // nothing after unsubscribe
  });

  it("claims invites case-insensitively and only once", async () => {
    const backing = MemoryShareStore.backing();
    const me = new MemoryShareStore("me@example.com", backing);
    const her = new MemoryShareStore("her@example.com", backing);

    const id = await me.create("handla", "");
    await me.invite(id, "HER@example.com");

    expect(await her.claim()).toBe(1);
    expect(await her.claim()).toBe(0); // nothing left to claim
    expect((await her.mine()).length).toBe(1);
  });
});

describe("NullShareStore", () => {
  it("reports unavailable and stays empty", async () => {
    const s = new NullShareStore();
    expect(s.available()).toBe(false);
    expect(await s.mine()).toEqual([]);
    expect(await s.claim()).toBe(0);
    await expect(s.create()).rejects.toThrow();
  });
});
