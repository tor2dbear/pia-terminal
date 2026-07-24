import "./style.css";
import { VFS } from "./vfs/vfs.js";
import { LocalStorageAdapter } from "./storage/localStorage.js";
import { FakeAuthAdapter } from "./auth/fakeAuth.js";
import { buildRegistry } from "./commands/index.js";
import { Terminal } from "./terminal/terminal.js";
import type { CommandContext } from "./commands/registry.js";
import { piaExtendContext } from "./pia/context.js";
import { boot } from "./boot.js";
import { loadTerminalConfig } from "./pia/terminalConfig.js";
import { cloudConfig } from "./config.js";
import { parseIncoming, materializeIncoming } from "./pia/incoming.js";
import { createScheduler } from "./pia/scheduler.js";
import { registerInstalled } from "./packages/catalog.js";
import { NullShareStore } from "./share/store.js";
import { NullReminderStore, pushSupported, ensureServiceWorker } from "./pia/reminders.js";
import { materializeShared } from "./share/materialize.js";
import { loadAnalytics } from "./analytics.js";
import type { StorageAdapter } from "./storage/adapter.js";
import type { AuthAdapter } from "./auth/adapter.js";
import type { ShareStore } from "./share/store.js";
import type { ReminderStore } from "./pia/reminders.js";

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
  reminders: ReminderStore;
}> {
  if (!cloudConfig) {
    return {
      adapter: new LocalStorageAdapter(),
      auth: new FakeAuthAdapter(),
      share: new NullShareStore(),
      reminders: new NullReminderStore(),
    };
  }
  const [
    { createSupabase },
    { SupabaseAuthAdapter },
    { SupabaseStorageAdapter },
    { HybridStorageAdapter },
    { SupabaseShareStore },
    { SupabaseReminderStore },
  ] = await Promise.all([
    import("./supabase/client.js"),
    import("./supabase/auth.js"),
    import("./supabase/storage.js"),
    import("./supabase/hybrid.js"),
    import("./supabase/share.js"),
    import("./supabase/reminders.js"),
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
    reminders: new SupabaseReminderStore(client),
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
  // Cloudflare Web Analytics — production host only, so dev and preview don't
  // pollute the property (see analytics.ts). Fire-and-forget, never gates boot.
  loadAnalytics();

  const root = document.getElementById("screen");
  if (!root) throw new Error("missing #screen element");

  migrateLegacyKeys();
  const { adapter, auth, share, reminders } = await makeAdapters();

  // Register the service worker so PIA is installable (a PWA) and can receive
  // push. Best-effort and non-blocking — it never gates boot.
  if (pushSupported()) void ensureServiceWorker().catch(() => {});
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

  const term = new Terminal<CommandContext>(root, {
    vfs,
    adapter,
    registry,
    session,
    configure: () => loadTerminalConfig(vfs),
    // PIA's half of the command context — the auth backend, share store and app
    // URL for share links. The engine supplies the core (fs, io, config, file
    // bridges); this adds the PIA-specific fields.
    extendContext: piaExtendContext(auth, share, undefined, reminders),
  });
  // Re-register any brew-installed packages (vfs.home is set now) so they
  // survive a reload — before boot, so they're ready when the prompt appears.
  await registerInstalled(vfs, vfs.home, registry);
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

  // Opened via a share/publish link? Drop the content into ~/incoming in *this*
  // session (in memory — nothing is saved), then land there and `ls` it. It's a
  // scratch inbox: the recipient keeps what they want with `cp`, so opening a
  // link never silently writes to their account.
  const incoming = parseIncoming(location.hash);
  if (incoming) {
    const dir = materializeIncoming(vfs, incoming);
    const rel = dir.replace(vfs.home, "~");
    const label = incoming.folder ?? incoming.files[0]?.name ?? "content";
    const n = incoming.files.length;
    term.print();
    term.print(`received: ${label}`, "accent");
    term.print(
      `${n} file${n === 1 ? "" : "s"} in ${rel} — not saved. keep with \`cp\`, e.g. \`cp ${rel}/${incoming.files[0]?.name ?? ""} ~/\``,
      "dim",
    );
    await term.exec(`cd ${rel}`);
    await term.exec("ls");
  }

  // Drive `at`/`crontab` jobs while the tab is open. One-second tick; the
  // scheduler reads the jobs from ~/.pia and fires the due ones through the
  // terminal. (Firing only while open is the honest limit of the learning tool.)
  const scheduler = createScheduler({
    vfs,
    run: (command) => term.fireScheduled(command),
    persist: () => adapter.save(vfs.root),
  });
  setInterval(() => void scheduler.tick(new Date()), 1000);
}

void main();
