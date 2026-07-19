/*
 * PIA service worker. Two jobs:
 *
 *  1. Push (reminders + collaboration notifications): show the notification when
 *     a message arrives, focus the app on click. Works even when the tab is
 *     closed — the reason the app is a PWA.
 *
 *  2. Offline: cache the app shell so PIA loads instantly and keeps working
 *     without a network. Runtime caching (no build-time precache list): assets
 *     are cached as they're first requested, so after one online visit the app
 *     is available offline. Guest data already lives in localStorage, so a
 *     cached shell is all that's needed for a fully offline "little computer".
 */
const CACHE = "pia-v1";

// ---- offline: cache the shell, serve it back ------------------------------

self.addEventListener("install", (event) => {
  // Warm the cache with the app shell so the very first offline navigation
  // works; best-effort (never block activation on it).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest"]))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Drop caches from older versions.
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only our own origin, and never the heavy Pyodide runtime (it caches itself
  // on demand and would bloat the shell cache).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/pyodide/")) return;

  // Navigations: network-first (so a fresh deploy's HTML wins), falling back to
  // the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))),
    );
    return;
  }

  // Assets (hashed, immutable): stale-while-revalidate — serve cache instantly,
  // refresh it in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// ---- push: show reminders / collaboration notifications -------------------

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
