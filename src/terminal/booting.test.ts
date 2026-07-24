// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "./terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { buildRegistry } from "../commands/index.js";

let root: HTMLElement | undefined;

function mount() {
  root = document.createElement("div");
  document.body.append(root);
  const vfs = VFS.seed();
  const term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
  });
  return { term, vfs, root };
}

afterEach(() => {
  root?.remove();
  root = undefined;
});

describe("boot input gating", () => {
  it("ignores a command submitted while booting, then runs it after", async () => {
    const { term, vfs } = mount();

    term.setBooting(true);
    await term.exec("mkdir during-boot");
    expect(vfs.getNode(`${vfs.home}/during-boot`)).toBeNull();

    term.setBooting(false);
    await term.exec("mkdir after-boot");
    expect(vfs.getNode(`${vfs.home}/after-boot`)?.type).toBe("dir");
  });

  it("collapses the input line while booting and restores it after", () => {
    const { term, root } = mount();
    const collapsed = () =>
      root.querySelector(".term-inputline")?.classList.contains("collapsed");

    term.setBooting(true);
    expect(collapsed()).toBe(true);
    term.setBooting(false);
    expect(collapsed()).toBe(false);
  });
});
