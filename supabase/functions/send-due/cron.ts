// Cron maths for recurring reminders, read in UTC. This is a deliberate,
// hand-kept MIRROR of the client's UTC path in `src/pia/cron.ts`
// (cronMatchesUtc / nextCronRunUtc + their shared parse/expand/day helpers), so
// the server reschedules a job the same minute the client computed its first
// fire. The two live in different runtimes (Deno here, the browser there) and
// can't share a module without the edge-deploy bundler following an import out
// of this directory — so instead `src/pia/cron.parity.test.ts` runs a shared
// battery of expressions through BOTH copies and fails CI the moment they
// disagree. Change one, change the other (and add a parity vector).
//
// Five fields: minute hour day-of-month month day-of-week (Sunday = 0 or 7).

const FIELD_RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

export interface Cron {
  fields: Set<number>[];
  domStar: boolean;
  dowStar: boolean;
}

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
    if (step[0] !== "*") {
      const range = step[0].split("-");
      if (range.length > 2) return null;
      lo = Number(range[0]);
      hi = range.length === 2 ? Number(range[1]) : lo;
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null;
    }
    for (let v = lo; v <= hi; v += stepN) allowed.add(v);
  }
  return allowed;
}

/** Parse a five-field cron expression, or null if it's malformed. */
export function parseCron(expr: string): Cron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const set = expandField(parts[i], FIELD_RANGES[i][0], FIELD_RANGES[i][1]);
    if (!set) return null;
    fields.push(set);
  }
  return { fields, domStar: parts[2].startsWith("*"), dowStar: parts[4].startsWith("*") };
}

// When both day-of-month and day-of-week are restricted, cron fires when EITHER
// matches; otherwise they combine normally. Sunday is 0 or 7.
function dayMatches(c: Cron, dom: number, dow: number): boolean {
  const domMatch = c.fields[2].has(dom);
  const dowMatch = c.fields[4].has(dow) || (dow === 0 && c.fields[4].has(7));
  return c.domStar || c.dowStar ? domMatch && dowMatch : domMatch || dowMatch;
}

/** Does `d` fall on a minute this cron expression fires? (read in UTC) */
export function cronMatches(c: Cron, d: Date): boolean {
  return (
    c.fields[0].has(d.getUTCMinutes()) &&
    c.fields[1].has(d.getUTCHours()) &&
    c.fields[3].has(d.getUTCMonth() + 1) &&
    dayMatches(c, d.getUTCDate(), d.getUTCDay())
  );
}

/** Next UTC fire after `from`, or null if the expression is invalid / never
 * fires. Searches ~4 years ahead, enough for a Feb 29 (leap-day) schedule. */
export function nextCronRun(expr: string, from: Date): Date | null {
  const cron = parseCron(expr);
  if (!cron) return null;
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 4 * 366 * 24 * 60; i++) { // ~4 years: leap-day schedules
    if (cronMatches(cron, d)) return new Date(d.getTime());
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}
