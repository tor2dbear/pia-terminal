// Unit tests for the "list updated" coalescing that the send-due Edge Function
// runs. The module is pure and lives in the function dir; like cron.parity, we
// import it across into Vitest (.js resolves to the .ts source) so the logic is
// exercised in CI even though it deploys to Deno.
import { describe, expect, it } from "vitest";
import {
  coalesceActivity,
  changesForRecipient,
  type Activity,
} from "../../supabase/functions/send-due/coalesce.js";

const OPTS = { debounceMs: 3 * 60_000, maxHoldMs: 15 * 60_000 };
const NOW = new Date("2026-07-26T12:00:00Z");

/** Build an activity row `mins` minutes before NOW. */
function row(id: string, listId: string, actorId: string | null, minsAgo: number): Activity {
  return {
    id,
    listId,
    actorId,
    createdAt: new Date(NOW.getTime() - minsAgo * 60_000).toISOString(),
  };
}

describe("coalesceActivity", () => {
  it("holds a burst that's still being edited (newest change too recent)", () => {
    const rows = [
      row("a", "L1", "anna", 5),
      row("b", "L1", "anna", 1), // 1 min ago — under the 3-min debounce
    ];
    expect(coalesceActivity(rows, NOW, OPTS)).toEqual([]);
  });

  it("delivers once a burst goes quiet for the debounce window", () => {
    const rows = [
      row("a", "L1", "anna", 8),
      row("b", "L1", "anna", 4), // newest is 4 min ago > 3-min debounce → settled
    ];
    const ready = coalesceActivity(rows, NOW, OPTS);
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ listId: "L1", total: 2 });
    expect(ready[0].rowIds.sort()).toEqual(["a", "b"]);
    expect(ready[0].byActor).toEqual({ anna: 2 });
  });

  it("force-flushes a nonstop-edited list once it hits the max hold", () => {
    // Newest change is only 1 min ago (not settled), but the burst opened 16 min
    // ago (> 15-min cap) — so it fires anyway rather than being held forever.
    const rows = [
      row("a", "L1", "anna", 16),
      row("b", "L1", "anna", 8),
      row("c", "L1", "anna", 1),
    ];
    const ready = coalesceActivity(rows, NOW, OPTS);
    expect(ready).toHaveLength(1);
    expect(ready[0].total).toBe(3);
  });

  it("groups per list and tallies changes per actor", () => {
    const rows = [
      row("a", "L1", "anna", 5),
      row("b", "L1", "bob", 4),
      row("c", "L1", "anna", 4),
      row("d", "L2", "cara", 4),
      row("e", "L3", "dan", 1), // L3 still active → excluded
    ];
    const ready = coalesceActivity(rows, NOW, OPTS);
    const byList = Object.fromEntries(ready.map((r) => [r.listId, r]));
    expect(Object.keys(byList).sort()).toEqual(["L1", "L2"]);
    expect(byList.L1.byActor).toEqual({ anna: 2, bob: 1 });
    expect(byList.L2.byActor).toEqual({ cara: 1 });
  });

  it("buckets an unknown (null) actor under the empty key", () => {
    const ready = coalesceActivity([row("a", "L1", null, 4)], NOW, OPTS);
    expect(ready[0].byActor).toEqual({ "": 1 });
  });
});

describe("changesForRecipient", () => {
  const [list] = coalesceActivity(
    [
      row("a", "L1", "anna", 5),
      row("b", "L1", "bob", 4),
      row("c", "L1", "anna", 4),
    ],
    NOW,
    OPTS,
  );

  it("tells a member about others' changes, not their own", () => {
    expect(changesForRecipient(list, "bob")).toBe(2); // anna's two
    expect(changesForRecipient(list, "anna")).toBe(1); // bob's one
  });

  it("gives an uninvolved member the full count", () => {
    expect(changesForRecipient(list, "cara")).toBe(3);
  });

  it("returns zero when a member made every change (nothing to hear)", () => {
    const [solo] = coalesceActivity(
      [row("a", "L1", "anna", 5), row("b", "L1", "anna", 4)],
      NOW,
      OPTS,
    );
    expect(changesForRecipient(solo, "anna")).toBe(0);
  });
});
