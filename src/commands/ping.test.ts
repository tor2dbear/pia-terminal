import { describe, expect, it } from "vitest";
import { runPing, type PingDeps } from "./ping.js";
import type { CommandContext, LineClass } from "./registry.js";

/** A tiny context that just collects printed/errored lines. */
function ctxHarness(baseUrl = "https://pia.example/") {
  const lines: { text: string; cls: LineClass }[] = [];
  const ctx = {
    baseUrl,
    print: (text = "", cls: LineClass = "normal") => lines.push({ text, cls }),
    error: (text: string) => lines.push({ text, cls: "error" }),
  } as unknown as CommandContext;
  return { ctx, lines, text: () => lines.map((l) => l.text) };
}

/** Deps whose probe returns a fixed sequence of round-trips (null = timeout). */
function depsFrom(rtts: (number | null)[]): PingDeps {
  let i = 0;
  return {
    probe: async () => rtts[i++ % rtts.length],
    sleep: async () => {}, // no real waiting in tests
  };
}

describe("ping", () => {
  it("sends 4 packets by default and reports min/avg/max", async () => {
    const h = ctxHarness();
    await runPing([], h.ctx, depsFrom([10, 20, 30, 40]));
    const out = h.text().join("\n");
    expect(out).toContain("PING self (pia.example)");
    expect(out).toContain("reply from pia.example: seq=0 time=10.0 ms");
    expect(out).toContain("reply from pia.example: seq=3 time=40.0 ms");
    expect(out).toContain("4 transmitted, 4 received, 0% loss");
    expect(out).toContain("round-trip min/avg/max = 10.0/25.0/40.0 ms");
  });

  it("honours -c to change the packet count", async () => {
    const h = ctxHarness();
    await runPing(["-c", "2"], h.ctx, depsFrom([12, 12]));
    expect(h.text().join("\n")).toContain("2 transmitted, 2 received, 0% loss");
  });

  it("counts timeouts as packet loss", async () => {
    const h = ctxHarness();
    await runPing(["-c", "4"], h.ctx, depsFrom([10, null, 30, null]));
    const out = h.text().join("\n");
    expect(out).toContain("no reply from pia.example: seq=1 (timeout)");
    expect(out).toContain("4 transmitted, 2 received, 50% loss");
    // Only the successful probes feed the stats.
    expect(out).toContain("round-trip min/avg/max = 10.0/20.0/30.0 ms");
  });

  it("prints no round-trip line when every packet is lost", async () => {
    const h = ctxHarness();
    await runPing(["-c", "2"], h.ctx, depsFrom([null, null]));
    const out = h.text().join("\n");
    expect(out).toContain("2 transmitted, 0 received, 100% loss");
    expect(out).not.toContain("round-trip");
  });

  it("refuses an arbitrary host honestly (no faked numbers)", async () => {
    const h = ctxHarness();
    await runPing(["google.com"], h.ctx, depsFrom([10]));
    const out = h.text().join("\n");
    expect(out).toContain("cannot reach `google.com`");
    expect(out).toContain("no raw sockets");
    expect(out).not.toContain("reply from");
    // Every line of the refusal is an error line.
    expect(h.lines.every((l) => l.cls === "error")).toBe(true);
  });

  it("reports that cloud is not configured when there is no backend", async () => {
    const h = ctxHarness();
    await runPing(["cloud"], h.ctx, depsFrom([10]));
    expect(h.text().join("\n")).toContain("cloud is not configured");
  });

  it("rejects a bad -c value", async () => {
    const h = ctxHarness();
    await runPing(["-c", "zero"], h.ctx, depsFrom([10]));
    expect(h.text().join("\n")).toContain("-c wants a positive integer");
  });

  it("rejects more than one target", async () => {
    const h = ctxHarness();
    await runPing(["self", "cloud"], h.ctx, depsFrom([10]));
    expect(h.text().join("\n")).toContain("usage: ping");
  });
});
