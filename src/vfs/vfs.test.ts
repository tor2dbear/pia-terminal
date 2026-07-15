import { describe, expect, it } from "vitest";
import { VFS, VfsError, HOME } from "./vfs.js";
import { isDir, isFile } from "./types.js";

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
    expect(vfs.readFile(`${HOME}/welcome.txt`)).toContain("välkommen");
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

  it("move into an existing directory keeps the name", () => {
    const vfs = VFS.seed();
    vfs.writeFile(`${HOME}/a.txt`, "data");
    vfs.mkdir(`${HOME}/dir`);
    vfs.move(`${HOME}/a.txt`, `${HOME}/dir`);
    expect(vfs.readFile(`${HOME}/dir/a.txt`)).toBe("data");
  });
});
