/**
 * Pure text-tool primitives behind the `coreutils` package — reversing lines,
 * base64, prime factoring, and hex dumps. Kept free of any terminal/context so
 * they're trivially unit-tested; the command wrappers in `index.ts` handle I/O.
 * All client-side (no network), so the package stays within PIA's strict CSP.
 */

/** Reverse the characters of a line (code-point aware, so emoji survive). */
export function reverseLine(line: string): string {
  return [...line].reverse().join("");
}

/** UTF-8 → base64 (no line wrapping, so it pipes cleanly). */
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** base64 → UTF-8. Throws on input that isn't valid base64. */
export function base64Decode(b64: string): string {
  const clean = b64.replace(/\s+/g, "");
  // Validate before decoding: the browser's `atob` is lenient (it accepts
  // unpadded/truncated input like "YQ"), but real base64 rejects anything that
  // isn't well-formed RFC 4648 — a multiple of four chars from the alphabet
  // with at most two trailing '='. Don't accept corrupt data as complete.
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error("invalid base64");
  }
  const bin = atob(clean);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Prime factors of a positive integer, with multiplicity (12 → [2, 2, 3]). */
export function factorize(n: number): number[] {
  const factors: number[] = [];
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    while (m % d === 0) {
      factors.push(d);
      m /= d;
    }
  }
  if (m > 1) factors.push(m);
  return factors;
}

/** Canonical hex dump of text (UTF-8 bytes), in `xxd` layout. */
export function hexdump(text: string): string[] {
  const bytes = new TextEncoder().encode(text);
  const lines: string[] = [];
  for (let off = 0; off < bytes.length; off += 16) {
    const slice = bytes.slice(off, off + 16);
    let hex = "";
    for (let i = 0; i < 16; i++) {
      hex += i < slice.length ? slice[i].toString(16).padStart(2, "0") : "  ";
      if (i % 2 === 1) hex += " "; // xxd groups bytes in pairs
    }
    let ascii = "";
    for (const b of slice) ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
    lines.push(`${off.toString(16).padStart(8, "0")}: ${hex} ${ascii}`);
  }
  return lines;
}
