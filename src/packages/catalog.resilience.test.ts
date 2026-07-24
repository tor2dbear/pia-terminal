import { describe, expect, it, vi } from "vitest";

// Simulate a package chunk that fails to load (offline / a transient asset
// error) — its dynamic import rejects.
vi.mock("./cowsay/index.js", () => {
  throw new Error("simulated chunk load failure");
});

import { VFS, HOME } from "../vfs/vfs.js";
import { CommandRegistry } from "../commands/registry.js";
import { registerInstalled, packagesPath } from "./catalog.js";

describe("registerInstalled resilience", () => {
  it("skips a package whose chunk fails to load, still registering the rest", async () => {
    const vfs = VFS.seed();
    vfs.mkdirp(`${HOME}/.pia`);
    vfs.writeFile(packagesPath(HOME), "cowsay\ncal\n");
    const registry = new CommandRegistry();

    // Must not reject — a bad import would otherwise brick boot (the gate would
    // never release).
    await expect(registerInstalled(vfs, HOME, registry)).resolves.toBeUndefined();
    expect(registry.has("cal")).toBe(true); // loaded fine
    expect(registry.has("cowsay")).toBe(false); // failed load, skipped
  });
});
