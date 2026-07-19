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

  // 1) Due reminders (one-off: fire once, then disable).
  const { data: due } = await supabase
    .from("reminders")
    .select("id, user_id, body")
    .eq("enabled", true)
    .lte("next_run", now);
  for (const r of due ?? []) {
    const c = await sendToUser(supabase, vapid, r.user_id, "⏰ Reminder", r.body);
    sent += c.sent;
    cleaned += c.cleaned;
    await supabase.from("reminders").update({ enabled: false, last_sent: now }).eq("id", r.id);
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
