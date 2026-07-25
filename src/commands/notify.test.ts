import { describe, expect, it } from "vitest";
import { notifyCommands } from "./notify.js";
import { MemoryReminderStore, NullReminderStore } from "../pia/reminders.js";
import type { CommandContext } from "./registry.js";

const notify = notifyCommands[0];

function makeCtx(reminders: CommandContext["reminders"]): {
  ctx: CommandContext;
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const ctx = {
    reminders,
    print: (t?: string) => out.push(t ?? ""),
    error: (t: string) => err.push(t),
  } as unknown as CommandContext;
  return { ctx, out, err };
}

describe("notify", () => {
  it("reports off (and points at login) for a guest with no cloud backend", async () => {
    const { ctx, out } = makeCtx(new NullReminderStore());
    await notify.run([], ctx);
    expect(out[0]).toMatch(/notifications: off/);
    expect(out[0]).toMatch(/cloud account/);
  });

  it("refuses `notify on` without a cloud backend", async () => {
    const { ctx, err } = makeCtx(new NullReminderStore());
    await notify.run(["on"], ctx);
    expect(err[0]).toMatch(/cloud account/);
  });

  it("shows the current state on a bare `notify`", async () => {
    const store = new MemoryReminderStore();
    const { ctx, out } = makeCtx(store);
    await notify.run([], ctx);
    expect(out[0]).toBe("notifications: off on this device.");
  });

  it("turns notifications on", async () => {
    const store = new MemoryReminderStore();
    const { ctx, out } = makeCtx(store);
    await notify.run(["on"], ctx);
    expect(out[0]).toBe("notifications enabled on this device.");
    expect(await store.isEnabled()).toBe(true);
  });

  it("turns notifications off again (the gap `remind on` couldn't fill)", async () => {
    const store = new MemoryReminderStore();
    await store.enablePush();
    const { ctx, out } = makeCtx(store);
    await notify.run(["off"], ctx);
    expect(out[0]).toBe("notifications turned off on this device.");
    expect(await store.isEnabled()).toBe(false);

    // …and a bare `notify` now reflects it.
    out.length = 0;
    await notify.run([], ctx);
    expect(out[0]).toBe("notifications: off on this device.");
  });

  it("rejects an unknown argument with usage", async () => {
    const { ctx, err } = makeCtx(new MemoryReminderStore());
    await notify.run(["sometimes"], ctx);
    expect(err[0]).toMatch(/usage — notify \[on\|off\]/);
  });
});
