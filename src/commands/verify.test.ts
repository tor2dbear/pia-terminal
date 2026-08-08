// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { MemoryShareStore } from "../share/store.js";
import { piaExtendContext } from "../pia/context.js";

describe("verify (lazy email verification)", () => {
  let term: Terminal | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function mount(share: MemoryShareStore, auth: MemoryAuthAdapter): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs: VFS.seed(),
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(auth, share),
    });
    return root;
  }
  const kbd = (root: HTMLElement) => root.querySelector(".term-kbd") as HTMLInputElement;
  function type(root: HTMLElement, text: string): void {
    const field = kbd(root);
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function runLine(root: HTMLElement, text: string): Promise<void> {
    type(root, text);
    kbd(root).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
  }

  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
  });

  it("needs a login first", async () => {
    const root = mount(new MemoryShareStore("me@example.com", MemoryShareStore.backing()), new MemoryAuthAdapter());
    await runLine(root, "verify");
    expect(root.textContent).toContain("verify: log in first");
  });

  it("sends a code, rejects a wrong one, accepts the right one", async () => {
    const auth = new MemoryAuthAdapter();
    const root = mount(new MemoryShareStore("me@example.com", MemoryShareStore.backing()), auth);
    await runLine(root, "login me");

    await runLine(root, "verify");
    expect(root.textContent).toContain("sent a 6-digit code to me@example.test");

    await runLine(root, "verify 000000");
    expect(root.textContent).toContain("invalid or expired code");

    await runLine(root, `verify ${auth.emailCode}`); // the code we "emailed"
    expect(root.textContent).toContain("email verified ✓");
  });

  it("accepts a list shared with you once you verify", async () => {
    const backing = MemoryShareStore.backing({ requireVerified: true });
    const me = new MemoryShareStore("me@example.com", backing);
    const owner = new MemoryShareStore("owner@example.com", backing);
    const id = await owner.create("handla", "[ ] milk");
    await owner.invite(id, "me@example.com", "viewer");

    const auth = new MemoryAuthAdapter();
    const root = mount(me, auth);
    await runLine(root, "login me");

    await runLine(root, "verify");
    await runLine(root, `verify ${auth.emailCode}`);
    expect(root.textContent).toContain("email verified ✓");
    expect(root.textContent).toContain("accepted 1 shared list");

    await runLine(root, "ls ~/shared");
    expect(root.textContent).toContain("handla.list@");
  });
});
