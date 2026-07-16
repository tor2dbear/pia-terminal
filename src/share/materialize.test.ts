import { describe, expect, it } from "vitest";
import { VFS } from "../vfs/vfs.js";
import { MemoryShareStore } from "./store.js";
import { materializeShared } from "./materialize.js";
import { isFile } from "../vfs/types.js";

describe("materializeShared", () => {
  it("places unplaced memberships into ~/shared as linked files, idempotently", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const listId = await owner.create("handla", "[ ] milk"); // list, no extension
    const noteId = await owner.create("flowers.md", "roses");
    await owner.invite(listId, "me@example.com");
    await owner.invite(noteId, "me@example.com");

    const me = new MemoryShareStore("me@example.com", backing);
    await me.claim();

    const vfs = VFS.seed();
    vfs.home = "/home/guest";
    const placed = await materializeShared(vfs, me);
    expect(placed).toBe(2);

    // A list gains a .list name; a text file keeps its own.
    const list = vfs.getNode("/home/guest/shared/handla.list");
    const note = vfs.getNode("/home/guest/shared/flowers.md");
    expect(isFile(list!) && list.shareId).toBe(listId);
    expect(isFile(list!) && list.content).toBe("[ ] milk");
    expect(isFile(note!) && note.shareId).toBe(noteId);

    // Running again places nothing new (already linked in the tree).
    expect(await materializeShared(vfs, me)).toBe(0);
  });

  it("does nothing when sharing is unavailable", async () => {
    const vfs = VFS.seed();
    expect(await materializeShared(vfs, undefined)).toBe(0);
  });

  it("leaves a placed file where the user moved it", async () => {
    const backing = MemoryShareStore.backing();
    const owner = new MemoryShareStore("owner@example.com", backing);
    const id = await owner.create("flowers.md", "roses");
    await owner.invite(id, "me@example.com");
    const me = new MemoryShareStore("me@example.com", backing);
    await me.claim();

    const vfs = VFS.seed();
    vfs.home = "/home/guest";
    await materializeShared(vfs, me);
    vfs.mkdirp("/home/guest/notes");
    vfs.move("/home/guest/shared/flowers.md", "/home/guest/notes/blommor.md");

    // Re-materializing must not re-create it in ~/shared (still linked elsewhere).
    expect(await materializeShared(vfs, me)).toBe(0);
    expect(vfs.getNode("/home/guest/shared/flowers.md")).toBeNull();
    const moved = vfs.getNode("/home/guest/notes/blommor.md");
    expect(isFile(moved!) && moved.shareId).toBe(id);
  });
});
