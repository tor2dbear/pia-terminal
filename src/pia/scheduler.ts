import type { VFS } from "../vfs/vfs.js";
import { parseCron, cronMatches } from "./cron.js";

/**
 * The in-tab scheduler for `at` / `crontab` (the learning-tool version). It owns
 * no clock and no timer — `tick(now)` is called from a real interval in
 * `main.ts`, and with an injected time in tests. Jobs live in VFS files the
 * commands edit:
 *   ~/.pia/crontab  — lines `<m> <h> <dom> <mon> <dow> <command>` (# comments)
 *   ~/.pia/at       — lines `<epochMs>\t<command>` (one-off, removed once fired)
 * Firing runs the command via the injected `run` callback (the terminal). Only
 * fires while the tab is open — that's the honest limit of the learning tool.
 */
export interface SchedulerDeps {
  vfs: VFS;
  run: (command: string) => void | Promise<void>;
  persist: () => Promise<void>;
}

export interface Scheduler {
  tick(now: Date): Promise<void>;
}

function readLines(vfs: VFS, path: string): string[] {
  const node = vfs.getNode(path);
  if (!node || node.type !== "file") return [];
  return node.content.split("\n");
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { vfs, run, persist } = deps;
  // Per cron line, the minute-epoch we last fired it — so a matching minute
  // fires once, not on every one-second tick within that minute.
  const cronLastFired = new Map<string, number>();

  const atPath = (): string => `${vfs.home}/.pia/at`;
  const cronPath = (): string => `${vfs.home}/.pia/crontab`;

  async function fireAtJobs(now: Date): Promise<void> {
    const lines = readLines(vfs, atPath());
    const keep: string[] = [];
    const fired: string[] = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      const when = Number(line.slice(0, tab));
      const command = line.slice(tab + 1);
      if (Number.isFinite(when) && when <= now.getTime()) fired.push(command);
      else keep.push(line);
    }
    if (fired.length === 0) return;
    // Write the survivors back (and persist) BEFORE running, so a fired job
    // can't be seen as pending again if it reschedules something.
    vfs.writeFile(atPath(), keep.length ? keep.join("\n") + "\n" : "");
    await persist();
    for (const command of fired) await run(command);
  }

  async function fireCronJobs(now: Date): Promise<void> {
    const minute = Math.floor(now.getTime() / 60_000);
    for (const raw of readLines(vfs, cronPath())) {
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;
      const spec = parseCron(parts.slice(0, 5).join(" "));
      if (!spec) continue;
      if (!cronMatches(spec, now)) continue;
      if (cronLastFired.get(raw) === minute) continue; // already fired this minute
      cronLastFired.set(raw, minute);
      await run(parts.slice(5).join(" "));
    }
  }

  return {
    async tick(now: Date): Promise<void> {
      await fireAtJobs(now);
      await fireCronJobs(now);
    },
  };
}
