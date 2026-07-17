import { describe, expect, it, vi } from "vitest";
import { VFS, HOME } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { upload, download } from "./transfer.js";
import type { CommandContext, LineClass } from "./registry.js";

/** A headless context with injectable pickFile/saveFile bridges. */
function harness(opts: Partial<Pick<CommandContext, "pickFile" | "saveFile">> = {}) {
  const vfs = VFS.seed();
  const adapter = new MemoryStorageAdapter();
  const lines: { text: string; cls: LineClass }[] = [];
  let cwd = HOME;
  const ctx: CommandContext = {
    vfs,
    registry: buildRegistry(),
    auth: new MemoryAuthAdapter(),
    session: { user: "guest" },
    stdin: "",
    piped: false,
    baseUrl: "https://pia.test/",
    get cwd() {
      return cwd;
    },
    setCwd(p: string) {
      cwd = p;
    },
    print: (text = "", cls: LineClass = "normal") => lines.push({ text, cls }),
    error: (text: string) => lines.push({ text, cls: "error" }),
    clear: () => (lines.length = 0),
    persist: () => adapter.save(vfs.root),
    runApp: async () => {},
    ...opts,
  };
  return { ctx, vfs, lines, text: () => lines.map((l) => l.text) };
}

describe("upload", () => {
  it("writes the picked file into the current directory and persists", async () => {
    const h = harness({ pickFile: async () => ({ name: "notes.txt", content: "hello" }) });
    await upload.run([], h.ctx);
    expect(h.vfs.readFile(`${HOME}/notes.txt`)).toBe("hello");
    expect(h.text().at(-1)).toContain("uploaded notes.txt");
  });

  it("uploads into a given directory", async () => {
    const h = harness({ pickFile: async () => ({ name: "f.md", content: "# hi" }) });
    h.vfs.mkdir(`${HOME}/docs`);
    await upload.run(["docs"], h.ctx);
    expect(h.vfs.readFile(`${HOME}/docs/f.md`)).toBe("# hi");
  });

  it("reports a cancelled pick without writing anything", async () => {
    const h = harness({ pickFile: async () => null });
    await upload.run([], h.ctx);
    expect(h.text()).toContain("upload: cancelled");
  });

  it("errors when the target is not a directory", async () => {
    const h = harness({ pickFile: async () => ({ name: "x", content: "" }) });
    h.vfs.writeFile(`${HOME}/file.txt`, "x");
    await upload.run(["file.txt"], h.ctx);
    expect(h.text().at(-1)).toContain("not a directory");
  });

  it("reports when the bridge is unavailable", async () => {
    const h = harness(); // no pickFile
    await upload.run([], h.ctx);
    expect(h.text().at(-1)).toContain("not supported");
  });
});

describe("download", () => {
  it("saves the file's content under its basename", async () => {
    const saveFile = vi.fn();
    const h = harness({ saveFile });
    h.vfs.writeFile(`${HOME}/report.txt`, "data here");
    await download.run(["report.txt"], h.ctx);
    expect(saveFile).toHaveBeenCalledWith("report.txt", "data here");
    expect(h.text().at(-1)).toContain("downloading report.txt");
  });

  it("errors on a missing file", async () => {
    const h = harness({ saveFile: vi.fn() });
    await download.run(["nope.txt"], h.ctx);
    expect(h.text().at(-1)).toContain("download:");
    expect(h.text().at(-1)).toContain("no such file");
  });

  it("requires a filename", async () => {
    const h = harness({ saveFile: vi.fn() });
    await download.run([], h.ctx);
    expect(h.text().at(-1)).toContain("usage");
  });

  it("reports when the bridge is unavailable", async () => {
    const h = harness(); // no saveFile
    await download.run(["x"], h.ctx);
    expect(h.text().at(-1)).toContain("not supported");
  });
});
