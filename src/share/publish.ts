/**
 * `publish` packs a folder's Markdown files into a single self-contained URL —
 * the folder-level sibling of `share` (`share.ts`). Same idea: base64url in the
 * hash, no server, works for guests. Opening a `#p=<payload>` URL renders a
 * read-only web page (see `pia/publishView.ts`) instead of booting the terminal.
 */

/** One page of a published site: a filename and its Markdown source. */
export interface PublishedPage {
  name: string;
  content: string;
}

export interface PublishedSite {
  /** Shown as the page's heading — usually the folder name. */
  title: string;
  pages: PublishedPage[];
}

/**
 * Largest payload we'll put in a link. Bigger than a single `share` (4 KB) since
 * a folder holds several files, but still bounded so the URL stays shareable
 * across apps that balk at very long links.
 */
export const MAX_PUBLISH_PAYLOAD = 32_000;

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encode a site into a URL-safe base64 payload (self-contained, no server). */
export function encodePublish(site: PublishedSite): string {
  const json = JSON.stringify({
    t: site.title,
    p: site.pages.map((page) => ({ n: page.name, c: page.content })),
  });
  return toBase64Url(json);
}

/** Decode a publish payload back into a site, or null if it's malformed. */
export function decodePublish(payload: string): PublishedSite | null {
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes)) as {
      t?: unknown;
      p?: unknown;
    };
    if (typeof obj.t !== "string" || !Array.isArray(obj.p)) return null;
    const pages: PublishedPage[] = [];
    for (const raw of obj.p) {
      if (!raw || typeof raw !== "object") return null;
      const { n, c } = raw as { n?: unknown; c?: unknown };
      if (typeof n !== "string" || typeof c !== "string") return null;
      pages.push({ name: n, content: c });
    }
    if (pages.length === 0) return null;
    return { title: obj.t, pages };
  } catch {
    return null;
  }
}

/** Pull a published site out of a URL hash like `#p=<payload>`, if present. */
export function parsePublishHash(hash: string): PublishedSite | null {
  const match = hash.match(/[#&]p=([^&]+)/);
  return match ? decodePublish(match[1]) : null;
}
