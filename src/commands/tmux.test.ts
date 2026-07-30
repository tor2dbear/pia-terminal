import { describe, expect, it, vi } from "vitest";
import { tmux } from "./tmux.js";
import type { CommandContext } from "./registry.js";
import type { TabControl } from "../terminal/tabcontrol.js";

function fakeTabs(): TabControl & Record<string, ReturnType<typeof vi.fn>> {
  return {
    newWindow: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    select: vi.fn(),
    kill: vi.fn(),
    list: vi.fn(() => [
      { index: 1, active: true, title: "~" },
      { index: 2, active: false, title: "~/notes" },
    ]),
  } as unknown as TabControl & Record<string, ReturnType<typeof vi.fn>>;
}

function run(args: string[], tabs?: TabControl): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  tmux.run(args, {
    tabs,
    print: (t = "") => out.push(t),
    error: (t = "") => err.push(t),
  } as unknown as CommandContext);
  return { out, err };
}

describe("tmux", () => {
  it("says so when there's no multiplexer (e.g. a lean shell)", () => {
    const { err } = run(["new"]);
    expect(err[0]).toMatch(/aren't available/);
  });

  it("lists the windows with a bare invocation, marking the active one", () => {
    const tabs = fakeTabs();
    const { out } = run([], tabs);
    const joined = out.join("\n");
    expect(joined).toContain("1: ~  *"); // active window flagged
    expect(joined).toContain("2: ~/notes");
    expect(joined).toContain("tmux new"); // the help hint
  });

  it("maps subcommands (and their short forms) to the right action", () => {
    for (const [args, method] of [
      [["new"], "newWindow"],
      [["c"], "newWindow"],
      [["next"], "next"],
      [["n"], "next"],
      [["prev"], "prev"],
      [["p"], "prev"],
      [["kill"], "kill"],
      [["x"], "kill"],
    ] as [string[], keyof TabControl][]) {
      const tabs = fakeTabs();
      run(args, tabs);
      expect(tabs[method]).toHaveBeenCalledTimes(1);
    }
  });

  it("selects a window by number", () => {
    const tabs = fakeTabs();
    run(["2"], tabs);
    expect(tabs.select).toHaveBeenCalledWith(2);
  });

  it("errors on an unknown subcommand", () => {
    const tabs = fakeTabs();
    const { err } = run(["frobnicate"], tabs);
    expect(err[0]).toMatch(/unknown command/);
  });
});
