// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";

describe("json_pp and column", () => {
  let term: Terminal | undefined;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function mount(vfs = VFS.seed()): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    term = new Terminal(root, {
      vfs,
      adapter: new MemoryStorageAdapter(),
      registry: buildRegistry(),
      session: { user: "guest" },
      extendContext: piaExtendContext(new MemoryAuthAdapter()),
    });
    return root;
  }
  const kbd = (root: HTMLElement) => root.querySelector(".term-kbd") as HTMLInputElement;
  async function runLine(root: HTMLElement, line: string): Promise<void> {
    const field = kbd(root);
    field.value = line;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
  }

  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
  });

  it("json_pp pretty-prints and colours keys; `json` is an alias", async () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/d.json", '{"name":"pia","n":1}');
    const root = mount(vfs);
    await runLine(root, "json_pp d.json");
    expect(root.textContent).toContain('"name": "pia"');
    const accent = [...root.querySelectorAll(".term-line.accent")].map((e) => e.textContent);
    expect(accent.some((t) => t?.includes('"name"'))).toBe(true);

    await runLine(root, "json d.json"); // alias
    expect(root.textContent).toContain('"n": 1');
  });

  it("json_pp reports invalid JSON", async () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/bad.json", "{nope");
    const root = mount(vfs);
    await runLine(root, "json_pp bad.json");
    expect(root.textContent).toContain("json_pp: invalid JSON");
  });

  it("column -t -s, aligns a CSV, and works in a pipe", async () => {
    const vfs = VFS.seed();
    vfs.writeFile("/home/guest/d.csv", "a,b\nlong,x");
    const root = mount(vfs);
    await runLine(root, "column -t -s, d.csv");
    expect(root.textContent).toContain("long  x");
    expect(root.textContent).toContain("a     b"); // first column padded to width 4

    await runLine(root, "cat d.csv | column -t -s,");
    expect(root.textContent).toContain("long  x");
  });
});
