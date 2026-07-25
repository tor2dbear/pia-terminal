import type { Command, CommandContext } from "./registry.js";
import type { PushStatus } from "../pia/reminders.js";
import { parseAtTime, parseCron, nextCronRunUtc } from "../pia/cron.js";

/** A short, human message for each non-success push status. Shared with `notify`. */
export function pushHelp(status: PushStatus): string {
  switch (status) {
    case "denied":
      return "notifications are blocked — allow them for this site, then `remind on`";
    case "unsupported":
      return "this browser doesn't support push notifications";
    case "not-standalone":
      return "on iOS, add PIA to your Home Screen first (Share → Add to Home Screen), then `remind on`";
    case "no-cloud":
      return "log in first (run `login`) — reminders live in your account";
    default:
      return "couldn't enable notifications";
  }
}

/** Format an ISO timestamp as `YYYY-MM-DD HH:MM UTC`, matching `at -l`. */
function fmt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

const remind: Command<CommandContext> = {
  name: "remind",
  help: "schedule a push reminder (remind <time|cron> <text>; -l list, -r <n> cancel, on enable)",
  usage: 'remind <HH:MM | now+Nm | "cron"> <text>   ·   remind -l   ·   remind -r <n>   ·   remind on',
  async run(args, ctx) {
    const store = ctx.reminders;
    if (!store || !store.available()) {
      ctx.error("remind: reminders need a cloud account — run `login`");
      return;
    }

    // `remind on` — turn notifications on for this device.
    if (args[0] === "on") {
      const status = await store.enablePush();
      if (status === "enabled") ctx.print("notifications enabled on this device.");
      else ctx.error(`remind: ${pushHelp(status)}`);
      return;
    }

    // `remind` / `remind -l` — list upcoming reminders.
    if (args.length === 0 || args[0] === "-l") {
      const reminders = await store.list();
      if (reminders.length === 0) {
        ctx.print("no reminders. set one with `remind now+10m tea is ready`.");
        return;
      }
      reminders.forEach((r, i) => {
        const sched = r.cron ? `${r.cron} · next ${fmt(r.nextRun)}` : fmt(r.nextRun);
        ctx.print(`${i + 1}  ${sched}  ${r.body}`);
      });
      return;
    }

    // `remind -r <n>` — cancel the nth listed reminder.
    if (args[0] === "-r") {
      const n = Number(args[1]);
      const reminders = await store.list();
      if (!Number.isInteger(n) || n < 1 || n > reminders.length) {
        ctx.error(`remind: no reminder ${args[1] ?? ""} (see \`remind -l\`)`);
        return;
      }
      await store.remove(reminders[n - 1].id);
      ctx.print(`cancelled: ${reminders[n - 1].body}`);
      return;
    }

    // `remind <time|cron> <text>` — schedule. A quoted five-field cron
    // expression (e.g. `remind "0 9 * * 1-5" standup`) recurs; anything else is
    // a one-off `at`-style time.
    const time = args[0];
    const body = args.slice(1).join(" ").trim();
    if (body === "") {
      ctx.error("remind: usage — remind <time> <text>  (e.g. `remind now+5m stretch`)");
      return;
    }

    const spec = parseCron(time);
    let when: Date | null;
    let cron: string | undefined;
    if (spec) {
      // Cron is read in UTC (the server recomputes each next fire in UTC).
      when = nextCronRunUtc(spec, new Date());
      cron = time.trim().replace(/\s+/g, " ");
      if (!when) {
        ctx.error(`remind: that cron schedule never fires`);
        return;
      }
    } else {
      when = parseAtTime(time, new Date());
      if (!when) {
        ctx.error(`remind: can't read '${time}' — try HH:MM, now+5m, or a "cron expression"`);
        return;
      }
    }

    // Make sure this device is subscribed before scheduling.
    if (!(await store.isEnabled())) {
      const status = await store.enablePush();
      if (status !== "enabled") {
        ctx.error(`remind: ${pushHelp(status)}`);
        return;
      }
    }

    await store.schedule(body, when, cron);
    ctx.print(
      cron
        ? `⏰ recurring reminder set (${cron}), next ${fmt(when.toISOString())}: ${body}`
        : `⏰ reminder set for ${fmt(when.toISOString())}: ${body}`,
    );
  },
};

export const remindCommands: Command<CommandContext>[] = [remind];
