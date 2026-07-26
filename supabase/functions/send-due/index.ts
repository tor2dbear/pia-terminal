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
// UTC cron maths, extracted so it can be imported here AND exercised against the
// client's copy (src/pia/cron.ts) by src/pia/cron.parity.test.ts — the guard
// that catches the two mirrors drifting apart.
import { nextCronRun } from "./cron.ts";

// A shared list saves on every toggle/add, so "list updated" pushes are
// coalesced: a list is summarised once its edits go quiet for the debounce, but
// never held past the max hold. The folding itself is done atomically in the DB
// (public.flush_list_activity) — claim + summarise + enqueue in one transaction,
// so two overlapping ticks can't double-send. These are just the knobs.
const ACTIVITY_DEBOUNCE_SECONDS = 3 * 60;
const ACTIVITY_MAX_HOLD_SECONDS = 15 * 60;

interface Config {
  vapid_public: string;
  vapid_private: string;
  cron_secret: string;
  vapid_subject: string;
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

  // 0) Fold settled "list updated" bursts into the notifications queue. One
  //    atomic DB call (claim + summarise + enqueue) — done before the drain
  //    below so today's summaries go out this same tick, not next.
  const { data: listUpdates } = await supabase.rpc("flush_list_activity", {
    p_debounce_seconds: ACTIVITY_DEBOUNCE_SECONDS,
    p_maxhold_seconds: ACTIVITY_MAX_HOLD_SECONDS,
  });

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

  // 2) Queued collaboration notifications (invites + coalesced list-updates).
  //    Claim the batch atomically: stamp sent_at and get the rows back in one
  //    UPDATE, so two overlapping ticks can't each grab the same still-unsent
  //    row and double-deliver (row locks make the second UPDATE re-evaluate
  //    `sent_at is null` and skip what the first claimed). Trade-off: a delivery
  //    that then fails drops that one push rather than retrying — acceptable for
  //    these non-critical pushes, the same way an expired subscription is
  //    dropped, and the price of never sending a duplicate.
  const { data: notifs } = await supabase
    .from("notifications")
    .update({ sent_at: now })
    .is("sent_at", null)
    .select("id, user_id, title, body");
  for (const n of notifs ?? []) {
    const c = await sendToUser(supabase, vapid, n.user_id, n.title, n.body);
    sent += c.sent;
    cleaned += c.cleaned;
  }

  return Response.json({
    ok: true,
    reminders: due?.length ?? 0,
    notifications: notifs?.length ?? 0,
    listUpdates: (listUpdates as number | null) ?? 0,
    sent,
    cleaned,
  });
});
