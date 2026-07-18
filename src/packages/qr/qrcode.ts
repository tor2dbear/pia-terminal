import qrcode from "qrcode-generator";

/**
 * QR encoding for the `qr` package. QR is a fiddly standard (Reed–Solomon,
 * masking, format/version info) that's easy to get subtly wrong and impossible
 * to eyeball, so — unlike the other, hand-rolled packages — this one leans on
 * `qrcode-generator`, a tiny, dependency-free, MIT-licensed encoder. It lazy-
 * loads inside the `qr` chunk (same-origin after bundling, so it stays within
 * the strict CSP). A `jsqr` round-trip test decodes the output to prove the
 * codes actually scan. Accepted divergence — flagged, not drift.
 */

export type Ecl = "L" | "M" | "Q" | "H";

/**
 * Encode `text` as a QR matrix (`true` = dark module). Byte mode, UTF-8, with
 * the version chosen automatically. Throws if the text is too large for any QR
 * version at the given error-correction level.
 */
export function encodeQr(text: string, ecl: Ecl = "M"): boolean[][] {
  if (text === "") throw new Error("nothing to encode");
  // The library's default byte encoder maps each char code (0–255) straight to
  // a byte, so pre-encoding to UTF-8 and passing a byte-string gives correct
  // multibyte output without depending on its optional UTF-8 helper.
  const utf8 = new TextEncoder().encode(text);
  let bytes = "";
  for (const b of utf8) bytes += String.fromCharCode(b);

  const qr = qrcode(0, ecl); // 0 = pick the smallest version that fits
  qr.addData(bytes, "Byte");
  try {
    qr.make();
  } catch {
    throw new Error(`text too long for a QR code at level ${ecl}`);
  }

  const n = qr.getModuleCount();
  const modules: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    modules.push(row);
  }
  return modules;
}
