// send-due — delivers push: due reminders AND queued collaboration
// notifications. Called every minute by pg_cron via pg_net, authenticated with
// a shared secret (x-cron-secret) rather than a user JWT, so verify_jwt is off.
// Reads VAPID keys from Vault (service role); does the Web Push crypto with
// `web-push` and sends via Deno fetch (avoids the library's Node http path).
//
// Deployed to the live project via MCP; kept here for version control. Redeploy
// with the Supabase CLI (`supabase functions deploy send-due --no-verify-jwt`).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface Config {
  vapid_public: string;
  vapid_private: string;
  cron_secret: string;
  vapid_subject: string;
}

// ---- cron (UTC) — mirrors src/pia/cron.ts so recurring reminders reschedule
// the same way the client computed their first fire. Five fields:
// minute hour day-of-month month day-of-week (Sunday = 0 or 7).
const FIELD_RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

interface Cron {
  fields: Set<number>[];
  domStar: boolean;
  dowStar: boolean;
}

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

function parseCron(expr: string): Cron | null {
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

function cronMatches(c: Cron, d: Date): boolean {
  return (
    c.fields[0].has(d.getUTCMinutes()) &&
    c.fields[1].has(d.getUTCHours()) &&
    c.fields[3].has(d.getUTCMonth() + 1) &&
    dayMatches(c, d.getUTCDate(), d.getUTCDay())
  );
}

/** Next UTC fire after `from`, or null if the expression is invalid / never fires. */
function nextCronRun(expr: string, from: Date): Date | null {
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

interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

// Send one {title, body} to every push subscription a user has. Expired
// subscriptions (404/410) are pruned. Returns delivery counts.
async function sendToUser(
  supabase: SupabaseClient,
  vapid: VapidDetails,
  userId: string,
  title: string,
  body: string,
): Promise<{ sent: number; cleaned: number }> {
  let sent = 0;
  let cleaned = 0;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  const payload = JSON.stringify({ title, body });
  for (const s of subs ?? []) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      const details = webpush.generateRequestDetails(subscription, payload, {
        vapidDetails: vapid,
        contentEncoding: "aes128gcm",
        TTL: 60 * 60,
      });
      const res = await fetch(details.endpoint, {
        method: details.method,
        headers: details.headers as HeadersInit,
        body: details.body as BodyInit,
      });
      if (res.status === 404 || res.status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
        cleaned++;
      } else if (res.ok) {
        sent++;
      }
    } catch (_e) {
      // swallow a single bad subscription; keep going
    }
  }
  return { sent, cleaned };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg, error: cfgErr } = await supabase.rpc("get_push_config").single<Config>();
  if (cfgErr || !cfg) return Response.json({ error: "config unavailable" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== cfg.cron_secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const vapid: VapidDetails = {
    subject: cfg.vapid_subject,
    publicKey: cfg.vapid_public,
    privateKey: cfg.vapid_private,
  };
  const now = new Date().toISOString();
  let sent = 0;
  let cleaned = 0;

  // 1) Due reminders. One-off jobs fire once, then disable; a recurring job
  //    (with a cron expression) is rescheduled to its next UTC fire instead.
  const { data: due } = await supabase
    .from("reminders")
    .select("id, user_id, body, cron")
    .eq("enabled", true)
    .lte("next_run", now);
  for (const r of due ?? []) {
    const c = await sendToUser(supabase, vapid, r.user_id, "⏰ Reminder", r.body);
    sent += c.sent;
    cleaned += c.cleaned;
    const nextRun = r.cron ? nextCronRun(r.cron, new Date()) : null;
    await supabase
      .from("reminders")
      .update(
        nextRun
          ? { next_run: nextRun.toISOString(), last_sent: now }
          : { enabled: false, last_sent: now },
      )
      .eq("id", r.id);
  }

  // 2) Queued collaboration notifications (e.g. "X shared a list with you").
  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, user_id, title, body")
    .is("sent_at", null)
    .limit(100);
  for (const n of notifs ?? []) {
    const c = await sendToUser(supabase, vapid, n.user_id, n.title, n.body);
    sent += c.sent;
    cleaned += c.cleaned;
    await supabase.from("notifications").update({ sent_at: now }).eq("id", n.id);
  }

  return Response.json({
    ok: true,
    reminders: due?.length ?? 0,
    notifications: notifs?.length ?? 0,
    sent,
    cleaned,
  });
});
