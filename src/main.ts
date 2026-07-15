import "./style.css";
import { VFS } from "./vfs/vfs.js";
import { LocalStorageAdapter } from "./storage/localStorage.js";
import { FakeAuthAdapter } from "./auth/fakeAuth.js";
import { buildRegistry } from "./commands/index.js";
import { Terminal } from "./terminal/terminal.js";
import { boot } from "./boot.js";

/** Carry saves from the old "vera:" keys over to "pia:" after the rename. */
function migrateLegacyKeys(): void {
  const renames: [from: string, to: string][] = [
    ["vera:fs:v1", "pia:fs:v1"],
    ["vera:session:v1", "pia:session:v1"],
  ];
  for (const [from, to] of renames) {
    const value = localStorage.getItem(from);
    if (value !== null && localStorage.getItem(to) === null) {
      localStorage.setItem(to, value);
    }
    localStorage.removeItem(from);
  }
}

async function main(): Promise<void> {
  const root = document.getElementById("screen");
  if (!root) throw new Error("missing #screen element");

  migrateLegacyKeys();
  const adapter = new LocalStorageAdapter();
  const saved = await adapter.load();
  const vfs = saved ? new VFS(saved) : VFS.seed();
  if (!saved) await adapter.save(vfs.root);

  const auth = new FakeAuthAdapter();
  const session = (await auth.current()) ?? { user: "guest" };

  const registry = buildRegistry();

  const term = new Terminal(root, { vfs, adapter, registry, auth, session });
  await boot(term);
}

void main();
