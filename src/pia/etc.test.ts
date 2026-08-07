import { describe, expect, it } from "vitest";
import { VFS } from "../vfs/vfs.js";
import { seedSystemFiles, readMotd, DEFAULT_MOTD } from "./etc.js";
import { VERSION } from "../meta.js";

describe("seedSystemFiles", () => {
  it("creates /etc with the default motd and an os-release", () => {
    const vfs = VFS.seed();
    seedSystemFiles(vfs);
    expect(vfs.getNode("/etc")?.type).toBe("dir");
    expect(vfs.readFile("/etc/motd")).toBe(`${DEFAULT_MOTD}\n`);
    expect(vfs.readFile("/etc/os-release")).toContain(`VERSION="${VERSION}"`);
    expect(vfs.readFile("/etc/os-release")).toContain('ID=pia');
  });

  it("keeps your edits to motd (seeded only when missing), but re-seeds a deleted one", () => {
    const vfs = VFS.seed();
    seedSystemFiles(vfs);
    vfs.writeFile("/etc/motd", "my own greeting\n");
    seedSystemFiles(vfs);
    expect(vfs.readFile("/etc/motd")).toBe("my own greeting\n"); // edit survives

    vfs.remove("/etc/motd");
    seedSystemFiles(vfs);
    expect(vfs.readFile("/etc/motd")).toBe(`${DEFAULT_MOTD}\n`); // self-heals
  });

  it("always refreshes the machine-owned os-release", () => {
    const vfs = VFS.seed();
    seedSystemFiles(vfs);
    vfs.writeFile("/etc/os-release", "stale");
    seedSystemFiles(vfs);
    expect(vfs.readFile("/etc/os-release")).toContain(`VERSION="${VERSION}"`); // overwritten
  });

  it("tolerates conflicting nodes at the /etc paths (never throws — boot must not brick)", () => {
    const fileAtEtc = VFS.seed();
    fileAtEtc.writeFile("/etc", "i am a file, not a dir");
    expect(() => seedSystemFiles(fileAtEtc)).not.toThrow();

    const dirsWhereFilesGo = VFS.seed();
    dirsWhereFilesGo.mkdirp("/etc/motd"); // motd is a directory
    dirsWhereFilesGo.mkdirp("/etc/os-release"); // …and so is os-release
    expect(() => seedSystemFiles(dirsWhereFilesGo)).not.toThrow();
    // The stray directories are left as-is, not clobbered.
    expect(dirsWhereFilesGo.getNode("/etc/motd")?.type).toBe("dir");
  });

  it("readMotd returns the file, or empty when it's gone", () => {
    const vfs = VFS.seed();
    expect(readMotd(vfs)).toBe(""); // nothing seeded yet
    seedSystemFiles(vfs);
    expect(readMotd(vfs)).toBe(`${DEFAULT_MOTD}\n`);
  });
});
