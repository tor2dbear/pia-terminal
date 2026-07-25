import { describe, expect, it } from "vitest";
import { parseCron, cronMatches, nextCronRun, nextCronRunUtc, parseAtTime } from "./cron.js";

describe("parseCron", () => {
  it("accepts valid expressions", () => {
    for (const e of ["* * * * *", "0 9 * * 1", "*/15 * * * *", "0 9 * * 1,3,5", "0-30 * * * *"]) {
      expect(parseCron(e)).not.toBeNull();
    }
  });

  it("rejects malformed ones", () => {
    for (const e of ["* * * *", "60 * * * *", "* 24 * * *", "abc * * * *", "* * * * * *"]) {
      expect(parseCron(e)).toBeNull();
    }
  });
});

describe("cronMatches", () => {
  const at = (h: number, m: number, dow = 18) => new Date(2026, 6, dow, h, m); // Jul 2026, local

  it("matches an exact minute", () => {
    const spec = parseCron("0 9 * * *")!;
    expect(cronMatches(spec, at(9, 0))).toBe(true);
    expect(cronMatches(spec, at(9, 1))).toBe(false);
  });

  it("honours steps", () => {
    const spec = parseCron("*/2 * * * *")!;
    expect(cronMatches(spec, at(9, 4))).toBe(true);
    expect(cronMatches(spec, at(9, 5))).toBe(false);
  });

  it("accepts 7 as Sunday", () => {
    const spec = parseCron("0 9 * * 7")!; // 7 must parse, not just 0
    expect(spec).not.toBeNull();
    expect(cronMatches(spec, new Date(2026, 0, 4, 9, 0))).toBe(true); // Jan 4 2026 is Sunday
    expect(cronMatches(spec, new Date(2026, 0, 5, 9, 0))).toBe(false); // Monday
  });

  it("ORs day-of-month and day-of-week when both are restricted", () => {
    // `0 9 1 * 1`: the 1st OR any Monday (Jan 1 2026 = Thu, Jan 5 = Mon).
    const spec = parseCron("0 9 1 * 1")!;
    expect(cronMatches(spec, new Date(2026, 0, 1, 9, 0))).toBe(true); // the 1st (a Thursday)
    expect(cronMatches(spec, new Date(2026, 0, 5, 9, 0))).toBe(true); // a Monday (the 5th)
    expect(cronMatches(spec, new Date(2026, 0, 6, 9, 0))).toBe(false); // neither
  });

  it("ANDs the day fields normally when one is `*`", () => {
    // `0 9 1 * *`: only the 1st, regardless of weekday.
    const spec = parseCron("0 9 1 * *")!;
    expect(cronMatches(spec, new Date(2026, 0, 1, 9, 0))).toBe(true);
    expect(cronMatches(spec, new Date(2026, 0, 5, 9, 0))).toBe(false); // Monday but not the 1st
  });
});

describe("nextCronRun", () => {
  it("finds the next matching minute", () => {
    const spec = parseCron("0 9 * * *")!;
    const next = nextCronRun(spec, new Date(2026, 6, 18, 12, 0)); // noon
    expect(next?.getDate()).toBe(19); // tomorrow
    expect(next?.getHours()).toBe(9);
    expect(next?.getMinutes()).toBe(0);
  });
});

describe("nextCronRunUtc", () => {
  it("finds the next fire in UTC, independent of the local zone", () => {
    const spec = parseCron("0 9 * * *")!; // 09:00 UTC daily
    // 2026-07-18T12:00:00Z is past 09:00 UTC today → next is tomorrow 09:00 UTC.
    const next = nextCronRunUtc(spec, new Date("2026-07-18T12:00:00Z"));
    expect(next?.toISOString()).toBe("2026-07-19T09:00:00.000Z");
  });

  it("returns null for a schedule that never fires (Feb 30)", () => {
    expect(nextCronRunUtc(parseCron("0 0 30 2 *")!, new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });
});

describe("parseAtTime", () => {
  const now = new Date(2026, 6, 18, 12, 0, 0);

  it("reads relative times", () => {
    expect(parseAtTime("now+5m", now)?.getTime()).toBe(now.getTime() + 5 * 60_000);
    expect(parseAtTime("now + 2 hours", now)?.getTime()).toBe(now.getTime() + 2 * 3_600_000);
    expect(parseAtTime("now+30s", now)?.getTime()).toBe(now.getTime() + 30_000);
  });

  it("reads HH:MM, rolling to tomorrow if already passed", () => {
    expect(parseAtTime("14:30", now)?.getHours()).toBe(14);
    expect(parseAtTime("14:30", now)?.getDate()).toBe(18); // later today
    expect(parseAtTime("10:00", now)?.getDate()).toBe(19); // already passed → tomorrow
  });

  it("rejects nonsense", () => {
    expect(parseAtTime("25:00", now)).toBeNull();
    expect(parseAtTime("soon", now)).toBeNull();
    expect(parseAtTime("now + 5 potatoes", now)).toBeNull();
  });
});
