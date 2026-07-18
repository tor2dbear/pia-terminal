import { describe, expect, it } from "vitest";
import { VFS, VfsError, HOME } from "./vfs.js";
import { isDir, isFile } from "./types.js";

describe("VFS share links", () => {
  it("links and unlinks a file, and survives writes and moves", () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/flowers.md", "roses");
    vfs.link("/home/guest/flowers.md", "cloud-1");

    const node = vfs.getNode("/home/guest/flowers.md");
    expect(isFile(node!) && node.shareId).toBe("cloud-1");

    // A write (e.g. refreshing the cache on save) keeps the link.
    vfs.writeFile("/home/guest/flowers.md", "roses\ntulips");
    const afterWrite = vfs.getNode("/home/guest/flowers.md");
    expect(isFile(afterWrite!) && afterWrite.shareId).toBe("cloud-1");

    // Moving the file (mv) keeps the link — the path changes, not the share.
    vfs.mkdirp("/home/guest/garden");
    vfs.move("/home/guest/flowers.md", "/home/guest/garden/flowers.md");
    const moved = vfs.getNode("/home/guest/garden/flowers.md");
    expect(isFile(moved!) && moved.shareId).toBe("cloud-1");

    vfs.unlink("/home/guest/garden/flowers.md");
    const unlinked = vfs.getNode("/home/guest/garden/flowers.md");
    expect(isFile(unlinked!) && unlinked.shareId).toBeUndefined();
  });

  it("collects shareIds under a path (for rm = leave)", () => {
    const vfs = VFS.seed();
    vfs.mkdirp("/home/guest/a/b");
    vfs.writeFile("/home/guest/a/x.md", "1");
    vfs.link("/home/guest/a/x.md", "id-1");
    vfs.writeFile("/home/guest/a/b/y.md", "2");
    vfs.link("/home/guest/a/b/y.md", "id-2");
    vfs.writeFile("/home/guest/a/plain.txt", "3"); // not linked

    expect(vfs.shareIdsUnder("/home/guest/a").sort()).toEqual(["id-1", "id-2"]);
    expect(vfs.shareIdsUnder("/home/guest/a/x.md")).toEqual(["id-1"]);
    expect(vfs.shareIdsUnder("/home/guest/a/plain.txt")).toEqual([]);
  });

  it("round-trips shareId through serialization", () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/f.md", "x");
    vfs.link("/home/guest/f.md", "cloud-9");
    const reloaded = new VFS(JSON.parse(JSON.stringify(vfs.root)));
    const node = reloaded.getNode("/home/guest/f.md");
    expect(isFile(node!) && node.shareId).toBe("cloud-9");
  });
});

describe("VFS.resolve", () => {
  const vfs = VFS.seed();

  it("resolves relative paths against cwd", () => {
    expect(vfs.resolve("/home/guest", "notes")).toBe("/home/guest/notes");
  });

  it("handles . and ..", () => {
    expect(vfs.resolve("/home/guest", "..")).toBe("/home");
    expect(vfs.resolve("/home/guest", "../..")).toBe("/");
    expect(vfs.resolve("/home/guest", "./a/./b")).toBe("/home/guest/a/b");
  });

  it("does not climb above root", () => {
    expect(vfs.resolve("/", "../../..")).toBe("/");
  });

  it("expands a leading ~", () => {
    expect(vfs.resolve("/", "~")).toBe(HOME);
    expect(vfs.resolve("/", "~/notes")).toBe(`${HOME}/notes`);
  });

  it("treats absolute input as absolute", () => {
    expect(vfs.resolve("/home/guest", "/etc/x")).toBe("/etc/x");
  });
});

