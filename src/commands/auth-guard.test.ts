import { describe, expect, it } from "vitest";
import { login, usermod } from "./auth.js";
import type { CommandContext } from "./registry.js";

/** Minimal ctx — the guard runs before anything else, so little else is needed.
 * beginTransition/endTransition are no-ops here (the lock is TabManager's job). */
function ctxWith(otherWindowsBusy: boolean, errs: string[]): CommandContext {
  return {
    tabs: {
      otherWindowsBusy: () => otherWindowsBusy,
      beginTransition: () => {},
      endTransition: () => {},
    },
    session: { user: "alice" },
    error: (t = "") => errs.push(t),
  } as unknown as CommandContext;
}

describe("account changes are blocked while another window is busy", () => {
  it("login refuses (before touching the auth backend)", async () => {
    const errs: string[] = [];
    await login.run(["bob"], ctxWith(true, errs));
    expect(errs[0]).toMatch(/another window is busy/);
  });

  it("usermod refuses too", async () => {
    const errs: string[] = [];
    await usermod.run(["bob"], ctxWith(true, errs));
    expect(errs[0]).toMatch(/another window is busy/);
  });

  it("allows the change when no other window is busy", async () => {
    const errs: string[] = [];
    // usermod proceeds past the guard, then fails its own validation — the point
    // is that it does NOT stop on the busy guard.
    await usermod.run([""], ctxWith(false, errs));
    expect(errs[0]).not.toMatch(/another window is busy/);
  });
});
