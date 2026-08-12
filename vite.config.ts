/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Single source of truth for app metadata: package.json. Exposed as compile-time
// constants so the boot banner, `neofetch`, `about`, … always reflect it — bump
// the version with `npm version`, edit the URLs there, and everything follows.
const PKG = JSON.parse(readFileSync("./package.json", "utf8"));
const PIA_VERSION: string = PKG.version;
const PIA_REPO_URL: string = (PKG.repository?.url ?? "")
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");
const PIA_HOMEPAGE: string = PKG.homepage ?? "";
// The published package is the reusable engine (see scripts/build-engine.mjs),
// not this app workspace's name — that isn't on npm.
const PIA_NPM_URL = "https://www.npmjs.com/package/pia-terminal-engine";

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
  // Cloudflare Web Analytics: the beacon (loaded from static.cloudflareinsights.com)
  // reports page views to cloudflareinsights.com. Both must be allow-listed, or
  // the strict CSP blocks the script and its RUM POST — leaving analytics empty.
  const connect = ["'self'", "https://cloudflareinsights.com"];
  const script = ["'self'", "https://static.cloudflareinsights.com"];
  // The MCP connector's OAuth authorize form (rendered by the app) POSTs the
  // pasted token to the Supabase Edge Function, so form-action must allow that
  // origin — otherwise the browser silently blocks the submit.
  const formAction = ["'self'"];
  const supabase = env.VITE_SUPABASE_URL?.trim();
  if (supabase) {
    try {
      const { host } = new URL(supabase);
      connect.push(`https://${host}`, `wss://${host}`);
      formAction.push(`https://${host}`);
    } catch {
      // Malformed URL — stay local-only rather than emit a broken directive.
    }
  }

  // Directives valid inside a <meta http-equiv> tag (frame-ancestors is
  // header-only and would be ignored there with a console warning).
  const base = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The service worker (push reminders) and the PWA manifest, both same-origin.
    "worker-src 'self'",
    "manifest-src 'self'",
    `connect-src ${connect.join(" ")}`,
    // The python package runs Pyodide inside a same-origin sandbox iframe
    // (/python-sandbox.html), which carries its own relaxed CSP. The main app
    // only needs permission to *frame* that same-origin page.
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formAction.join(" ")}`,
    "upgrade-insecure-requests",
  ];
  const metaCsp = base.join("; ");
  const headerCsp = [...base, "frame-ancestors 'none'"].join("; ");

  // The isolated Python sandbox needs wasm-eval to run Pyodide, but everything
  // is same-origin ('self') — Pyodide is self-hosted under /pyodide/, no CDN.
  // This relaxation is scoped to that one page (a separate browsing context
  // reached only via an iframe), so it never applies to the main app.
  const sandboxCsp = [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "child-src blob:",
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");

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
          // The sandbox page opts into its own looser policy so Pyodide's WASM
          // can run. Cloudflare Pages _headers *append* headers from every
          // matching rule (a specific rule does NOT replace `/*`), so without the
          // `! Header` detaches below the page would get BOTH this relaxed CSP and
          // the strict `/*` one — and the browser enforces their intersection, so
          // the strict policy wins and WASM is blocked. `!` drops the inherited
          // `/*` values first; then we set the sandbox's own. Same for
          // X-Frame-Options (DENY → SAMEORIGIN so the terminal may frame it).
          //
          // Two entries because Cloudflare "clean URLs" 308-redirect
          // /python-sandbox.html → /python-sandbox, and _headers matches the
          // *served* path: prod hits the extensionless one, `vite dev`/`preview`
          // (no redirect) hits the `.html` one.
          "/python-sandbox.html",
          "  ! Content-Security-Policy",
          "  ! X-Frame-Options",
          `  Content-Security-Policy: ${sandboxCsp}`,
          "  X-Frame-Options: SAMEORIGIN",
          "  X-Content-Type-Options: nosniff",
          "  Referrer-Policy: no-referrer",
          "",
          "/python-sandbox",
          "  ! Content-Security-Policy",
          "  ! X-Frame-Options",
          `  Content-Security-Policy: ${sandboxCsp}`,
          "  X-Frame-Options: SAMEORIGIN",
          "  X-Content-Type-Options: nosniff",
          "  Referrer-Policy: no-referrer",
          "",
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

/**
 * Emit `package-sizes.json` — each brew package's real gzip size — so
 * `brew install` can show honest bytes (see src/packages/sizes.ts). A chunk's
 * gzip size only exists *after* bundling, so it can't be a compile-time `define`
 * like the version; the built app fetches this same-origin asset at runtime
 * instead (CSP `connect-src 'self'`). Keyed by the package's directory name
 * under src/packages, which is its catalog name.
 */
function packageSizes(): Plugin {
  return {
    name: "pia-package-sizes",
    apply: "build",
    generateBundle(_options, bundle) {
      const sizes: Record<string, number> = {};
      for (const file of Object.values(bundle)) {
        if (file.type !== "chunk") continue;
        const match = file.facadeModuleId?.match(
          /[/\\]packages[/\\]([^/\\]+)[/\\]index\.[jt]s$/,
        );
        if (match) sizes[match[1]] = gzipSync(Buffer.from(file.code)).length;
      }
      this.emitFile({
        type: "asset",
        fileName: "package-sizes.json",
        source: JSON.stringify(sizes),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [securityHeaders(mode), packageSizes()],
  define: {
    __PIA_VERSION__: JSON.stringify(PIA_VERSION),
    __PIA_REPO_URL__: JSON.stringify(PIA_REPO_URL),
    __PIA_HOMEPAGE__: JSON.stringify(PIA_HOMEPAGE),
    __PIA_NPM_URL__: JSON.stringify(PIA_NPM_URL),
  },
  build: {
    target: "es2020",
    outDir: "dist",
    // Two pages: PIA itself, and the /adventure/ demo that proves the terminal
    // engine is reusable (a different app on the same core).
    rollupOptions: {
      input: {
        main: "index.html",
        adventure: "adventure/index.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
