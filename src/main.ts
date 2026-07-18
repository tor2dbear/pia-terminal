import "./style.css";
import { VFS } from "./vfs/vfs.js";
import { LocalStorageAdapter } from "./storage/localStorage.js";
import { FakeAuthAdapter } from "./auth/fakeAuth.js";
import { buildRegistry } from "./commands/index.js";
import { Terminal } from "./terminal/terminal.js";
import { boot } from "./boot.js";
import { loadTerminalConfig } from "./pia/terminalConfig.js";
import { cloudConfig } from "./config.js";
import { parseShareHash } from "./share/share.js";
import { NullShareStore } from "./share/store.js";
import { materializeShared } from "./share/materialize.js";
import type { StorageAdapter } from "./storage/adapter.js";
import type { AuthAdapter } from "./auth/adapter.js";
import type { ShareStore } from "./share/store.js";

/**
 * Choose the storage + auth adapters. With Supabase configured, guests stay on
 * localStorage and logged-in users get cloud storage + real auth; otherwise
 * everything is local and auth is faked. The Supabase modules load only in the
 * cloud branch, so the base bundle never pays for them when it is off.
 */
async function makeAdapters(): Promise<{
  adapter: StorageAdapter;
  auth: AuthAdapter;
  share: ShareStore;
}> {
  if (!cloudConfig) {
    return {
      adapter: new LocalStorageAdapter(),
      auth: new FakeAuthAdapter(),
      share: new NullShareStore(),
    };
  }
  const [
    { createSupabase },
    { SupabaseAuthAdapter },
    { SupabaseStorageAdapter },
    { HybridStorageAdapter },
    { SupabaseShareStore },
  ] = await Promise.all([
    import("./supabase/client.js"),
    import("./supabase/auth.js"),
    import("./supabase/storage.js"),
    import("./supabase/hybrid.js"),
    import("./supabase/share.js"),
  ]);
  const client = await createSupabase(cloudConfig);
  return {
    auth: new SupabaseAuthAdapter(client),
    adapter: new HybridStorageAdapter(
      new LocalStorageAdapter(),
      new SupabaseStorageAdapter(client),
      client,
    ),
    share: new SupabaseShareStore(client),
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
  const { adapter, auth, share } = await makeAdapters();
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

  const term = new Terminal(root, {
    vfs,
    adapter,
    registry,
    auth,
    session,
    share,
    configure: () => loadTerminalConfig(vfs),
  });
  await boot(term);

  // Turn pending invites into memberships, then place any not-yet-placed shares
  // into ~/shared/ as real linked files, so files shared with this user show up
  // in their tree (ls/cat/nano/mv) right after they log in.
  if (share.available()) {
    try {
      await share.claim();
      const placed = await materializeShared(vfs, share);
      if (placed > 0) {
        await adapter.save(vfs.root);
        term.print(
          `(${placed} shared file${placed === 1 ? "" : "s"} in ~/shared — \`ls ~/shared\`)`,
          "dim",
        );
      }
    } catch {
      /* not logged in / offline — nothing to claim or place */
    }
  }

  // A fresh magic-link account has no username or password yet. Make that
  // visible (it can otherwise feel like "I just clicked a link", not "I have an
  // account") and point at how to finish setting it up.
  try {
    if (await auth.needsSetup?.()) {
      term.print();
      term.print(`you have an account here, signed in as ${session.user}.`, "accent");
      term.print("make it yours: `usermod <name>` to pick a name, `passwd <pw>` to set a password.", "dim");
    }
  } catch {
    /* best-effort hint only */
  }

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
