/** A single file: a name and its text content. */
export interface FileNode {
  type: "file";
  name: string;
  content: string;
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
