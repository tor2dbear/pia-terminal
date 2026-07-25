import { beforeEach, describe, expect, it, vi } from "vitest";
import { remindCommands } from "./remind.js";
import { MemoryReminderStore, NullReminderStore, urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from "../pia/reminders.js";
import type { CommandContext } from "./registry.js";

const remind = remindCommands[0];

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

describe("remind", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
  });

  it("refuses without a cloud backend", async () => {
    const { ctx, err } = makeCtx(new NullReminderStore());
    await remind.run(["now+5m", "tea"], ctx);
    expect(err[0]).toMatch(/cloud account/);
  });

  it("schedules a reminder, auto-enabling push", async () => {
    const store = new MemoryReminderStore();
    const { ctx, out } = makeCtx(store);
    await remind.run(["now+10m", "stretch", "break"], ctx);
    expect(out[0]).toMatch(/reminder set for 2026-07-18 12:10 UTC: stretch break/);
    expect(await store.isEnabled()).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });

  it("schedules a recurring reminder from a cron expression (UTC)", async () => {
    const store = new MemoryReminderStore();
    const { ctx, out } = makeCtx(store);
    // Daily at 15:00 UTC; now is 12:00 UTC → first fire is today at 15:00.
    await remind.run(["0 15 * * *", "standup"], ctx);
    expect(out[0]).toMatch(/recurring reminder set \(0 15 \* \* \*\), next 2026-07-18 15:00 UTC: standup/);
    const [r] = await store.list();
    expect(r.cron).toBe("0 15 * * *");
    expect(r.nextRun).toBe("2026-07-18T15:00:00.000Z");
  });

  it("lists a recurring reminder with its schedule", async () => {
    const store = new MemoryReminderStore();
    await store.enablePush();
    await store.schedule("standup", new Date("2026-07-18T15:00:00Z"), "0 15 * * *");
    const { ctx, out } = makeCtx(store);
    await remind.run(["-l"], ctx);
    expect(out[0]).toContain("0 15 * * * · next 2026-07-18 15:00 UTC  standup");
  });

  it("rejects a cron expression that never fires", async () => {
    const store = new MemoryReminderStore();
    const { ctx, err } = makeCtx(store);
    await remind.run(["0 0 30 2 *", "impossible"], ctx); // Feb 30th
    expect(err[0]).toMatch(/never fires/);
  });

  it("lists and cancels reminders", async () => {
    const store = new MemoryReminderStore();
    await store.enablePush();
    await store.schedule("first", new Date("2026-07-18T13:00:00Z"));
    await store.schedule("second", new Date("2026-07-18T14:00:00Z"));
    const { ctx, out } = makeCtx(store);

    await remind.run(["-l"], ctx);
    expect(out[0]).toContain("1  2026-07-18 13:00 UTC  first");
    expect(out[1]).toContain("2  2026-07-18 14:00 UTC  second");

    out.length = 0;
    await remind.run(["-r", "1"], ctx);
    expect(out[0]).toBe("cancelled: first");
    expect(await store.list()).toHaveLength(1);
  });

  it("rejects a bad time", async () => {
    const { ctx, err } = makeCtx(new MemoryReminderStore());
    await remind.run(["notatime", "hi"], ctx);
    expect(err[0]).toMatch(/can't read 'notatime'/);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes the VAPID public key to 65 bytes (uncompressed P-256 point)", () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04); // uncompressed point marker
  });
});
