import { describe, expect, it } from "vitest";
import { metaCommands } from "./changelog.js";
import type { CommandContext } from "./registry.js";

async function run(
  name: string,
  args: string[] = [],
  extra: Partial<CommandContext> = {},
): Promise<string[]> {
  const cmd = metaCommands.find((c) => c.name === name)!;
  const out: string[] = [];
  await cmd.run(args, {
    print: (t?: string) => out.push(t ?? ""),
    ...extra,
  } as unknown as CommandContext);
  return out;
}

describe("meta commands", () => {
  it("version prints the app version", async () => {
    expect((await run("version"))[0]).toMatch(/^PIA v\S+/);
  });

  it("changelog shows the latest release by default, not the whole history", async () => {
    const out = (await run("changelog")).join("\n");
    expect(out).toContain("Changelog"); // the header/intro
    expect(out).toContain("0.13.0"); // the newest release
    expect(out).not.toContain("Foundations"); // 0.1.0 is trimmed away…
    expect(out).toContain("changelog --all"); // …with a pointer to the rest
  });

  it("changelog --all emits the full history (plain) when piped", async () => {
    const out = (await run("changelog", ["--all"], { piped: true })).join("\n");
    expect(out).toContain("Foundations"); // 0.1.0 present
    expect(out).toContain("0.11.0");
    expect(out).not.toContain("changelog --all"); // no interactive hint in a pipe
    // Keep-a-Changelog reference-link plumbing is hidden in the terminal (it's
    // GitHub-only, and the URLs would otherwise show as raw, often-dead lines).
    expect(out).not.toMatch(/^\[[^\]]+\]:\s+https?:/m);
    expect(out).not.toContain("releases/tag/");
  });

  it("changelog --all opens the pager when run interactively", async () => {
    let launched = false;
    await run("changelog", ["--all"], {
      runApp: async () => {
        launched = true;
      },
    } as unknown as Partial<CommandContext>);
    expect(launched).toBe(true);
  });
});
