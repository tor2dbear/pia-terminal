/**
 * Reminders: the "real" scheduling seam. A reminder is a bit of text delivered
 * as a push notification at a time — even when the tab is closed — via a cloud
 * scheduler. Like {@link ShareStore}, the terminal talks only to this interface:
 * guests get {@link NullReminderStore}, logged-in cloud users get the Supabase
 * implementation.
 *
 * Push itself is a web bridge with no terminal equivalent (an accepted
 * divergence, like share→URL): it needs a service worker, the Push API, and —
 * on iOS — the app installed to the Home Screen.
 */

/** The app's VAPID public key. Public by design (it ships in every client). */
export const VAPID_PUBLIC_KEY =
  "BG0fBnJ2jKJ657cN-iP2ehhhoWQfzArh7sCR74DAAumHJq_8fL68ClUUTxX7LYlwqUsUu5UmJ628L05tKsuQFzs";

export interface Reminder {
  id: string;
  body: string;
  /** ISO timestamp of when it fires. */
  nextRun: string;
}

/** Outcome of trying to turn on notifications. */
export type PushStatus =
  | "enabled"
  | "denied"
  | "unsupported"
  | "no-cloud"
  | "not-standalone";

export interface ReminderStore {
  /** Whether a cloud backend is wired up (reminders need one to fire). */
  available(): boolean;
  /** Turn on push for this device (register SW, ask permission, subscribe). */
  enablePush(): Promise<PushStatus>;
  /** Whether this device already has notifications enabled. */
  isEnabled(): Promise<boolean>;
  /** Schedule a one-off reminder. */
  schedule(body: string, at: Date): Promise<void>;
  /** Upcoming reminders, soonest first. */
  list(): Promise<Reminder[]>;
  /** Cancel a reminder by id. */
  remove(id: string): Promise<void>;
}

// ---- browser push helpers ---------------------------------------------------

/** Does this browser support the pieces web push needs? */
export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** On iOS, push only works once the app is installed to the Home Screen. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as unknown as { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

/** VAPID key → the Uint8Array `applicationServerKey` the Push API wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Register the service worker (idempotent) and return its registration. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const url = new URL("sw.js", document.baseURI).href;
  return navigator.serviceWorker.register(url);
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Ask for notification permission and subscribe. Returns the subscription keys
 * to store, or a status if it couldn't (denied/unsupported).
 */
export async function subscribePush(): Promise<PushKeys | PushStatus> {
  if (!pushSupported()) return "unsupported";
  const reg = await ensureServiceWorker();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "unsupported";
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** In-memory reminder store for tests. */
export class MemoryReminderStore implements ReminderStore {
  private items: Reminder[] = [];
  private enabled = false;
  private seq = 0;
  available(): boolean {
    return true;
  }
  async enablePush(): Promise<PushStatus> {
    this.enabled = true;
    return "enabled";
  }
  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }
  async schedule(body: string, at: Date): Promise<void> {
    this.items.push({ id: String(++this.seq), body, nextRun: at.toISOString() });
  }
  async list(): Promise<Reminder[]> {
    return [...this.items].sort((a, b) => a.nextRun.localeCompare(b.nextRun));
  }
  async remove(id: string): Promise<void> {
    this.items = this.items.filter((r) => r.id !== id);
  }
}

/** Reminders turned off: the local/guest build with no cloud backend. */
export class NullReminderStore implements ReminderStore {
  available(): boolean {
    return false;
  }
  async enablePush(): Promise<PushStatus> {
    return "no-cloud";
  }
  async isEnabled(): Promise<boolean> {
    return false;
  }
  async schedule(): Promise<void> {
    throw new Error("reminders need a cloud account — run `login`");
  }
  async list(): Promise<Reminder[]> {
    return [];
  }
  async remove(): Promise<void> {
    /* no-op */
  }
}
