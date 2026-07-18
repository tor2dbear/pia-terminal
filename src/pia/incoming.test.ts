import { describe, expect, it } from "vitest";
import { parseIncoming, materializeIncoming } from "./incoming.js";
import { encodePublish } from "../share/publish.js";
import { encodeShare } from "../share/share.js";
import { VFS } from "../vfs/vfs.js";

describe("parseIncoming", () => {
  it("reads a published folder (#p=) as a named folder of files", () => {
    const payload = encodePublish({
      title: "notes",
      pages: [
        { name: "a.md", content: "A" },
        { name: "b.md", content: "B" },
      ],
    });
    const incoming = parseIncoming(`#p=${payload}`);
    expect(incoming?.folder).toBe("notes");
    expect(incoming?.files.map((f) => f.name)).toEqual(["a.md", "b.md"]);
  });

  it("reads a shared file (#s=) as a single folderless file", () => {
    const payload = encodeShare({ name: "hi.txt", content: "hello" });
    const incoming = parseIncoming(`#s=${payload}`);
    expect(incoming?.folder).toBeNull();
    expect(incoming?.files).toEqual([{ name: "hi.txt", content: "hello" }]);
  });

  it("returns null when the hash carries neither", () => {
    expect(parseIncoming("#x=1")).toBeNull();
    expect(parseIncoming("")).toBeNull();
  });
});

describe("materializeIncoming", () => {
  it("lands a folder's files under ~/incoming/<folder>", () => {
    const vfs = VFS.seed();
    const dir = materializeIncoming(vfs, {
      folder: "notes",
      files: [{ name: "a.md", content: "A" }],
    });
    expect(dir).toBe("/home/guest/incoming/notes");
    expect(vfs.readFile("/home/guest/incoming/notes/a.md")).toBe("A");
  });

  it("lands a single file directly in ~/incoming", () => {
    const vfs = VFS.seed();
    const dir = materializeIncoming(vfs, {
      folder: null,
      files: [{ name: "hi.txt", content: "hello" }],
    });
    expect(dir).toBe("/home/guest/incoming");
    expect(vfs.readFile("/home/guest/incoming/hi.txt")).toBe("hello");
  });

  it("does not touch the rest of the tree", () => {
    const vfs = VFS.seed();
    materializeIncoming(vfs, { folder: null, files: [{ name: "x", content: "y" }] });
    // The seed's welcome file is untouched — materialize only adds to ~/incoming.
    expect(vfs.getNode("/home/guest/welcome.txt")).not.toBeNull();
  });
});
