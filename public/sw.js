/*
 * PIA service worker. Kept deliberately tiny: it exists so the app is
 * installable (a PWA — the iOS requirement for web push) and can receive push
 * messages when the tab is closed. It does not cache or intercept fetches.
 *
 * The `send-due` Edge Function posts a JSON body `{ title, body }`; we show it
 * as a notification. Clicking it focuses (or opens) the app.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "PIA", body: "reminder" };
  try {
    if (event.data) data = event.data.json();
  } catch (_e) {
    if (event.data) data = { title: "PIA", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "PIA", {
      body: data.body || "",
      icon: "./favicon-32.png",
      badge: "./favicon-32.png",
      tag: "pia-reminder",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow("./") : undefined;
    }),
  );
});
