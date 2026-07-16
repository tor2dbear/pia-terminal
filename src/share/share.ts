export interface SharedFile {
  name: string;
  content: string;
}

/** Largest file we'll pack into a link (keeps URLs comfortably short). */
export const MAX_SHARE_BYTES = 4096;

/** Encode a file into a URL-safe base64 payload (self-contained, no server). */
export function encodeShare(file: SharedFile): string {
  const json = JSON.stringify({ n: file.name, c: file.content });
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a share payload back into a file, or null if it's malformed. */
export function decodeShare(payload: string): SharedFile | null {
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json) as { n?: unknown; c?: unknown };
    if (typeof obj.n !== "string" || typeof obj.c !== "string") return null;
    return { name: obj.n, content: obj.c };
  } catch {
    return null;
  }
}

/** Pull a shared file out of a URL hash like `#s=<payload>`, if present. */
export function parseShareHash(hash: string): SharedFile | null {
  const match = hash.match(/[#&]s=([^&]+)/);
  return match ? decodeShare(match[1]) : null;
}
