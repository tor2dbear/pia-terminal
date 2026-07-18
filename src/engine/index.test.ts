import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  tokenize,
  parseSequence,
  expandArgs,
  VFS,
  HOME,
} from "./index.js";

// Smoke test: the engine's public front door resolves and the core pieces work
// when imported only through it — nothing here reaches into deep paths.
describe("engine public API", () => {
  it("re-exports a working command registry", () => {
    const reg = new CommandRegistry();
    reg.register({ name: "hi", help: "", run: () => {} });
    expect(reg.get("hi")?.name).toBe("hi");
  });

  it("re-exports the parser and globber", () => {
    expect(tokenize('echo "a b"')).toEqual(["echo", "a b"]);
    const seq = parseSequence("a && b");
    expect(seq.ok && seq.items.map((i) => i.connector)).toEqual([null, "&&"]);
    const fs = { resolve: () => "/", entries: () => ["a.md", "b.txt"] };
    expect(expandArgs(["*.md"], "/", fs)).toEqual(["a.md"]);
  });

  it("re-exports the VFS", () => {
    const vfs = VFS.seed();
    expect(typeof HOME).toBe("string");
    expect(vfs.getNode(HOME)?.type).toBe("dir");
  });
});
