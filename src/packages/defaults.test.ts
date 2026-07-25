import { describe, expect, it } from "vitest";
import { VFS, HOME } from "../vfs/vfs.js";
import {
  DEFAULT_PACKAGES,
  installedPackages,
  packagesPath,
  seedDefaultPackages,
} from "./catalog.js";

describe("seedDefaultPackages", () => {
  it("installs the defaults into a never-configured home", () => {
    const vfs = VFS.seed(); // a pure tree — no packages list yet
    expect(seedDefaultPackages(vfs, HOME)).toBe(true);
    expect(installedPackages(vfs, HOME)).toEqual(DEFAULT_PACKAGES);
  });

  it("targets the *active* home, not just the guest tree", () => {
    // The Codex-flagged case: a logged-in user's home must get the defaults the
    // boot greeting points at, not only /home/guest.
    const vfs = VFS.seed();
    const userHome = "/home/alice";
    vfs.mkdirp(userHome);
    expect(seedDefaultPackages(vfs, userHome)).toBe(true);
    expect(installedPackages(vfs, userHome)).toEqual(DEFAULT_PACKAGES);
  });

  it("leaves a configured home untouched, so an uninstall sticks", () => {
    const vfs = VFS.seed();
    // The user has used brew and removed a default — an empty list still counts
    // as "configured" (the file exists).
    vfs.mkdirp(`${HOME}/.pia`);
    vfs.writeFile(packagesPath(HOME), "");
    expect(seedDefaultPackages(vfs, HOME)).toBe(false);
    expect(installedPackages(vfs, HOME)).toEqual([]);
  });
});
