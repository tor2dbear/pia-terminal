/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Content-Security-Policy that matches PIA's real surface: everything is served
 * from 'self' except the Supabase backend, whose origin we derive from
 * VITE_SUPABASE_URL — https for REST/auth, wss for Realtime. With no Supabase
 * configured the app is fully local, so connect-src collapses to 'self' (same
 * "tree-shaken out when absent" spirit as the rest of the cloud path).
 *
 * Delivered two ways so it works wherever PIA is hosted:
 *  - a <meta> tag, which any static host honours (GitHub Pages today);
 *  - a `_headers` file for hosts that serve custom headers (Netlify), where it
 *    also carries the header-only directives a <meta> can't: frame-ancestors
 *    and the X-* / Referrer / Permissions hardening headers.
 * Build-only: the dev server needs inline scripts + an HMR websocket, so the
 * policy must not apply there.
 */
function securityHeaders(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "");
  const connect = ["'self'"];
  const supabase = env.VITE_SUPABASE_URL?.trim();
  if (supabase) {
    try {
      const { host } = new URL(supabase);
      connect.push(`https://${host}`, `wss://${host}`);
    } catch {
      // Malformed URL — stay local-only rather than emit a broken directive.
    }
  }

  // Directives valid inside a <meta http-equiv> tag (frame-ancestors is
  // header-only and would be ignored there with a console warning).
  const base = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ];
  const metaCsp = base.join("; ");
  const headerCsp = [...base, "frame-ancestors 'none'"].join("; ");

  return {
    name: "pia-security-headers",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: metaCsp },
            injectTo: "head-prepend",
          },
        ],
      };
    },
    generateBundle() {
      const headers =
        [
          "/*",
          `  Content-Security-Policy: ${headerCsp}`,
          "  X-Frame-Options: DENY",
          "  X-Content-Type-Options: nosniff",
          "  Referrer-Policy: no-referrer",
          "  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()",
          "",
        ].join("\n");
      this.emitFile({ type: "asset", fileName: "_headers", source: headers });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [securityHeaders(mode)],
  build: {
    target: "es2020",
    outDir: "dist",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
