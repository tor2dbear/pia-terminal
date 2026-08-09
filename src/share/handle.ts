/**
 * The public handle namespace — the `~user` in a `~/public_html` URL
 * (`pia.tor2dbear.com/~<handle>/…`). See `roadmap/publish-garden.md`.
 *
 * Today's account username is soft metadata (display only, not unique). A handle
 * is the hard version: unique, reserved, URL-safe — claimed lazily the first
 * time you publish (never a signup gate). This module is the *pure* part of that
 * story: slugify a candidate, validate a handle, and know which names are off
 * limits. Uniqueness/reservation lives behind the cloud seam; nothing here
 * touches storage.
 */

/** Shortest/longest a handle may be (GitHub-ish: room to be personal, bounded
 *  so the URL stays tidy). */
export const HANDLE_MIN = 2;
export const HANDLE_MAX = 39;

/**
 * Names that can never be a handle. Two reasons, kept in one list:
 *   1. **Route collisions** — a top-level path or asset the site itself serves,
 *      which a `~<handle>` must never shadow.
 *   2. **Safety** — role/impersonation words we don't want anyone claiming.
 * Compared case-insensitively against the already-lowercased handle.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Route / infra
  "api", "www", "app", "assets", "static", "public",
  "incoming", "shared", "feed", "rss", "sitemap", "robots", "favicon",
  "well-known",
  // Impersonation / roles
  "admin", "administrator", "root", "sudo", "system", "support", "help",
  "user", "guest", "pia", "official", "security", "abuse", "postmaster",
  "webmaster", "mod", "moderator", "staff", "team",
  // Auth-flow words (avoid confusing public URLs with account actions)
  "login", "logout", "signup", "register", "verify", "settings", "account",
]);

/** A handle is valid when it matches this — lowercase alnum groups joined by
 *  single hyphens: no leading/trailing hyphen, no `--`, no other characters. */
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turn any string (a display username, a name, an email local-part) into a
 * candidate handle: lowercase, strip diacritics (`Tör Björn` → `tor-bjorn`),
 * collapse every other run of characters to a single hyphen, trim the ends, and
 * clamp to {@link HANDLE_MAX}. May still be too short or reserved — run it
 * through {@link validateHandle} before offering it.
 */
export function slugifyHandle(input: string): string {
  return input
    .normalize("NFKD") // ö → o + combining diaeresis, which the next step drops
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alnum → one hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, HANDLE_MAX)
    .replace(/-+$/g, ""); // a trailing hyphen the slice may have exposed
}

/** Why a handle was rejected, or `{ ok: true }`. Reasons are terminal-terse,
 *  ready to print after `publish:`/`handle:`. */
export type HandleCheck = { ok: true } | { ok: false; reason: string };

/** Validate an already-lowercased handle against the charset, length, and
 *  reserved-word rules. Does NOT check uniqueness — that's the store's job. */
export function validateHandle(handle: string): HandleCheck {
  if (handle.length < HANDLE_MIN) {
    return { ok: false, reason: `too short (min ${HANDLE_MIN} characters)` };
  }
  if (handle.length > HANDLE_MAX) {
    return { ok: false, reason: `too long (max ${HANDLE_MAX} characters)` };
  }
  if (!HANDLE_RE.test(handle)) {
    return {
      ok: false,
      reason: "use lowercase letters, digits, and single hyphens (no leading, trailing, or doubled -)",
    };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, reason: `"${handle}" is reserved` };
  }
  return { ok: true };
}

/**
 * Lazily yield handle candidates for the claim flow, starting from `base` and
 * then appending 2, 3, … when earlier ones are taken (`tor` → `tor2` → `tor3`).
 * Only ever yields *valid* handles — a `base` that's too short or reserved is
 * skipped, so the numbered fallbacks still flow. The caller checks each against
 * the store for availability and stops at the first free one.
 */
export function* handleCandidates(base: string): Generator<string> {
  const slug = slugifyHandle(base);
  if (slug && validateHandle(slug).ok) yield slug;
  for (let n = 2; ; n++) {
    // Trim the stem so stem+number still fits the length cap.
    const suffix = String(n);
    const stem = (slug || "pia").slice(0, HANDLE_MAX - suffix.length);
    const candidate = `${stem}${suffix}`;
    if (validateHandle(candidate).ok) yield candidate;
  }
}
