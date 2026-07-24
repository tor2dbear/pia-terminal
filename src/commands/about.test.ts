import { describe, expect, it } from "vitest";
import { about } from "./about.js";
import type { CommandContext } from "./registry.js";

function output(): string {
  const lines: string[] = [];
  const ctx = { print: (t = "") => lines.push(t) } as unknown as CommandContext;
  about.run([], ctx);
  return lines.join("\n");
}

describe("about", () => {
  it("shows the injected version and the source / npm / home links", () => {
    const out = output();
    // The real package.json version is injected in the test build.
    expect(out).toMatch(/PIA v\d/);
    expect(out).toContain("https://github.com/tor2dbear/pia-terminal");
    expect(out).toContain("https://www.npmjs.com/package/pia");
    expect(out).toContain("https://pia.tor2dbear.com");
  });

  it("is reachable as `repo` too", () => {
    expect(about.aliases).toContain("repo");
  });
});
