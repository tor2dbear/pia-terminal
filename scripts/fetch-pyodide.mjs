/*
 * Fetch the Pyodide runtime for self-hosting. Runs as `prebuild`, so a
 * production build serves Python entirely from PIA's own origin — no CDN at
 * runtime, and the sandbox CSP can stay locked to 'self'.
 *
 * The ~14 MB of core files land in public/pyodide/ (gitignored) and vite copies
 * them into dist/pyodide/. Idempotent: skips files already present (so a warm
 * CI cache costs nothing), retries transient failures, and fails the build if
 * it genuinely can't fetch — a python package without its runtime is broken, so
 * better to fail loudly than ship a dead command. Uses curl, which honours the
 * proxy/CA setup in locked-down environments and works directly elsewhere.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";

const VERSION = "0.26.2";
const BASE = "https://cdn.jsdelivr.net/pyodide/v" + VERSION + "/full";
const DIR = "public/pyodide";

// filename → minimum plausible size, a guard against truncated or HTML error
// pages being saved as if they were the real asset.
const FILES = {
  "pyodide.js": 5_000,
  "pyodide.asm.js": 500_000,
  "pyodide.asm.wasm": 5_000_000,
  "python_stdlib.zip": 1_000_000,
  "pyodide-lock.json": 50_000,
};

function sizeOf(name) {
  try {
    return statSync(`${DIR}/${name}`).size;
  } catch {
    return -1;
  }
}

const missing = Object.entries(FILES).filter(([name, min]) => sizeOf(name) < min);
if (missing.length === 0) {
  console.log(`pyodide ${VERSION}: all files present — skipping fetch`);
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
console.log(`pyodide ${VERSION}: fetching ${missing.length} file(s) from jsdelivr…`);

for (const [name, min] of missing) {
  const url = `${BASE}/${name}`;
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      execFileSync("curl", ["-fSL", "--retry", "2", "-o", `${DIR}/${name}`, url], {
        stdio: ["ignore", "ignore", "inherit"],
      });
      ok = sizeOf(name) >= min;
    } catch {
      ok = false;
    }
    if (!ok && attempt < 3) console.log(`  … retrying ${name} (attempt ${attempt + 1})`);
  }
  if (!ok) {
    console.error(`\npyodide: failed to fetch ${name} from ${url}`);
    console.error("The python package needs this runtime to build. Check network access to jsdelivr.");
    process.exit(1);
  }
  console.log(`  ✓ ${name} (${sizeOf(name).toLocaleString()} bytes)`);
}

console.log("pyodide: runtime ready in public/pyodide/");
