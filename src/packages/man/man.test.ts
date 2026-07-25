import { describe, expect, it } from "vitest";
import { wrap, renderPage } from "./pages.js";
import { pkg } from "./index.js";
import { buildRegistry } from "../../commands/index.js";
import type { CoreCommandContext } from "../../commands/registry.js";

/** A context with the real registry (so man can read command metadata). */
function ctxHarness(piped = false) {
  const lines: { text: string; err: boolean }[] = [];
  const registry = buildRegistry();
  // Register man/apropos so `man man` and self-referential lookups resolve.
  for (const c of pkg.commands) registry.register(c);
  let appLaunched = false;
  const ctx = {
    registry,
    piped,
    print: (text = "") => lines.push({ text, err: false }),
    error: (text: string) => lines.push({ text, err: true }),
    runApp: async () => {
      appLaunched = true;
    },
  } as unknown as CoreCommandContext;
  const cmd = (name: string) => pkg.commands.find((c) => c.name === name)!;
  return { ctx, registry, lines, cmd, text: () => lines.map((l) => l.text), appLaunched: () => appLaunched };
}

describe("wrap", () => {
  it("greedily wraps to the width", () => {
    expect(wrap("one two three four", 8)).toEqual(["one two", "three", "four"]);
  });
  it("returns a single empty line for empty text", () => {
    expect(wrap("", 40)).toEqual([""]);
  });
});

describe("renderPage", () => {
  it("emits the standard sections", () => {
    const out = renderPage("thing", {
      summary: "do a thing",
      synopsis: "thing [-x]",
      description: ["It does the thing."],
      options: [["-x", "extra"]],
      examples: [["thing -x", "with extra"]],
      seeAlso: ["other"],
    }).join("\n");
    expect(out).toContain("NAME");
    expect(out).toContain("thing - do a thing");
    expect(out).toContain("SYNOPSIS");
    expect(out).toContain("DESCRIPTION");
    expect(out).toContain("OPTIONS");
    expect(out).toContain("EXAMPLES");
    expect(out).toContain("SEE ALSO");
  });

  it("omits SYNOPSIS for a concept page without one", () => {
    const out = renderPage("pipes", { summary: "connect commands", concept: true }).join("\n");
    expect(out).toContain("NAME");
    expect(out).not.toContain("SYNOPSIS");
  });
});

describe("man command", () => {
  it("renders a rich page for a documented command (piped → plain text)", async () => {
    const h = ctxHarness(true);
    await h.cmd("man").run(["ls"], h.ctx);
    const out = h.text().join("\n");
    expect(out).toContain("ls - list directory contents");
    expect(out).toContain("SYNOPSIS");
    expect(out).toContain("-a");
    expect(h.appLaunched()).toBe(false); // piped: no pager
  });

  it("builds a skeleton page from the registry for an undocumented command", async () => {
    const h = ctxHarness(true);
    await h.cmd("man").run(["whoami"], h.ctx);
    const out = h.text().join("\n");
    expect(out).toContain("NAME");
    expect(out).toContain("whoami -"); // summary taken from the command's help
  });

  it("documents concept topics that aren't commands", async () => {
    const h = ctxHarness(true);
    await h.cmd("man").run(["pipes"], h.ctx);
    expect(h.text().join("\n")).toContain("pipes - connect commands");
  });

  it("opens the pager when not piped", async () => {
    const h = ctxHarness(false);
    await h.cmd("man").run(["ls"], h.ctx);
    expect(h.appLaunched()).toBe(true);
    expect(h.lines).toHaveLength(0); // nothing printed directly; it's in the pager
  });

  it("errors for an unknown topic", async () => {
    const h = ctxHarness(true);
    await h.cmd("man").run(["definitely-not-real"], h.ctx);
    expect(h.lines.some((l) => l.err && /No manual entry/.test(l.text))).toBe(true);
  });

  it("-k searches names and summaries", async () => {
    const h = ctxHarness(true);
    await h.cmd("man").run(["-k", "directory"], h.ctx);
    const out = h.text().join("\n");
    expect(out).toContain("ls - list directory contents");
    expect(out).toContain("cd - change the working directory");
  });

  it("apropos reports when nothing matches", async () => {
    const h = ctxHarness(true);
    await h.cmd("apropos").run(["zzzznope"], h.ctx);
    expect(h.text().join("\n")).toContain("nothing appropriate");
  });

  it("completes every registered name (incl. aliases) plus the concept pages", () => {
    const h = ctxHarness();
    const candidates = h.cmd("man").complete!([], h.ctx.vfs, h.registry);
    expect(candidates).toContain("pipes"); // a concept page (not a command)
    expect(candidates).toContain("whoami"); // a command with no hand-written page
    expect(candidates).toContain("ls"); // a command with a rich page
    expect(candidates).toContain("edit"); // an alias (of nano) — still discoverable
    expect(candidates).toContain("-k"); // the option is completable too (`man -<Tab>`)
    // Past the first operand there's nothing more to complete.
    expect(h.cmd("man").complete!(["ls"], h.ctx.vfs, h.registry)).toEqual([]);
  });

  it("apropos matches topic names case-insensitively", async () => {
    const h = ctxHarness(true);
    await h.cmd("apropos").run(["PIPES"], h.ctx);
    expect(h.text().join("\n")).toContain("pipes - connect commands");
  });
});
