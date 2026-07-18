/**
 * Scheduling maths for the `at` / `crontab` learning tool. Pure and testable —
 * no clock of its own, no I/O. A cron expression is the classic five fields
 * (minute hour day-of-month month day-of-week); `at` times are a small friendly
 * set (HH:MM, or `now + N unit`).
 */

const FIELD_RANGES: [min: number, max: number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

/** Expand one cron field to the set of numbers it allows, or null if invalid.
 * Supports `*`, `a`, `a-b`, `* / n` and comma lists of those. */
function expandField(field: string, min: number, max: number): Set<number> | null {
  const allowed = new Set<number>();
  for (const part of field.split(",")) {
    const step = part.split("/");
    if (step.length > 2) return null;
    const stepN = step.length === 2 ? Number(step[1]) : 1;
    if (!Number.isInteger(stepN) || stepN < 1) return null;

    let lo = min;
    let hi = max;
    const base = step[0];
    if (base !== "*") {
      const range = base.split("-");
      if (range.length > 2) return null;
      lo = Number(range[0]);
      hi = range.length === 2 ? Number(range[1]) : lo;
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
        return null;
      }
    }
    for (let v = lo; v <= hi; v += stepN) allowed.add(v);
  }
  return allowed;
}

export interface CronSpec {
  fields: Set<number>[];
}

/** Parse a five-field cron expression, or null if it's malformed. */
export function parseCron(expr: string): CronSpec | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const set = expandField(parts[i], FIELD_RANGES[i][0], FIELD_RANGES[i][1]);
    if (!set) return null;
    fields.push(set);
  }
  return { fields };
}

/** Does `date` fall on a minute this cron expression fires? (Sunday = 0 or 7.) */
export function cronMatches(spec: CronSpec, date: Date): boolean {
  const dow = date.getDay(); // 0..6, Sunday = 0
  return (
    spec.fields[0].has(date.getMinutes()) &&
    spec.fields[1].has(date.getHours()) &&
    spec.fields[2].has(date.getDate()) &&
    spec.fields[3].has(date.getMonth() + 1) &&
    (spec.fields[4].has(dow) || (dow === 0 && spec.fields[4].has(7)))
  );
}

/** The next minute at/after `from` (exclusive of `from`'s minute) that fires,
 * searching up to a year ahead. Null if nothing matches in that window. */
export function nextCronRun(spec: CronSpec, from: Date): Date | null {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (cronMatches(spec, d)) return new Date(d.getTime());
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

const REL_UNITS: Record<string, number> = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
};

/**
 * Parse an `at` time relative to `now`:
 *   HH:MM        → today at that time, or tomorrow if it has already passed
 *   now + N unit → that many seconds/minutes/hours from now
 * Returns the absolute fire time, or null if unparseable.
 */
export function parseAtTime(input: string, now: Date): Date | null {
  const text = input.trim().toLowerCase();

  const rel = /^now\s*\+\s*(\d+)\s*([a-z]+)$/.exec(text);
  if (rel) {
    const unit = REL_UNITS[rel[2]];
    if (!unit) return null;
    return new Date(now.getTime() + Number(rel[1]) * unit);
  }

  const hm = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h > 23 || m > 59) return null;
    const at = new Date(now.getTime());
    at.setHours(h, m, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    return at;
  }

  return null;
}