describe("VFS operations", () => {
  it("seeds a home directory with a welcome file", () => {
    const vfs = VFS.seed();
    const home = vfs.getNode(HOME);
    expect(home && isDir(home)).toBe(true);
    expect(vfs.readFile(`${HOME}/welcome.txt`)).toContain("welcome");
  });

  it("mkdir/touch/cat round-trips", () => {
    const vfs = VFS.seed();
    vfs.mkdir(`${HOME}/proj`);
    vfs.writeFile(`${HOME}/proj/a.txt`, "hello");
    expect(vfs.readFile(`${HOME}/proj/a.txt`)).toBe("hello");
    const node = vfs.getNode(`${HOME}/proj/a.txt`);
    expect(node && isFile(node)).toBe(true);
  });

  it("mkdir rejects duplicates and missing parents", () => {
    const vfs = VFS.seed();
    vfs.mkdir(`${HOME}/x`);
    expect(() => vfs.mkdir(`${HOME}/x`)).toThrow(VfsError);
    expect(() => vfs.mkdir(`${HOME}/nope/y`)).toThrow(VfsError);
  });

  it("touch leaves existing files untouched", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "keep");
    vfs.touch(`${HOME}/a.txt`);
    expect(vfs.readFile(`${HOME}/a.txt`)).toBe("keep");
  });

  it("refuses to remove a non-empty dir without recursive", () => {
    const vfs = VFS.seed();
    vfs.mkdir(`${HOME}/d`);
    vfs.writeFile(`${HOME}/d/f`, "x");
    expect(() => vfs.remove(`${HOME}/d`)).toThrow(VfsError);
    vfs.remove(`${HOME}/d`, true);
    expect(vfs.getNode(`${HOME}/d`)).toBeNull();
  });

  it("lists directories before files, each sorted by name", () => {
    const vfs = new VFS({ type: "dir", name: "", children: {} });
    vfs.writeFile("/b.txt", "");
    vfs.writeFile("/a.txt", "");
    vfs.mkdir("/z");
    vfs.mkdir("/m");
    expect(vfs.list("/").map((n) => n.name)).toEqual(["m", "z", "a.txt", "b.txt"]);
  });

  it("move renames a file", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "data");
    vfs.move(`${HOME}/a.txt`, `${HOME}/b.txt`);
    expect(vfs.getNode(`${HOME}/a.txt`)).toBeNull();
    expect(vfs.readFile(`${HOME}/b.txt`)).toBe("data");
  });

  it("copy duplicates a file independently of the original", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "data");
    vfs.copy(`${HOME}/a.txt`, `${HOME}/b.txt`);
    expect(vfs.readFile(`${HOME}/a.txt`)).toBe("data"); // original stays
    expect(vfs.readFile(`${HOME}/b.txt`)).toBe("data");
    vfs.writeFile(`${HOME}/b.txt`, "changed");
    expect(vfs.readFile(`${HOME}/a.txt`)).toBe("data"); // not a shared reference
  });

  it("copy into an existing directory keeps the name", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "data");
    vfs.mkdir(`${HOME}/dir`);
    vfs.copy(`${HOME}/a.txt`, `${HOME}/dir`);
    expect(vfs.readFile(`${HOME}/dir/a.txt`)).toBe("data");
    expect(vfs.readFile(`${HOME}/a.txt`)).toBe("data");
  });

  it("copy needs -r for a directory and deep-clones the tree", () => {
    const vfs = VFS.seed();
    vfs.mkdirp(`${HOME}/src/sub`);
    vfs.writeFile(`${HOME}/src/x.txt`, "1");
    vfs.writeFile(`${HOME}/src/sub/y.txt`, "2");
    expect(() => vfs.copy(`${HOME}/src`, `${HOME}/dst`)).toThrow(VfsError);
    vfs.copy(`${HOME}/src`, `${HOME}/dst`, true);
    expect(vfs.readFile(`${HOME}/dst/x.txt`)).toBe("1");
    expect(vfs.readFile(`${HOME}/dst/sub/y.txt`)).toBe("2");
    vfs.writeFile(`${HOME}/dst/x.txt`, "changed"); // mutate the copy
    expect(vfs.readFile(`${HOME}/src/x.txt`)).toBe("1"); // original untouched
  });

  it("copy refuses to nest a directory inside itself", () => {
    const vfs = VFS.seed();
    vfs.mkdirp(`${HOME}/d`);
    expect(() => vfs.copy(`${HOME}/d`, `${HOME}/d/inner`, true)).toThrow(VfsError);
  });

  it("a copied file drops the cloud share link", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "data");
    vfs.link(`${HOME}/a.txt`, "cloud-9");
    vfs.copy(`${HOME}/a.txt`, `${HOME}/b.txt`);
    const copy = vfs.getNode(`${HOME}/b.txt`);
    expect(isFile(copy!) && copy.shareId === undefined).toBe(true);
  });

  it("copy refuses to overwrite a file with a directory", () => {
    const vfs = VFS.seed();
    vfs.mkdirp(`${HOME}/src`);
    vfs.writeFile(`${HOME}/dest`, "keep");
    expect(() => vfs.copy(`${HOME}/src`, `${HOME}/dest`, true)).toThrow(VfsError);
    expect(vfs.readFile(`${HOME}/dest`)).toBe("keep"); // file untouched
  });

  it("copy refuses to overwrite a shared (cloud-linked) destination", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "new");
    vfs.writeFile(`${HOME}/shared.txt`, "old");
    vfs.link(`${HOME}/shared.txt`, "cloud-1");
    expect(() => vfs.copy(`${HOME}/a.txt`, `${HOME}/shared.txt`)).toThrow(VfsError);
    expect(vfs.readFile(`${HOME}/shared.txt`)).toBe("old"); // link + content intact
  });

  it("copy -r merges into an existing directory, keeping its files", () => {
    const vfs = VFS.seed();
    vfs.mkdirp(`${HOME}/src`);
    vfs.writeFile(`${HOME}/src/new.txt`, "1");
    vfs.mkdirp(`${HOME}/dst/src`);
    vfs.writeFile(`${HOME}/dst/src/keep.txt`, "old");
    vfs.copy(`${HOME}/src`, `${HOME}/dst`, true); // dst exists → copy into dst/src
    expect(vfs.readFile(`${HOME}/dst/src/keep.txt`)).toBe("old"); // preserved by merge
    expect(vfs.readFile(`${HOME}/dst/src/new.txt`)).toBe("1"); // added
  });

  it("move into an existing directory keeps the name", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "data");
    vfs.mkdir(`${HOME}/dir`);
    vfs.move(`${HOME}/a.txt`, `${HOME}/dir`);
    expect(vfs.readFile(`${HOME}/dir/a.txt`)).toBe("data");
  });
});
