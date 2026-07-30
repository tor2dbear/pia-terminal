// @vitest-environment jsdom
//
// The cloud-conflict reconcile path: when a save collides with a newer write
// from another device, the terminal must adopt the remote tree, stash the local
// version under ~/.pia/conflicts/ (losing nothing), and say so — never silently
// overwrite. Driven through the real Terminal + a stub adapter that conflicts
// once.
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "./terminal.js";
import { VFS } from "../vfs/vfs.js";
import { StorageConflictError, type StorageAdapter } from "../storage/adapter.js";
import type { DirNode } from "../vfs/types.js";
import { buildRegistry } from "../commands/index.js";
import { piaExtendContext } from "../pia/context.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Reports a conflict (carrying `remote`) on its first save, then persists. */
class ConflictOnceAdapter implements StorageAdapter {
  private conflicted = false;
  saved: DirNode | null = null;
  constructor(private readonly remote: DirNode) {}
  async load(): Promise<DirNode | null> {
    return null;
  }
  async save(root: DirNode): Promise<void> {
    if (!this.conflicted) {
      this.conflicted = true;
      throw new StorageConflictError(this.remote);
    }
    this.saved = JSON.parse(JSON.stringify(root));
  }
}

let term: Terminal | undefined;
afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
});

async function runLine(root: HTMLElement, text: string): Promise<void> {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await flush();
}

describe("cloud conflict reconcile", () => {
  it("adopts the remote tree, sets local aside under ~/.pia/conflicts, and warns", async () => {
    const root = document.createElement("div");
    document.body.append(root);

    // What another device already wrote (the newer remote) — a remote-only file.
    const remoteVfs = VFS.seed();
    remoteVfs.writeFile("/home/guest/remote.txt", "from-another-device");

    // Our local tree carries a local-only file; the command below adds another,
    // then persists — which collides.
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/local.txt", "mine");

    const adapter = new ConflictOnceAdapter(remoteVfs.root);
    term = new Terminal(root, {
      vfs,
      adapter,
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
    });

    await runLine(root, "touch note.txt"); // mutates, then persists → conflict

    // A clear notice was shown (never a silent overwrite).
    expect(root.textContent).toContain("changed on another device");

    // The working tree adopted the remote: its file is present, and our local
    // files are no longer live — they've been set aside.
    const saved = new VFS(adapter.saved!);
    expect(saved.getNode("/home/guest/remote.txt")).not.toBeNull();
    expect(saved.getNode("/home/guest/local.txt")).toBeNull();
    expect(saved.getNode("/home/guest/note.txt")).toBeNull();

    // Nothing was lost: exactly one snapshot holds our pre-conflict home.
    expect(saved.getNode("/home/guest/.pia/conflicts")?.type).toBe("dir");
    const snaps = saved.list("/home/guest/.pia/conflicts");
    expect(snaps).toHaveLength(1);
    const snapshot = JSON.parse(
      saved.readFile(`/home/guest/.pia/conflicts/${snaps[0].name}`),
    ) as DirNode;
    const names = Object.keys(snapshot.children);
    expect(names).toContain("local.txt"); // our pre-existing local file
    expect(names).toContain("note.txt"); // …and the one the command just made
  });

  it("reconciles on the debounced history persist too, not just command saves", async () => {
    const root = document.createElement("div");
    document.body.append(root);

    const remoteVfs = VFS.seed();
    remoteVfs.writeFile("/home/guest/remote.txt", "from-another-device");

    const adapter = new ConflictOnceAdapter(remoteVfs.root);
    const saveHistory = (): void => {}; // the VFS write is stubbed; we only care about persist
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter,
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
      saveHistory,
    });

    await runLine(root, "pwd"); // read-only: schedules a debounced persist, no sync save
    expect(adapter.saved).toBeNull(); // nothing written yet — it's deferred

    await term.flush(); // fire the pending history persist now → must reconcile, not swallow
    expect(root.textContent).toContain("changed on another device");
    const saved = new VFS(adapter.saved!);
    expect(saved.getNode("/home/guest/remote.txt")).not.toBeNull(); // remote kept
    expect(saved.getNode("/home/guest/.pia/conflicts")?.type).toBe("dir"); // local set aside
  });
});
