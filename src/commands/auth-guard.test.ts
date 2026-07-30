import { describe, expect, it } from "vitest";
import { login, usermod } from "./auth.js";
import type { CommandContext } from "./registry.js";

/** Minimal ctx — the guard runs before anything else, so nothing else is needed. */
function ctxWith(hasAppOpen: boolean, errs: string[]): CommandContext {
  return {
    tabs: { hasAppOpen: () => hasAppOpen },
    session: { user: "alice" },
    error: (t = "") => errs.push(t),
  } as unknown as CommandContext;
}

describe("account changes are blocked while another window has an app open", () => {
  it("login refuses (before touching the auth backend)", async () => {
    const errs: string[] = [];
    await login.run(["bob"], ctxWith(true, errs));
    expect(errs[0]).toMatch(/close the editor or app open in your other window/);
  });

  it("usermod refuses too", async () => {
    const errs: string[] = [];
    await usermod.run(["bob"], ctxWith(true, errs));
    expect(errs[0]).toMatch(/close the editor or app open/);
  });

  it("allows the change when no other window has an app", async () => {
    const errs: string[] = [];
    // usermod proceeds past the guard, then fails its own validation — the point
    // is that it does NOT stop on the app guard.
    await usermod.run([""], ctxWith(false, errs));
    expect(errs[0]).not.toMatch(/close the editor/);
  });
});
