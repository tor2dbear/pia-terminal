import { Editor } from "../apps/editor.js";
import { parseAtTime, parseCron } from "../pia/cron.js";
import type { Command, CommandContext } from "./registry.js";

const atPath = (ctx: CommandContext): string => `${ctx.vfs.home}/.pia/at`;
const cronPath = (ctx: CommandContext): string => `${ctx.vfs.home}/.pia/crontab`;

const CRONTAB_SEED = [
  "# ~/.pia/crontab — scheduled jobs, one per line:",
  "#   <minute> <hour> <day-of-month> <month> <day-of-week>  <command>",
  "#   *=any  */n=every n  a-b=range  a,b=list   (day-of-week: 0=Sunday)",
  "# examples:",
  "#   */2 * * * *   echo tick",
  "#   0 9 * * 1     echo monday morning",
  "# jobs run only while this browser tab is open.",
  "",
].join("\n");

/** Format an epoch (ms) in UTC — stable regardless of the viewer's timezone. */
function fmtUtc(ms: number): string {
  const d = new Date(ms);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${mons[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC ${d.getUTCFullYear()}`;
}

function readAtJobs(ctx: CommandContext): { when: number; command: string }[] {
  const node = ctx.vfs.getNode(atPath(ctx));
  if (!node || node.type !== "file") return [];
  return node.content
    .split("\n")
    .filter((l) => l.includes("\t"))
    .map((l) => {
      const tab = l.indexOf("\t");
      return { when: Number(l.slice(0, tab)), command: l.slice(tab + 1) };
    })
    .filter((j) => Number.isFinite(j.when));
}

async function writeAtJobs(
  ctx: CommandContext,
  jobs: { when: number; command: string }[],
): Promise<void> {
  const text = jobs
    .sort((a, b) => a.when - b.when)
    .map((j) => `${j.when}\t${j.command}`)
    .join("\n");
  ctx.vfs.mkdirp(`${ctx.vfs.home}/.pia`);
  ctx.vfs.writeFile(atPath(ctx), text ? text + "\n" : "");
  await ctx.persist();
}

export const at: Command = {
  name: "at",
  help: "schedule a one-off command (at <time> <command>; -l list, -r <n> remove)",
  usage: "at <HH:MM | now+Nm> <command>   ·   at -l   ·   at -r <n>",
  async run(args, ctx) {
    if (args[0] === "-l" || args[0] === "--list") {
      const jobs = readAtJobs(ctx);
      if (jobs.length === 0) return ctx.print("no scheduled jobs", "dim");
      jobs
        .sort((a, b) => a.when - b.when)
        .forEach((j, i) => ctx.print(`${String(i + 1).padStart(2)}  ${fmtUtc(j.when)}  ${j.command}`));
      return;
    }

    if (args[0] === "-r" || args[0] === "--remove") {
      const n = Number(args[1]);
      const jobs = readAtJobs(ctx).sort((a, b) => a.when - b.when);
      if (!Number.isInteger(n) || n < 1 || n > jobs.length) {
        return ctx.error(`at: no job ${args[1] ?? ""} (see 'at -l')`);
      }
      const [removed] = jobs.splice(n - 1, 1);
      await writeAtJobs(ctx, jobs);
      return ctx.print(`removed: ${removed.command}`, "dim");
    }

    const time = args[0];
    const command = args.slice(1).join(" ").trim();
    if (!time || !command) {
      return ctx.error("at: usage — at <time> <command>  (e.g. `at now+5m echo hi`)");
    }
    const when = parseAtTime(time, new Date());
    if (!when) {
      return ctx.error(`at: can't read the time '${time}' — try HH:MM or now+5m`);
    }
    const jobs = readAtJobs(ctx);
    jobs.push({ when: when.getTime(), command });
    await writeAtJobs(ctx, jobs);
    ctx.print(`scheduled for ${fmtUtc(when.getTime())}`, "accent");
    ctx.print(`  ${command}`, "dim");
  },
};

export const crontab: Command = {
  name: "crontab",
  help: "recurring scheduled jobs (crontab -e edit, -l list, -r remove)",
  usage: "crontab -e   ·   crontab -l   ·   crontab -r",
  async run(args, ctx) {
    const path = cronPath(ctx);

    if (args[0] === "-l" || args[0] === "--list") {
      const node = ctx.vfs.getNode(path);
      if (!node || node.type !== "file" || node.content.trim() === "") {
        return ctx.print("no crontab — add jobs with `crontab -e`", "dim");
      }
      for (const line of node.content.replace(/\n+$/, "").split("\n")) ctx.print(line);
      return;
    }

    if (args[0] === "-r" || args[0] === "--remove") {
      if (!ctx.vfs.getNode(path)) return ctx.error("crontab: nothing to remove");
      ctx.vfs.remove(path);
      await ctx.persist();
      return ctx.print("crontab removed", "dim");
    }

    if (args[0] === "-e" || args[0] === "--edit") {
      const existing = ctx.vfs.getNode(path);
      const content = existing && existing.type === "file" ? existing.content : CRONTAB_SEED;
      // Validate on save: warn about lines whose cron expression is malformed.
      const save = async (text: string): Promise<void> => {
        ctx.vfs.mkdirp(`${ctx.vfs.home}/.pia`);
        ctx.vfs.writeFile(path, text);
        await ctx.persist();
      };
      await ctx.runApp((exit) => new Editor([{ filename: "crontab", content, onSave: save }], exit));
      // A quick sanity note after editing (doesn't block saving).
      const bad = (ctx.vfs.getNode(path) as { content?: string } | null)?.content
        ?.split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
        .filter((l) => {
          const p = l.trim().split(/\s+/);
          return p.length < 6 || !parseCron(p.slice(0, 5).join(" "));
        });
      if (bad && bad.length) ctx.error(`crontab: ${bad.length} line(s) look invalid — check the syntax`);
      return;
    }

    ctx.error("crontab: usage — crontab -e (edit) · -l (list) · -r (remove)");
  },
};

export const schedulingCommands: Command[] = [at, crontab];
