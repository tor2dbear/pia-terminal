import { cloudConfig } from "../config.js";
import type { Command, CommandContext } from "./registry.js";

/**
 * `ping` — an honest round-trip latency probe.
 *
 * There is no ICMP in the browser (no raw sockets), so this is not the kernel's
 * `ping`. It measures *real* HTTP round-trip time with a timed, cache-busted
 * `HEAD` request — but only to origins the app is actually allowed to reach: its
 * own server (`self`) and, when configured, the cloud backend (`cloud`). PIA's
 * strict CSP (`connect-src 'self' …supabase.co`) blocks every other origin, so
 * pinging an arbitrary host can't work — and we refuse honestly rather than
 * printing invented numbers (an accepted web divergence, in the spirit of
 * `share`/`upload`: named plainly, never faked).
 */

const COUNT_DEFAULT = 4;
const COUNT_MAX = 20;
const INTERVAL_MS = 300; // gap between packets (real ping waits ~1s; keep it snappy)
// Per-probe timeout. Kept short because a running command can't be interrupted
// here (the terminal ignores keys, ^C included, while busy) — so a dead host
// must not freeze the prompt for long. `self` and `cloud` reply in ms when up.
const TIMEOUT_MS = 2000;

/** A single timed probe: resolves to the round-trip in ms, or null on failure. */
export type Probe = (url: string) => Promise<number | null>;

/** The real probe: a cache-busted `HEAD`, timed with `performance.now()`. */
export const httpProbe: Probe = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    // `no-cors` lets us time cross-origin hosts (the reply is opaque, but the
    // round-trip is real); `no-store` defeats the HTTP cache so every packet
    // actually travels.
    await fetch(url, { method: "HEAD", cache: "no-store", mode: "no-cors", signal: controller.signal });
    return performance.now() - started;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Injectable dependencies, so the loop is testable without a real network. */
export interface PingDeps {
  probe: Probe;
  sleep: (ms: number) => Promise<void>;
}

const realDeps: PingDeps = {
  probe: httpProbe,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

interface Target {
  label: string; // what the user asked for (self / cloud)
  url: string; // where we actually probe
}

/** Resolve `self`/`cloud` (or the default) to a reachable URL, or explain why not. */
function resolveTarget(name: string | undefined, ctx: CommandContext): Target | string {
  const target = (name ?? "self").toLowerCase();
  if (target === "self" || target === "localhost" || target === "pia") {
    try {
      return { label: "self", url: new URL(ctx.baseUrl).origin };
    } catch {
      return { label: "self", url: ctx.baseUrl };
    }
  }
  if (target === "cloud") {
    if (!cloudConfig) {
      return "ping: cloud is not configured — PIA is running fully local (no backend to reach).";
    }
    return { label: "cloud", url: cloudConfig.url };
  }
  return (
    `ping: cannot reach \`${name}\` — the browser has no raw sockets (no ICMP), and\n` +
    "PIA's CSP only allows its own origin and the cloud backend.\n" +
    "try `ping self` or `ping cloud`."
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Append a per-packet query so nothing along the way can serve a cached reply. */
function cacheBust(url: string, seq: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set("_pia_ping", String(seq));
    return u.toString();
  } catch {
    return url;
  }
}

const fmt = (ms: number): string => ms.toFixed(1);

/** Parse `-c N` / `-cN` out of the args; returns the count and the remaining args. */
function parseCount(args: string[]): { count: number; rest: string[] } | string {
  let count = COUNT_DEFAULT;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-c") {
      const v = args[++i];
      const n = Number(v);
      if (!v || !Number.isInteger(n) || n < 1) return `ping: -c wants a positive integer (got \`${v ?? ""}\`)`;
      count = n;
    } else if (a.startsWith("-c")) {
      const n = Number(a.slice(2));
      if (!Number.isInteger(n) || n < 1) return `ping: -c wants a positive integer (got \`${a.slice(2)}\`)`;
      count = n;
    } else {
      rest.push(a);
    }
  }
  if (count > COUNT_MAX) return `ping: -c is capped at ${COUNT_MAX}`;
  return { count, rest };
}

/** The probe loop, factored out so tests can drive it with a fake probe/clock. */
export async function runPing(
  args: string[],
  ctx: CommandContext,
  deps: PingDeps = realDeps,
): Promise<void> {
  const parsed = parseCount(args);
  if (typeof parsed === "string") {
    ctx.error(parsed);
    return;
  }
  const { count, rest } = parsed;
  if (rest.length > 1) {
    ctx.error("usage: ping [-c count] [self|cloud]");
    return;
  }

  const target = resolveTarget(rest[0], ctx);
  if (typeof target === "string") {
    for (const line of target.split("\n")) ctx.error(line);
    return;
  }

  const host = hostOf(target.url);
  ctx.print(`PING ${target.label} (${host}) — HTTP HEAD, no ICMP in the browser`);

  const times: number[] = [];
  for (let seq = 0; seq < count; seq++) {
    if (seq > 0) await deps.sleep(INTERVAL_MS);
    const rtt = await deps.probe(cacheBust(target.url, seq));
    if (rtt === null) {
      ctx.print(`no reply from ${host}: seq=${seq} (timeout)`, "dim");
    } else {
      times.push(rtt);
      ctx.print(`reply from ${host}: seq=${seq} time=${fmt(rtt)} ms`, "accent");
    }
  }

  ctx.print();
  ctx.print(`--- ${host} ping statistics ---`);
  const loss = Math.round(((count - times.length) / count) * 100);
  const summary = `${count} transmitted, ${times.length} received, ${loss}% loss`;
  if (times.length === 0) {
    // Every packet was lost: report through `error` so the pipeline exits
    // non-zero, like real ping — `ping cloud || echo offline` then branches.
    ctx.error(summary);
    return;
  }
  ctx.print(summary);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  ctx.print(`round-trip min/avg/max = ${fmt(min)}/${fmt(avg)}/${fmt(max)} ms`);
}

export const ping: Command = {
  name: "ping",
  help: "measure round-trip latency to the app (self) or the cloud backend",
  usage: "ping [-c count] [self|cloud]",
  run(args, ctx) {
    return runPing(args, ctx);
  },
  complete(args) {
    // Offer the two reachable targets once past any flags.
    if (args.some((a) => a === "self" || a === "cloud")) return [];
    return ["self", "cloud"];
  },
};

export const pingCommands: Command[] = [ping];
