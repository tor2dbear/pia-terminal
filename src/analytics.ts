/**
 * Cloudflare Web Analytics — loaded only on the production host.
 *
 * The beacon token is a fixed string baked into the client, and the same build
 * is deployed to every `*.pages.dev` PR preview; it also runs under `npm run
 * dev`. Firing everywhere would report localhost and preview traffic into the
 * production property and pollute it. Gating on the hostname at runtime is the
 * only place that can tell production from preview — they share one build.
 *
 * Injected as a classic (non-module) script so Cloudflare's loader can read the
 * token from `document.currentScript` (null for module scripts). Same-origin
 * injection stays within the strict CSP; the beacon host and its RUM endpoint
 * are allow-listed there (see vite.config.ts).
 */

const PROD_HOST = "pia.tor2dbear.com";
const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
const TOKEN = "6f7e6b4189374ec6a89af10beb78e9f9";

/** Load the analytics beacon iff we're on the production host. */
export function loadAnalytics(hostname: string = location.hostname): void {
  if (hostname !== PROD_HOST) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = BEACON_SRC;
  script.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN }));
  document.head.append(script);
}
