// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { loadAnalytics } from "./analytics.js";

const beacon = () =>
  document.head.querySelector<HTMLScriptElement>(
    'script[src*="static.cloudflareinsights.com"]',
  );

afterEach(() => {
  beacon()?.remove();
});

describe("loadAnalytics", () => {
  it("injects the beacon on the production host", () => {
    loadAnalytics("pia.tor2dbear.com");
    const s = beacon();
    expect(s).not.toBeNull();
    // Classic script (no type=module) so the beacon can read its token via
    // document.currentScript, and the token comes through.
    expect(s?.getAttribute("type")).toBeNull();
    expect(s?.getAttribute("data-cf-beacon")).toContain("6f7e6b4189374ec6a89af10beb78e9f9");
  });

  it("does nothing on localhost, a preview host, or anywhere else", () => {
    for (const host of ["localhost", "claude-readme-review-qz45y5.pia-terminal.pages.dev", "127.0.0.1"]) {
      loadAnalytics(host);
      expect(beacon(), `should not load on ${host}`).toBeNull();
    }
  });
});
