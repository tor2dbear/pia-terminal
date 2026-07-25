// Parity guard for the two cron mirrors: the client's UTC path in
// `src/pia/cron.ts` and the Deno edge copy in
// `supabase/functions/send-due/cron.ts`. They can't share one module (different
// runtimes; the edge-deploy bundler won't follow an import out of the function
// dir), so recurring-reminder scheduling depends on the two staying byte-for-
// byte equivalent in behaviour. This runs a battery of tricky expressions
// through BOTH and fails the moment they disagree — the Codex-found cron bugs
// (leap-day window, dom/dow OR, Sunday = 0 or 7) each had to be fixed in both
// places, and this is what would have caught a one-sided fix.
//
// Each case also carries an `expect` golden, so a bug that somehow lands in
// *both* copies identically still fails here rather than passing on agreement.
import { describe, expect, it } from "vitest";
import {
  parseCron as parseClient,
  cronMatchesUtc,
  nextCronRunUtc,
} from "./cron.js";
import {
  parseCron as parseEdge,
  cronMatches as edgeMatches,
  nextCronRun as edgeNextRun,
} from "../../supabase/functions/send-due/cron.js";

/** Client-side match via the UTC path (parse + match), null if unparseable. */
function clientMatch(expr: string, at: string): boolean | null {
  const spec = parseClient(expr);
  return spec ? cronMatchesUtc(spec, new Date(at)) : null;
}
/** Edge-side match, null if unparseable. */
function edgeMatch(expr: string, at: string): boolean | null {
  const cron = parseEdge(expr);
  return cron ? edgeMatches(cron, new Date(at)) : null;
}
/** Client-side next fire as an ISO string, or null. */
function clientNext(expr: string, from: string): string | null {
  const spec = parseClient(expr);
  return spec ? (nextCronRunUtc(spec, new Date(from))?.toISOString() ?? null) : null;
}
/** Edge-side next fire as an ISO string, or null. */
function edgeNext(expr: string, from: string): string | null {
  return edgeNextRun(expr, new Date(from))?.toISOString() ?? null;
}

// (expression, instant, does-it-fire) — all UTC.
const MATCH_CASES: { expr: string; at: string; expect: boolean | null }[] = [
  { expr: "0 9 * * *", at: "2026-07-25T09:00:00Z", expect: true },
  { expr: "0 9 * * *", at: "2026-07-25T09:01:00Z", expect: false },
  { expr: "30 8 * * *", at: "2026-07-25T08:30:00Z", expect: true },
  // Sunday accepted as both 0 and 7.
  { expr: "0 0 * * 7", at: "2026-07-26T00:00:00Z", expect: true }, // Sun
  { expr: "0 0 * * 7", at: "2026-07-27T00:00:00Z", expect: false }, // Mon
  { expr: "0 0 * * 0", at: "2026-07-26T00:00:00Z", expect: true }, // Sun
  // dom + dow both restricted → fires when EITHER matches (cron's union quirk).
  { expr: "0 0 13 * 5", at: "2026-07-13T00:00:00Z", expect: true }, // the 13th (a Mon)
  { expr: "0 0 13 * 5", at: "2026-07-17T00:00:00Z", expect: true }, // a Friday, not the 13th
  { expr: "0 0 13 * 5", at: "2026-07-14T00:00:00Z", expect: false }, // neither
  // Ranges + steps, weekdays only.
  { expr: "*/15 9-17 * * 1-5", at: "2026-07-24T09:30:00Z", expect: true }, // Fri, in window
  { expr: "*/15 9-17 * * 1-5", at: "2026-07-25T09:30:00Z", expect: false }, // Sat
  { expr: "*/15 9-17 * * 1-5", at: "2026-07-24T09:07:00Z", expect: false }, // min not /15
  // Malformed → both parse to null (match reported as null).
  { expr: "60 0 * * *", at: "2026-07-25T00:00:00Z", expect: null },
  { expr: "0 0 * *", at: "2026-07-25T00:00:00Z", expect: null }, // four fields
];

// (expression, from-instant, next-fire-ISO) — all UTC.
const NEXT_CASES: { expr: string; from: string; expect: string | null }[] = [
  { expr: "0 9 * * *", from: "2026-07-25T10:00:00Z", expect: "2026-07-26T09:00:00.000Z" },
  { expr: "*/15 * * * *", from: "2026-07-25T09:07:00Z", expect: "2026-07-25T09:15:00.000Z" },
  { expr: "0 0 * * 7", from: "2026-07-20T00:00:00Z", expect: "2026-07-26T00:00:00.000Z" }, // next Sun
  { expr: "0 0 13 * 5", from: "2026-07-13T00:01:00Z", expect: "2026-07-17T00:00:00.000Z" }, // next Fri
  // Leap-day schedule: the ~4-year search window must reach Feb 29 2028.
  { expr: "0 0 29 2 *", from: "2026-03-01T00:00:00Z", expect: "2028-02-29T00:00:00.000Z" },
  // Never fires (Feb 30 doesn't exist) → both exhaust the window and return null.
  { expr: "0 0 30 2 *", from: "2026-01-01T00:00:00Z", expect: null },
  // Malformed → null on both.
  { expr: "0 0 32 * *", from: "2026-07-25T00:00:00Z", expect: null },
];

describe("cron parity: client (src/pia/cron.ts) vs edge (send-due/cron.ts)", () => {
  it.each(MATCH_CASES)("matches agree — $expr @ $at", ({ expr, at, expect: want }) => {
    const client = clientMatch(expr, at);
    const edge = edgeMatch(expr, at);
    expect(client).toBe(edge); // the drift guard
    expect(client).toBe(want); // …and the golden, so a shared bug still fails
  });

  it.each(NEXT_CASES)("next-run agree — $expr from $from", ({ expr, from, expect: want }) => {
    const client = clientNext(expr, from);
    const edge = edgeNext(expr, from);
    expect(client).toBe(edge); // the drift guard
    expect(client).toBe(want); // …and the golden
  });
});
