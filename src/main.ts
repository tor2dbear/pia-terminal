import "./style.css";
import { VFS } from "./vfs/vfs.js";
import { LocalStorageAdapter } from "./storage/localStorage.js";
import { FakeAuthAdapter } from "./auth/fakeAuth.js";
import { buildRegistry } from "./commands/index.js";
import { Terminal } from "./terminal/terminal.js";
import { boot } from "./boot.js";
import { cloudConfig } from "./config.js";
import { parseShareHash } from "./share/share.js";
import type { StorageAdapter } from "./storage/adapter.js";
import type { AuthAdapter } from "./auth/adapter.js";

/**
 * Choose the storage + auth adapters. With Supabase configured, guests stay on
 * localStorage and logged-in users get cloud storage + real auth; otherwise
 * everything is local and auth is faked. The Supabase modules load only in the
 * cloud branch, so the base bundle never pays for them when it is off.
 */
async function makeAdapters(): Promise<{
  adapter: StorageAdapter;
  auth: AuthAdapter;
}> {
  if (!cloudConfig) {
    return { adapter: new LocalStorageAdapter(), auth: new FakeAuthAdapter() };
  }
  const [{ createSupabase }, { SupabaseAuthAdapter }, { SupabaseStorageAdapter }, { HybridStorageAdapter }] =
    await Promise.all([
      import("./supabase/client.js"),
      import("./supabase/auth.js"),
      import("./supabase/storage.js"),
      import("./supabase/hybrid.js"),
    ]);
  const client = await createSupabase(cloudConfig);
  return {
    auth: new SupabaseAuthAdapter(client),
    adapter: new HybridStorageAdapter(
      new LocalStorageAdapter(),
      new SupabaseStorageAdapter(client),
      client,
    ),
  };
}

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
  const { adapter, auth } = await makeAdapters();
  const saved = await adapter.load();
  let vfs: VFS;
  if (saved) {
    vfs = new VFS(saved);
  } else {
    vfs = VFS.seed();
    // Persist the fresh seed only for the local/guest case. Never auto-write a
    // blank tree to the cloud on boot — a transient load miss must not clobber
    // a logged-in user's saved files. A genuinely new cloud user's tree is
    // persisted by their first real mutation instead.
    if (!cloudConfig) await adapter.save(vfs.root);
  }

  const session = (await auth.current()) ?? { user: "guest" };

  const registry = buildRegistry();

  const term = new Terminal(root, { vfs, adapter, registry, auth, session });
  await boot(term);

  // Opened via a share link? Show the shared file (read-only) after boot.
  const shared = parseShareHash(location.hash);
  if (shared) {
    term.print();
    term.print(`— shared file: ${shared.name} —`, "accent");
    for (const line of shared.content.split("\n")) term.print(line);
    term.print();
    term.print("(read-only preview — type 'help' to explore)", "dim");
  }
}

void main();
