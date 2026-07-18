// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "../terminal/terminal.js";
import { VFS } from "../vfs/vfs.js";
import { MemoryStorageAdapter } from "../storage/localStorage.js";
import { MemoryAuthAdapter } from "../auth/fakeAuth.js";
import { buildRegistry } from "./index.js";
import { piaExtendContext } from "../pia/context.js";
import { loadTerminalConfig } from "../pia/terminalConfig.js";
import { createScheduler } from "../pia/scheduler.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
let term: Terminal | undefined;
let root: HTMLElement;
let vfs: VFS;

function mount(): void {
  root = document.createElement("div");
  document.body.append(root);
  vfs = VFS.seed();
  term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    configure: () => loadTerminalConfig(vfs), // seeds ~/.pia, like main.ts
    extendContext: piaExtendContext(new MemoryAuthAdapter()),
  });
}

const text = () => [...root.querySelectorAll(".term-line")].map((n) => n.textContent).join("\n");

async function run(line: string): Promise<void> {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
  field.value = line;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
  mount();
});
afterEach(() => {
  term?.dispose();
  term = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("at", () => {
  it("schedules a job, lists it, then removes it", async () => {
    await run("at now+5m echo hi");
    expect(text()).toContain("scheduled for");
    expect(text()).toContain("12:05 UTC 2026"); // frozen clock + UTC format

    await run("at -l");
    expect(text()).toContain("echo hi");

    await run("at -r 1");
    expect(text()).toContain("removed: echo hi");

    await run("at -l");
    expect(text()).toContain("no scheduled jobs");
  });

  it("rejects an unreadable time", async () => {
    await run("at soon echo hi");
    expect(root.querySelector(".term-line.error")?.textContent).toContain("can't read the time");
  });

  it("a due job fires into the terminal when the scheduler ticks", async () => {
    await run("at now+0m echo fired-now"); // due immediately (frozen clock)
    const scheduler = createScheduler({
      vfs,
      run: (command) => term!.fireScheduled(command),
      persist: async () => {},
    });
    await scheduler.tick(new Date());
    await flush();
    expect(text()).toContain("⏰ scheduled:");
    expect(text()).toContain("fired-now"); // the command ran, printing its output
    // The one-off job is gone, so it won't fire again.
    await run("at -l");
    expect(text()).toContain("no scheduled jobs");
  });
});

describe("crontab", () => {
  it("reports an empty crontab, and lists what -e wrote", async () => {
    await run("crontab -l");
    expect(text()).toContain("no crontab");

    // Simulate an edit by writing the file directly, then list it.
    await run('echo "*/2 * * * * echo tick" > ~/.pia/crontab');
    await run("crontab -l");
    expect(text()).toContain("*/2 * * * * echo tick");

    await run("crontab -r");
    expect(text()).toContain("crontab removed");
    await run("crontab -l");
    expect(text()).toContain("no crontab");
  });
});
