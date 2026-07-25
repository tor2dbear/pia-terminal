import type { Command, CommandContext } from "./registry.js";
import { pushHelp } from "./remind.js";

/**
 * `notify` — a clear front door for push notifications on this device: turn them
 * on, off, or show their state. Previously the only way on was as a side effect
 * of `remind on`, and there was no way off at all. `on` reuses the same
 * subscribe flow as `remind`; `off` unsubscribes this device and forgets its
 * stored subscription (see ReminderStore.disablePush).
 */
const notify: Command<CommandContext> = {
  name: "notify",
  help: "turn push notifications on/off for this device, or show their state (notify [on|off])",
  usage: "notify [on|off]",
  async run(args, ctx) {
    const store = ctx.reminders;
    const sub = args[0];

    // No cloud backend (guest): notifications can't be on. Still answer a bare
    // `notify` with the honest state rather than an error.
    if (!store || !store.available()) {
      if (!sub) {
        ctx.print("notifications: off — needs a cloud account (run `login`)");
        return;
      }
      ctx.error("notify: notifications need a cloud account — run `login`");
      return;
    }

    if (sub === "on") {
      const status = await store.enablePush();
      if (status === "enabled") ctx.print("notifications enabled on this device.");
      else ctx.error(`notify: ${pushHelp(status)}`);
      return;
    }

    if (sub === "off") {
      await store.disablePush();
      ctx.print("notifications turned off on this device.");
      return;
    }

    if (!sub) {
      const on = await store.isEnabled();
      ctx.print(`notifications: ${on ? "on" : "off"} on this device.`);
      return;
    }

    ctx.error("notify: usage — notify [on|off]");
  },
};

export const notifyCommands: Command<CommandContext>[] = [notify];
