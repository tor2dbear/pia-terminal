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

  it("leave drops only the caller's membership", async () => {
    const backing = MemoryShareStore.backing();
    const a = new MemoryShareStore("a@example.com", backing);
    const b = new MemoryShareStore("b@example.com", backing);
    const id = await a.create("handla", "");
    await a.invite(id, "b@example.com");
    await b.claim();
    expect((await b.mine()).length).toBe(1);

    await b.leave(id);
    expect((await b.mine()).length).toBe(0); // b left
    expect((await a.mine()).length).toBe(1); // still there for a
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

describe("MemoryShareStore (roles)", () => {
  it("makes the creator the owner and invites default to editor", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const ed = new MemoryShareStore("ed@example.com", backing);
    const id = await owner.create("handla", "");
    expect((await owner.mine())[0].role).toBe("owner");

    await owner.invite(id, "ed@example.com"); // default role
    await ed.claim();
    expect((await ed.mine())[0].role).toBe("editor");
  });

  it("carries the invited role through claim, and a viewer is read-only", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const guest = new MemoryShareStore("guest@example.com", backing);
    const id = await owner.create("handla", "[ ] milk");

    await owner.invite(id, "guest@example.com", "viewer");
    await guest.claim();
    expect((await guest.mine())[0].role).toBe("viewer");

    // A viewer can read the freshest content but cannot save (server would refuse).
    expect((await guest.get(id))?.content).toBe("[ ] milk");
    await expect(guest.save(id, "[ ] milk\n[ ] hacked")).rejects.toThrow(/read-only/);
    expect((await owner.get(id))?.content).toBe("[ ] milk"); // untouched
  });

  it("lets an editor invite but not a viewer", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const ed = new MemoryShareStore("ed@example.com", backing);
    const viewer = new MemoryShareStore("viewer@example.com", backing);
    const id = await owner.create("handla", "");
    await owner.invite(id, "ed@example.com", "editor");
    await owner.invite(id, "viewer@example.com", "viewer");
    await ed.claim();
    await viewer.claim();

    await ed.invite(id, "friend@example.com"); // editor may invite
    expect((await owner.members(id)).some((m) => m.email === "friend@example.com")).toBe(true);
    await expect(viewer.invite(id, "nope@example.com")).rejects.toThrow(/not allowed/);
  });

  it("lets only the owner remove a member or delete the list", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const ed = new MemoryShareStore("ed@example.com", backing);
    const id = await owner.create("handla", "");
    await owner.invite(id, "ed@example.com", "editor");
    await ed.claim();

    await expect(ed.removeMember(id, "owner@example.com")).rejects.toThrow(/only the owner/);
    await owner.removeMember(id, "ed@example.com");
    expect((await ed.mine()).length).toBe(0); // ed is gone

    await expect(ed.deleteList(id)).rejects.toThrow(); // not a member/owner
    await owner.deleteList(id);
    expect(await owner.get(id)).toBeNull();
  });

  it("lists members and pending invites with their roles", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const id = await owner.create("handla", "");
    await owner.invite(id, "pending@example.com", "viewer");

    const members = await owner.members(id);
    expect(members).toContainEqual({ email: "owner@example.com", role: "owner", status: "member" });
    expect(members).toContainEqual({ email: "pending@example.com", role: "viewer", status: "invited" });
  });

  it("won't let the sole owner leave a list that still has other members", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const ed = new MemoryShareStore("ed@example.com", backing);
    const id = await owner.create("handla", "");
    await owner.invite(id, "ed@example.com", "editor");
    await ed.claim();

    await expect(owner.leave(id)).rejects.toThrow(/only owner/);
    await ed.leave(id); // a non-owner can always leave
    await owner.leave(id); // now the owner is alone → allowed
    expect((await owner.mine()).length).toBe(0);
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
