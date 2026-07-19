import {
  isStandalone,
  pushSupported,
  subscribePush,
  type PushStatus,
  type Reminder,
  type ReminderStore,
} from "../pia/reminders.js";
import type { SupabaseLike } from "./client.js";

/** Result envelope shared by supabase-js query/command builders. */
interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

interface ReminderRow {
  id: string;
  body: string;
  next_run: string;
}

/** A chainable, awaitable filter builder — the slice of supabase-js we use. */
interface Filter<T> extends Promise<Result<T[]>> {
  eq(column: string, value: string | boolean): Filter<T>;
  gt(column: string, value: string): Filter<T>;
  order(column: string, opts?: { ascending?: boolean }): Filter<T>;
}

interface Table {
  select(columns: string): Filter<ReminderRow>;
  insert(row: Record<string, unknown>): Promise<Result<unknown>>;
  upsert(
    row: Record<string, unknown>,
    opts?: { onConflict?: string },
  ): Promise<Result<unknown>>;
  delete(): { eq(column: string, value: string): Promise<Result<unknown>> };
}

/** The narrow slice of the Supabase client this store needs. */
export interface PushClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  from(table: string): Table;
}

/**
 * The cloud reminder store: subscriptions and scheduled reminders in Postgres,
 * fired server-side by the `send-due` Edge Function on a `pg_cron` tick. RLS
 * keeps each user to their own rows.
 */
export class SupabaseReminderStore implements ReminderStore {
  private readonly db: PushClient;

  // Same narrow-interface trick the other adapters use: accept the shared
  // client type, then treat it as the slice this store needs.
  constructor(client: SupabaseLike) {
    this.db = client as unknown as PushClient;
  }

  available(): boolean {
    return true;
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.db.auth.getUser();
    return data.user?.id ?? null;
  }

  async isEnabled(): Promise<boolean> {
    if (!pushSupported() || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  }

  async enablePush(): Promise<PushStatus> {
    if (!(await this.uid())) return "no-cloud";
    if (!pushSupported()) return "unsupported";
    // iOS only allows push from an installed (Home Screen) PWA.
    if (!isStandalone() && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      return "not-standalone";
    }
    const result = await subscribePush();
    if (typeof result === "string") return result; // denied / unsupported

    const uid = await this.uid();
    if (!uid) return "no-cloud";
    const { error } = await this.db.from("push_subscriptions").upsert(
      {
        user_id: uid,
        endpoint: result.endpoint,
        p256dh: result.p256dh,
        auth: result.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) throw new Error(error.message);
    return "enabled";
  }

  async schedule(body: string, at: Date): Promise<void> {
    const uid = await this.uid();
    if (!uid) throw new Error("log in to set a reminder (run `login`)");
    const { error } = await this.db.from("reminders").insert({
      user_id: uid,
      body,
      next_run: at.toISOString(),
      cron: null,
      enabled: true,
    });
    if (error) throw new Error(error.message);
  }

  async list(): Promise<Reminder[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from("reminders")
      .select("id, body, next_run")
      .eq("enabled", true)
      .gt("next_run", now)
      .order("next_run", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, body: r.body, nextRun: r.next_run }));
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("reminders").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
