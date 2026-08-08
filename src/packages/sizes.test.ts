import { describe, expect, it } from "vitest";
import { formatBytes, packageGzipSize } from "./sizes.js";

describe("package sizes", () => {
  it("formats bytes in the build's own style", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 kB");
    expect(formatBytes(8807)).toBe("8.6 kB");
  });

  it("returns null when there's no manifest (non-production — dev, tests, tsc)", async () => {
    // The manifest is a production build artifact, so outside a prod build the
    // lookup never fetches and never invents a number — the caller omits the size.
    expect(await packageGzipSize("cowsay", "https://pia.test/")).toBeNull();
  });
});
