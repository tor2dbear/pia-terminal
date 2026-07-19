// send-due — fires due push reminders. Called every minute by pg_cron via
// pg_net, authenticated with a shared secret (x-cron-secret) rather than a user
// JWT, so verify_jwt is off. Reads VAPID keys from Vault (service role), does
// the Web Push crypto with the `web-push` library, and sends via Deno fetch
// (avoids the library's Node http path).
//
// Deployed to the live project via MCP; kept here for version control. Redeploy
// with the Supabase CLI (`supabase functions deploy send-due --no-verify-jwt`).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface Config {
  vapid_public: string;
  vapid_private: string;
  cron_secret: string;
  vapid_subject: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg, error: cfgErr } = await supabase.rpc("get_push_config").single<Config>();
  if (cfgErr || !cfg) {
    return Response.json({ error: "config unavailable" }, { status: 500 });
  }

  // Authenticate the scheduler call.
  if (req.headers.get("x-cron-secret") !== cfg.cron_secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: due, error: dueErr } = await supabase
    .from("reminders")
    .select("id, user_id, body, cron")
    .eq("enabled", true)
    .lte("next_run", now);
  if (dueErr) return Response.json({ error: dueErr.message }, { status: 500 });

  const vapidDetails = {
    subject: cfg.vapid_subject,
    publicKey: cfg.vapid_public,
    privateKey: cfg.vapid_private,
  };

  let sent = 0;
  let cleaned = 0;
  for (const r of due ?? []) {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", r.user_id);

    for (const s of subs ?? []) {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      const payload = JSON.stringify({ title: "PIA", body: r.body });
      try {
        const details = webpush.generateRequestDetails(subscription, payload, {
          vapidDetails,
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

    // One-off reminders (cron is null) fire once. Recurring is future work.
    await supabase.from("reminders").update({ enabled: false, last_sent: now }).eq("id", r.id);
  }

  return Response.json({ ok: true, due: due?.length ?? 0, sent, cleaned });
});
