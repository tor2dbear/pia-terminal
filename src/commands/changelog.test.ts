import { describe, expect, it } from "vitest";
import { metaCommands } from "./changelog.js";
import type { CommandContext } from "./registry.js";

function run(name: string): string[] {
  const cmd = metaCommands.find((c) => c.name === name)!;
  const out: string[] = [];
  cmd.run([], { print: (t?: string) => out.push(t ?? "") } as unknown as CommandContext);
  return out;
}

describe("meta commands", () => {
  it("version prints the app version", () => {
    expect(run("version")[0]).toMatch(/^PIA v\S+/);
  });

  it("changelog renders the bundled CHANGELOG.md", () => {
    const out = run("changelog").join("\n");
    expect(out).toContain("Changelog");
    expect(out).toContain("Foundations"); // a word from the 0.1.0 entry
  });
});
