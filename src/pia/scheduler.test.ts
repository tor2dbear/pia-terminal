import { describe, expect, it, vi } from "vitest";
import { createScheduler } from "./scheduler.js";
import { VFS } from "../vfs/vfs.js";

function setup() {
  const vfs = VFS.seed();
  vfs.mkdirp("/home/guest/.pia");
  const run = vi.fn();
  const persist = vi.fn(async () => {});
  const scheduler = createScheduler({ vfs, run, persist });
  return { vfs, run, persist, scheduler };
}

describe("scheduler — at jobs", () => {
  it("fires a due job, then removes it", async () => {
    const { vfs, run, scheduler } = setup();
    const past = 1_000_000;
    vfs.writeFile("/home/guest/.pia/at", `${past}\techo hi\n`);

    await scheduler.tick(new Date(past + 1000));
    expect(run).toHaveBeenCalledWith("echo hi");
    // Removed from the file, so it won't fire again.
    expect(vfs.readFile("/home/guest/.pia/at")).toBe("");
    await scheduler.tick(new Date(past + 2000));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves a future job alone", async () => {
    const { vfs, run, scheduler } = setup();
    vfs.writeFile("/home/guest/.pia/at", `${5_000_000}\techo later\n`);
    await scheduler.tick(new Date(1_000_000));
    expect(run).not.toHaveBeenCalled();
  });
});

describe("scheduler — cron jobs", () => {
  it("fires once per matching minute, not every tick", async () => {
    const { vfs, run, scheduler } = setup();
    vfs.writeFile("/home/guest/.pia/crontab", "* * * * * echo tick\n");
    const t = new Date(2026, 6, 18, 9, 0, 0);

    await scheduler.tick(t);
    await scheduler.tick(new Date(t.getTime() + 1000)); // same minute
    expect(run).toHaveBeenCalledTimes(1);

    await scheduler.tick(new Date(t.getTime() + 60_000)); // next minute
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("skips comments and non-matching lines", async () => {
    const { vfs, run, scheduler } = setup();
    vfs.writeFile(
      "/home/guest/.pia/crontab",
      ["# a comment", "0 9 * * * echo nine", "* * * * * echo always"].join("\n"),
    );
    await scheduler.tick(new Date(2026, 6, 18, 10, 30, 0)); // 10:30 — only "always" matches
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("echo always");
  });
});
