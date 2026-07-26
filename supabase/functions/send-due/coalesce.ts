// Coalescing for "list updated" collaboration notifications. A shared checklist
// is saved on every toggle/add, so the DB logs one lightweight row per content
// edit (public.shared_list_activity). Left un-coalesced that would push a
// notification per save — several a second during an edit. This folds a burst
// into a single summary per list and, crucially, decides *when* a burst has
// settled enough to deliver.
//
// Pure and runtime-agnostic (no Deno/Node APIs) so it runs both inside the edge
// function (index.ts) and under Vitest (src/pia/list-activity.test.ts) — the
// same extraction trick cron.ts uses to stay testable.

export interface Activity {
  id: string;
  listId: string;
  actorId: string | null;
  createdAt: string; // ISO 8601
}

export interface CoalesceOpts {
  /** A burst is delivered once it's been quiet this long (the edit settled). */
  debounceMs: number;
  /** …but never held longer than this, so a nonstop-edited list still fires. */
  maxHoldMs: number;
}

export interface ReadyList {
  listId: string;
  /** Every activity row folded into this summary — delete exactly these. */
  rowIds: string[];
  /** Total changes in the burst. */
  total: number;
  /** actorId ("" = unknown) → how many of the changes were theirs. */
  byActor: Record<string, number>;
}

/**
 * Group pending activity by list and return the lists whose burst is ready to
 * notify — either quiet for `debounceMs`, or open since its first change for
 * `maxHoldMs`. A list still being actively edited (newest change younger than
 * the debounce *and* the burst younger than the max hold) is left for a later
 * tick. `rowIds` covers every row in the summary, so the caller deletes exactly
 * those and a fresh window starts for whatever arrives next.
 */
export function coalesceActivity(
  rows: Activity[],
  now: Date,
  opts: CoalesceOpts,
): ReadyList[] {
  const groups = new Map<string, Activity[]>();
  for (const r of rows) {
    const g = groups.get(r.listId);
    if (g) g.push(r);
    else groups.set(r.listId, [r]);
  }

  const nowMs = now.getTime();
  const ready: ReadyList[] = [];
  for (const [listId, list] of groups) {
    let newest = -Infinity;
    let oldest = Infinity;
    for (const r of list) {
      const t = Date.parse(r.createdAt);
      if (t > newest) newest = t;
      if (t < oldest) oldest = t;
    }
    const settled = nowMs - newest >= opts.debounceMs;
    const capped = nowMs - oldest >= opts.maxHoldMs;
    if (!settled && !capped) continue;

    const byActor: Record<string, number> = {};
    for (const r of list) {
      const key = r.actorId ?? "";
      byActor[key] = (byActor[key] ?? 0) + 1;
    }
    ready.push({ listId, rowIds: list.map((r) => r.id), total: list.length, byActor });
  }
  return ready;
}

/**
 * How many changes a given member should hear about: everyone's but their own,
 * so the person who did the editing isn't notified about themselves.
 */
export function changesForRecipient(list: ReadyList, userId: string): number {
  return list.total - (list.byActor[userId] ?? 0);
}
