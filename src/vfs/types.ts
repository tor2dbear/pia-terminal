/**
 * A single file: a name and its text content.
 *
 * A file may be *linked* to a cloud-shared object by `shareId`. When it is,
 * `content` is a local cache of that object's last-known content — the file
 * stays wherever it lives in the tree (sharing is a property, not a move), and
 * opening it reads/writes through the share backend. Absent `shareId`, the file
 * is a plain local file and `content` is the source of truth.
 */
export interface FileNode {
  type: "file";
  name: string;
  content: string;
  /** Cloud shared-object id this file is linked to (undefined for local files). */
  shareId?: string;
}

/** A directory: a name and a map of child name → node. */
export interface DirNode {
  type: "dir";
  name: string;
  children: Record<string, VNode>;
}

/** Anything in the filesystem is either a file or a directory. */
export type VNode = FileNode | DirNode;

export function isDir(node: VNode): node is DirNode {
  return node.type === "dir";
}

export function isFile(node: VNode): node is FileNode {
  return node.type === "file";
}
