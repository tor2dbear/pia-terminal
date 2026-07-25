// @vitest-environment jsdom
//
// The boot sequence — specifically the opt-in BIOS/POST preamble. Driven with a
// tiny fake terminal (print/printTyped captured) and fake timers so the paced
// delays resolve instantly.
import { afterEach, describe, expect, it, vi } from "vitest";
import { boot } from "./boot.js";
import type { Terminal } from "./terminal/terminal.js";

function fakeTerm(): { term: Terminal; lines: string[] } {
  const lines: string[] = [];
  const term = {
    setBooting() {},
    print: (t = "") => {
      lines.push(t);
    },
    printTyped: async (t = "") => {
      lines.push(t);
    },
  } as unknown as Terminal;
  return { term, lines };
}

/** Run boot to completion while flushing its paced setTimeout delays. */
async function runBoot(bios: boolean): Promise<string> {
  vi.useFakeTimers();
  const { term, lines } = fakeTerm();
  const done = boot(term, { bios });
  await vi.runAllTimersAsync();
  await done;
  return lines.join("\n");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("boot", () => {
  it("plays the BIOS/POST preamble when bios is on, then the normal greeting", async () => {
    const text = await runBoot(true);
    expect(text).toContain("PIA BIOS");
    expect(text).toMatch(/Memory Test/);
    expect(text).toContain("Loading adapters");
    // …and still hands off to the ordinary prompt greeting.
    expect(text).toContain("hi. type 'help' to begin.");
    // The terse one-liner is suppressed in BIOS mode (the POST covered it).
    expect(text).not.toContain("memory ok · vfs mounted · adapters loaded");
  });

  it("skips the POST on a normal (bios off) boot", async () => {
    const text = await runBoot(false);
    expect(text).not.toContain("PIA BIOS");
    expect(text).toContain("memory ok · vfs mounted · adapters loaded");
    expect(text).toContain("hi. type 'help' to begin.");
  });
});
