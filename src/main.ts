import "./style.css";
import { VFS } from "./vfs/vfs.js";
import { LocalStorageAdapter } from "./storage/localStorage.js";
import { FakeAuthAdapter } from "./auth/fakeAuth.js";
import { buildRegistry } from "./commands/index.js";
import { Terminal } from "./terminal/terminal.js";
import { TabManager } from "./terminal/tabs.js";
import type { CommandContext } from "./commands/registry.js";
import { piaExtendContext } from "./pia/context.js";
import { boot } from "./boot.js";
import { loadTerminalConfig } from "./pia/terminalConfig.js";
import { parseConfig } from "./pia/rc.js";
import { appendHistory, hasSecret, parseHistory, serializeHistory } from "./pia/history.js";
import { seedSystemFiles, readMotd } from "./pia/etc.js";
import { cloudConfig } from "./config.js";
import { finishConnect, isConnectCallback, isConnectRequest, renderConnect } from "./mcp/connect.js";
import { parseIncoming, materializeIncoming } from "./pia/incoming.js";
import { createScheduler } from "./pia/scheduler.js";
import { commandPackage, registerInstalled, seedDefaultPackages } from "./packages/catalog.js";
import { NullShareStore } from "./share/store.js";
import { NullReminderStore, pushSupported, ensureServiceWorker } from "./pia/reminders.js";
import { NullTokenStore } from "./mcp/tokens.js";
import { materializeShared } from "./share/materialize.js";
import { loadAnalytics } from "./analytics.js";
import type { StorageAdapter } from "./storage/adapter.js";
import type { AuthAdapter } from "./auth/adapter.js";
import type { ShareStore } from "./share/store.js";
import type { ReminderStore } from "./pia/reminders.js";
import type { TokenStore } from "./mcp/tokens.js";

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
  tokens: TokenStore;
}> {
  if (!cloudConfig) {
    return {
      adapter: new LocalStorageAdapter(),
      auth: new FakeAuthAdapter(),
      share: new NullShareStore(),
      reminders: new NullReminderStore(),
      tokens: new NullTokenStore(),
    };
  }
  const [
    { createSupabase },
    { SupabaseAuthAdapter },
    { SupabaseStorageAdapter },
    { HybridStorageAdapter },
    { SupabaseShareStore },
    { SupabaseReminderStore },
    { SupabaseTokenStore },
  ] = await Promise.all([
    import("./supabase/client.js"),
    import("./supabase/auth.js"),
    import("./supabase/storage.js"),
    import("./supabase/hybrid.js"),
    import("./supabase/share.js"),
    import("./supabase/reminders.js"),
    import("./supabase/tokens.js"),
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
    tokens: new SupabaseTokenStore(client, cloudConfig.url),
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

  // MCP connector OAuth. Two hops land back on the app:
  //  - the final callback: `/authorize` issued a code and sent us here to hand it
  //    to the client (a script navigation, unconstrained by form-action);
  //  - the authorize request: render the connect form instead of booting.
  if (cloudConfig && isConnectCallback()) {
    finishConnect();
    return;
  }
  if (cloudConfig && isConnectRequest()) {
    renderConnect(root, `${cloudConfig.url.replace(/\/$/, "")}/functions/v1/mcp/authorize`);
    return;
  }

  migrateLegacyKeys();
  const { adapter, auth, share, reminders, tokens } = await makeAdapters();

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
  // The system tree is read-only to ordinary commands — `rm /etc/motd` is
  // `permission denied`. The seeder writes it elevated (see seedSystemFiles);
  // `sudo` will be the user-facing escape hatch (roadmap/permissions.md).
  vfs.protectedPaths = ["/etc"];
  // Abandon any legacy cloud link on a now-protected file (from before /etc was
  // read-only), so a guarded `linkedSave` can't change the cloud then fail.
  for (const p of vfs.protectedPaths) vfs.detachLinksUnder(p);

  const session = (await auth.current()) ?? { user: "guest" };

  const registry = buildRegistry();

  // The window multiplexer — declared up here so the persist helpers below can
  // reach a live window. Assigned once the spawn factory exists.
  let tabs: TabManager | undefined;

  // One shared debounced persist of the shared tree — NOT one timer per window,
  // since every window writes to the same VFS. History writes to the VFS on each
  // command (below); coalescing the save keeps a burst of read-only commands from
  // hammering storage. The save runs through a live window's `flush()` — the
  // terminal's conflict-reconciling persist — so a concurrent cloud write from
  // another device is merged (keep-both), never clobbered. Flushed synchronously
  // before an account swap and on dispose (via `flushPending`, injected into every
  // window), and best-effort on unload.
  const HISTORY_PERSIST_MS = 1500;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  // Serialize saves onto a single chain so two never run concurrently (which
  // would race the cloud adapter's shared base version / VFS reconciliation).
  // Each `runPersist` appends to the tail; `flushPending` awaits the whole tail.
  let persistChain: Promise<void> = Promise.resolve();
  const runPersist = (): Promise<void> => {
    // Best-effort: a transient (non-conflict) save failure is swallowed rather
    // than retried — localStorage (guests, Hybrid's local half) is synchronous
    // so it still lands; a dropped cloud write is re-attempted by the next
    // command's save. (A documented v1 limit; see roadmap/history-persistence.md.)
    persistChain = persistChain
      .catch(() => {})
      .then(() => (tabs?.idleWindow() ?? tabs?.current())?.flush() ?? Promise.resolve());
    return persistChain;
  };
  const scheduleHistoryPersist = (): void => {
    if (persistTimer !== undefined) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      void runPersist().catch(() => {});
    }, HISTORY_PERSIST_MS);
  };
  // Complete any pending *and* in-flight persist before returning. Awaiting the
  // serialized tail matters at an account transition: the debounce may have fired
  // (clearing the timer) but not settled, and the swap must not change identity /
  // replace the VFS while a save is still running under the old routing. Loops so
  // a persist chained during the await is awaited too.
  const flushPending = async (): Promise<void> => {
    let tail: Promise<void>;
    do {
      if (persistTimer !== undefined) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
        void runPersist().catch(() => {});
      }
      tail = persistChain;
      await tail.catch(() => {});
    } while (tail !== persistChain);
  };
  // Best-effort backstop for the last read-only command(s) if the tab closes
  // inside the debounce window: localStorage (guests, and the Hybrid adapter's
  // local half) writes synchronously, so those survive; a cloud-only save can't
  // finish during unload — an accepted browser limit, since mutating commands and
  // account switches already persist synchronously.
  window.addEventListener("beforeunload", () => void flushPending());

  // Per-window HISTFILE plumbing (`~/.pia/history`), behind the Terminal's
  // load/save/clear history seam. Reading + appending to the on-disk file (rather
  // than overwriting from memory) is bash's `histappend`, and it's what lets two
  // windows share one file without clobbering each other's lines. Writing to the
  // VFS is all these do; the Terminal owns persisting the tree.
  const histPath = (): string => `${vfs.home}/.pia/history`;
  const readHistFile = (): string[] => {
    const node = vfs.getNode(histPath());
    return node?.type === "file" ? parseHistory(vfs.readFile(histPath())) : [];
  };
  // Something other than a file sitting at the history path (e.g. a user did
  // `mkdir ~/.pia/history`): don't try to write there — `writeFile` would throw
  // "is a directory" on every command. Degrade to no persistence rather than
  // clobber the node or brick the shell; history works again once it's gone.
  const histPathBlocked = (): boolean => {
    const node = vfs.getNode(histPath());
    return node !== null && node.type !== "file";
  };
  const makeHistoryIO = () => {
    // How many of this window's in-memory entries are already merged into the
    // file — additions since then are what gets appended. Reset on (re)load.
    let flushed = 0;
    return {
      load: (): string[] => {
        const lines = readHistFile();
        flushed = lines.length;
        return lines;
      },
      save: (history: readonly string[]): void => {
        const additions = history.slice(flushed);
        if (additions.length === 0 || histPathBlocked()) return;
        flushed = history.length;
        vfs.mkdirp(`${vfs.home}/.pia`);
        vfs.writeFile(histPath(), serializeHistory(appendHistory(readHistFile(), additions)));
      },
      clear: (): void => {
        flushed = 0;
        if (histPathBlocked()) return;
        vfs.mkdirp(`${vfs.home}/.pia`);
        vfs.writeFile(histPath(), "");
      },
    };
  };

  // Windows (tmux-lite): every window is a Terminal built by this factory, all
  // sharing the one machine — the same VFS, adapter, registry and account. New
  // windows are spawned by `tmux` / Ctrl-B c; only the first one boots.
  const spawn = (pane: HTMLElement): Terminal<CommandContext> => {
    const hist = makeHistoryIO();
    return new Terminal<CommandContext>(pane, {
      vfs,
      adapter,
      registry,
      session,
      configure: () => loadTerminalConfig(vfs),
      loadHistory: hist.load,
      saveHistory: hist.save,
      clearHistory: hist.clear,
      // Keep secrets out of the persisted (and synced) history: `passwd`,
      // `login`, `useradd`/`register` take a password inline, so their whole
      // line is excluded — bash's HISTIGNORE, applied so a reload/up-arrow/`cat
      // ~/.pia/history` can never surface a plaintext password.
      histIgnore: hasSecret,
      // Persist the shared tree after a history write (debounced), and let a
      // window flush the one shared pending save before it swaps the account
      // tree or is disposed.
      onHistoryWrite: scheduleHistoryPersist,
      flushPending,
      // Command-not-found → a `brew install` hint when the name is a known but
      // not-yet-installed package command (Debian's command-not-found idiom).
      // Names the package, which can differ from the command (`mines` →
      // minesweeper). Unknown names fall through to the generic message.
      describeUnknownCommand: (name) => {
        const pkg = commandPackage(name);
        return pkg ? `${name}: not installed — run \`brew install ${pkg}\`` : null;
      },
      // PIA's half of the command context — the auth backend, share store, app
      // URL for share links, and the window multiplexer (for `tmux`). The engine
      // supplies the core (fs, io, config, file bridges); this adds PIA's fields.
      extendContext: piaExtendContext(auth, share, undefined, reminders, tabs, tokens),
      // login/logout/usermod mutate the shared session + VFS; re-home the other
      // windows so their cwd/config follow the account too.
      onAccountChange: () => {
        // login/logout/useradd reload the account's saved tree, which may predate
        // /etc — re-seed it and drop any legacy cloud links on protected paths so
        // the system files survive an account switch (and can't be edited via the
        // cloud).
        seedSystemFiles(vfs);
        for (const p of vfs.protectedPaths) vfs.detachLinksUnder(p);
        tabs?.rehomeAll();
      },
      // …and hold other windows from starting a command mid-transition.
      isLocked: () => tabs?.inTransition() ?? false,
    });
  };
  tabs = new TabManager(root, spawn);
  const term = tabs.open(); // the first window — the one that boots below
  // Gate input from the moment the terminal exists: registering installed
  // packages below does async work (dynamic imports), and boot should own the
  // prompt that whole time — not only once it starts printing.
  term.setBooting(true);
  // Give a never-configured home its default packages (man, tutor) so the boot
  // greeting's `tutor`/`man pia` pointers work — for the active home, whether
  // that's a guest, a returning guest, or a logged-in user. No-op once a home
  // has used `brew`, so uninstalls stick. Then re-register whatever's installed
  // (vfs.home is set now) so it survives a reload — before boot, so it's ready
  // when the prompt appears.
  seedDefaultPackages(vfs, vfs.home);
  await registerInstalled(vfs, vfs.home, registry);
  // Seed the little /etc system tree (motd, os-release) — global, not per-home,
  // and idempotent, so it's there for guests and logged-in users alike.
  seedSystemFiles(vfs);
  // The BIOS/POST preamble is an opt-in retro flourish read from ~/.pia/config
  // (seeded above by the Terminal's config load), consumed only here at boot.
  const rcNode = vfs.getNode(`${vfs.home}/.pia/config`);
  const bios =
    rcNode?.type === "file" ? parseConfig(vfs.readFile(`${vfs.home}/.pia/config`)).bios === true : false;
  await boot(term, { bios, motd: readMotd(vfs) });

  // Turn pending invites into memberships, then place any not-yet-placed shares
  // into ~/shared/ as real linked files, so files shared with this user show up
  // in their tree (ls/cat/nano/mv) right after they log in.
  if (share.available()) {
    // Arriving via a share/invite magic link proves inbox control (the session's
    // `amr`), so record it before claiming — an invited user who clicked the link
    // is verified automatically and their list appears with no extra step.
    try {
      await share.confirmEmailControl?.();
    } catch {
      /* an ordinary password session isn't proof — that's fine */
    }
    try {
      const claimed = await share.claim();
      const placed = await materializeShared(vfs, share);
      if (placed > 0) {
        await adapter.save(vfs.root);
        term.print(
          `(${placed} shared file${placed === 1 ? "" : "s"} in ~/shared — \`ls ~/shared\`)`,
          "dim",
        );
      } else if (claimed === 0) {
        // Nothing claimed: if lists are waiting but the email is unverified, the
        // claim was gated — nudge instead of leaving them wondering.
        const pending = (await share.pendingInvites?.()) ?? 0;
        if (pending > 0) {
          term.print(
            `(${pending} list${pending === 1 ? "" : "s"} shared with you — run \`verify\` to accept)`,
            "dim",
          );
        }
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
  // Boot and post-boot setup are done — now it's safe to open more windows.
  tabs.markReady();

  const scheduler = createScheduler({
    vfs,
    // Fire into an *idle* window (a busy one would drop the job); fall back to
    // the current/first window if every window is busy.
    run: (command) => (tabs?.idleWindow() ?? tabs?.current() ?? term).fireScheduled(command),
    persist: () => adapter.save(vfs.root),
  });
  setInterval(() => void scheduler.tick(new Date()), 1000);
}

void main();
