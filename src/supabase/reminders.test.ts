// @vitest-environment jsdom
//
// Focused coverage of SupabaseReminderStore.disablePush — the genuinely new
// half of `notify off`: it must unsubscribe THIS device from the browser Push
// API and delete only this device's row from push_subscriptions (RLS scopes to
// the user; the endpoint scopes to the device).
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseReminderStore } from "./reminders.js";

interface DeleteCall {
  table: string;
  column: string;
  value: string;
}

/** Make pushSupported() true and hand out `sub` as this device's subscription. */
function stubBrowser(sub: { endpoint: string; unsubscribe: () => Promise<boolean> } | null): void {
  (window as unknown as { PushManager: unknown }).PushManager = function () {};
  (window as unknown as { Notification: unknown }).Notification = { permission: "granted" };
  vi.stubGlobal("navigator", {
    userAgent: "test-agent",
    serviceWorker: {
      async getRegistration() {
        return { pushManager: { getSubscription: async () => sub } };
      },
    },
  });
}

/** A client stub that records deletes and returns a fixed uid. */
function stubClient(deletes: DeleteCall[]) {
  return {
    auth: { async getUser() { return { data: { user: { id: "uid-1" } } } } },
    from(table: string) {
      return {
        delete() {
          return {
            async eq(column: string, value: string) {
              deletes.push({ table, column, value });
              return { data: null, error: null };
            },
          };
        },
      };
    },
  } as unknown as ConstructorParameters<typeof SupabaseReminderStore>[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseReminderStore.disablePush", () => {
  it("unsubscribes this device and deletes its row by endpoint", async () => {
    const unsubscribe = vi.fn(async () => true);
    stubBrowser({ endpoint: "https://push.example/ep-123", unsubscribe });
    const deletes: DeleteCall[] = [];

    await new SupabaseReminderStore(stubClient(deletes)).disablePush();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(deletes).toEqual([
      { table: "push_subscriptions", column: "endpoint", value: "https://push.example/ep-123" },
    ]);
  });

  it("is a harmless no-op when this device isn't subscribed", async () => {
    stubBrowser(null); // no active subscription here
    const deletes: DeleteCall[] = [];

    await new SupabaseReminderStore(stubClient(deletes)).disablePush();

    expect(deletes).toEqual([]); // nothing to unsubscribe or forget
  });
});
