import { describe, expect, it } from "vitest";
import { parseCron, cronMatches, nextCronRun, parseAtTime } from "./cron.js";

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
