import { type DirNode, type FileNode, type VNode, isDir, isFile } from "./types.js";

export const HOME = "/home/guest";

/** Thrown by VFS operations; message is safe to print to the terminal. */
export class VfsError extends Error {}

/**
 * A virtual filesystem: an in-memory tree of directories and files.
 *
 * The VFS never touches storage directly. It exposes plain operations
 * (ls/mkdir/read/write/…) over a tree; persistence is the caller's job via a
 * StorageAdapter, which serializes {@link root}.
 */
export class VFS {
  /** The current user's home directory, that `~` expands to. Session state,
   *  not part of the serialized tree — the terminal sets it on login/logout. */
  home = HOME;

  constructor(public root: DirNode) {}

  /** A fresh default tree with a home directory and a welcome file. */
  static seed(): VFS {
    const root: DirNode = { type: "dir", name: "", children: {} };
    const vfs = new VFS(root);
    vfs.mkdirp(HOME);
    vfs.writeFile(
      `${HOME}/welcome.txt`,
      [
        "hello and welcome.",
        "",
        "this is your home. create files with `touch`, folders with `mkdir`,",
        "read them with `cat`, edit them with `nano`. type `help` for everything.",
        "",
      ].join("\n"),
    );
    return vfs;
  }

  /** Resolve `input` (absolute, relative, or ~-prefixed) against `cwd`. */
  resolve(cwd: string, input: string): string {
    let path = input.trim();
    if (path === "~" || path.startsWith("~/")) {
      path = this.home + path.slice(1);
    }
    const start = path.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
    const segments = [...start, ...path.split("/")];
    const out: string[] = [];
    for (const seg of segments) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        out.pop();
        continue;
      }
      out.push(seg);
    }
    return "/" + out.join("/");
  }

  /** Return the node at an absolute path, or null if nothing is there. */
  getNode(absPath: string): VNode | null {
    if (absPath === "/") return this.root;
    const parts = absPath.split("/").filter(Boolean);
    let current: VNode = this.root;
    for (const part of parts) {
      if (!isDir(current)) return null;
      const next: VNode | undefined = current.children[part];
      if (!next) return null;
      current = next;
    }
    return current;
  }

  /** Return the directory at an absolute path, or throw a printable error. */
  getDir(absPath: string): DirNode {
    const node = this.getNode(absPath);
    if (!node) throw new VfsError(`no such directory: ${absPath}`);
    if (!isDir(node)) throw new VfsError(`not a directory: ${absPath}`);
    return node;
  }

  private parentOf(absPath: string): { parent: DirNode; name: string } {
    const parts = absPath.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) throw new VfsError("cannot operate on root");
    const parent = this.getDir("/" + parts.join("/"));
    return { parent, name };
  }

  /** Create a directory; error if the parent is missing or the name is taken. */
  mkdir(absPath: string): void {
    const { parent, name } = this.parentOf(absPath);
    if (parent.children[name]) {
      throw new VfsError(`already exists: ${absPath}`);
    }
    parent.children[name] = { type: "dir", name, children: {} };
  }

  /** Create a directory and any missing ancestors (like `mkdir -p`). */
  mkdirp(absPath: string): void {
    const parts = absPath.split("/").filter(Boolean);
    let node = this.root;
    for (const part of parts) {
      const child = node.children[part];
      if (child) {
        if (!isDir(child)) throw new VfsError(`not a directory: ${part}`);
        node = child;
      } else {
        const dir: DirNode = { type: "dir", name: part, children: {} };
        node.children[part] = dir;
        node = dir;
      }
    }
  }

  /** Create an empty file if absent; a no-op if it already exists. */
  touch(absPath: string): void {
    const existing = this.getNode(absPath);
    if (existing) {
      if (isDir(existing)) throw new VfsError(`is a directory: ${absPath}`);
      return;
    }
    this.writeFile(absPath, "");
  }

  /** Write (creating or overwriting) a file's content. Preserves a cloud link. */
  writeFile(absPath: string, content: string): void {
    const { parent, name } = this.parentOf(absPath);
    const existing = parent.children[name];
    if (existing && isDir(existing)) {
      throw new VfsError(`is a directory: ${absPath}`);
    }
    const file: FileNode = { type: "file", name, content };
    // Keep the share link across writes (e.g. when a save refreshes the cache).
    if (existing && isFile(existing) && existing.shareId !== undefined) {
      file.shareId = existing.shareId;
    }
    parent.children[name] = file;
  }

  /** Link a file to a cloud shared object — sharing is a property, not a move. */
  link(absPath: string, shareId: string): void {
    const node = this.getNode(absPath);
    if (!node || !isFile(node)) throw new VfsError(`not a file: ${absPath}`);
    node.shareId = shareId;
  }

  /** Drop a file's cloud link (leave the share); the local content stays. */
  unlink(absPath: string): void {
    const node = this.getNode(absPath);
    if (node && isFile(node)) delete node.shareId;
  }

  /** Read a file's content, or throw a printable error. */
  readFile(absPath: string): string {
    const node = this.getNode(absPath);
    if (!node) throw new VfsError(`no such file: ${absPath}`);
    if (isDir(node)) throw new VfsError(`is a directory: ${absPath}`);
    return node.content;
  }

  /** Remove a file or directory. Directories require `recursive`. */
  remove(absPath: string, recursive = false): void {
    const node = this.getNode(absPath);
    if (!node) throw new VfsError(`no such file or directory: ${absPath}`);
    if (isDir(node) && Object.keys(node.children).length > 0 && !recursive) {
      throw new VfsError(`is a directory (use -r): ${absPath}`);
    }
    const { parent, name } = this.parentOf(absPath);
    delete parent.children[name];
  }

  /** Move/rename a node from one absolute path to another. */
  move(fromPath: string, toPath: string): void {
    const node = this.getNode(fromPath);
    if (!node) throw new VfsError(`no such file or directory: ${fromPath}`);

    // If the destination is an existing directory, move *into* it.
    let dest = toPath;
    const destNode = this.getNode(toPath);
    if (destNode && isDir(destNode)) {
      dest = (toPath === "/" ? "" : toPath) + "/" + node.name;
    }

    const { parent: destParent, name: destName } = this.parentOf(dest);
    if (destParent.children[destName] && isDir(destParent.children[destName])) {
      throw new VfsError(`already exists: ${dest}`);
    }
    const { parent: srcParent, name: srcName } = this.parentOf(fromPath);
    delete srcParent.children[srcName];
    node.name = destName;
    destParent.children[destName] = node;
  }

  /** shareIds of the node at `absPath` and everything under it (for `rm`). */
  shareIdsUnder(absPath: string): string[] {
    const node = this.getNode(absPath);
    if (!node) return [];
    const ids: string[] = [];
    const walk = (n: VNode): void => {
      if (isFile(n)) {
        if (n.shareId !== undefined) ids.push(n.shareId);
        return;
      }
      for (const child of Object.values(n.children)) walk(child);
    };
    walk(node);
    return ids;
  }

  /** Every cloud shareId currently linked somewhere in the tree. */
  linkedShareIds(): Set<string> {
    const ids = new Set<string>();
    const walk = (node: VNode): void => {
      if (isFile(node)) {
        if (node.shareId !== undefined) ids.add(node.shareId);
        return;
      }
      for (const child of Object.values(node.children)) walk(child);
    };
    walk(this.root);
    return ids;
  }

  /** List a directory's entries, sorted with directories first. */
  list(absPath: string): VNode[] {
    const dir = this.getDir(absPath);
    return Object.values(dir.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
}
