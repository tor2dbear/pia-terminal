/**
 * Format delimited rows into an aligned table — the core of `column -t`. Splits
 * each line on `sep` (runs of whitespace when omitted), pads every column but
 * the last to its widest cell, and joins with two spaces. Blank lines are
 * dropped, matching `column`. Padding is measured in terminal display columns
 * (see {@link displayWidth}), so wide (CJK) and combining characters still line
 * up rather than being counted as one UTF-16 unit each.
 */
export function formatColumns(lines: string[], sep?: string): string[] {
  const rows = lines.filter((l) => l.trim() !== "").map((l) => splitRow(l, sep));
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, displayWidth(cell));
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i < row.length - 1 ? pad(cell, widths[i]) : cell))
      .join("  ")
      .replace(/\s+$/, ""),
  );
}

/** Right-pad `cell` with spaces to `width` display columns. */
function pad(cell: string, width: number): string {
  return cell + " ".repeat(Math.max(0, width - displayWidth(cell)));
}

/**
 * Approximate the terminal display width of a string: iterate code points (so a
 * surrogate-pair emoji counts once), combining marks and variation selectors
 * count as 0, wide CJK/fullwidth code points as 2, everything else as 1.
 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isZeroWidth(cp)) continue;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200d || // zero-width joiner
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritical marks
    (cp >= 0x200b && cp <= 0x200f) || // zero-width spaces / marks
    (cp >= 0xfe00 && cp <= 0xfe0f) // variation selectors
  );
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals … Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK extension B+
  );
}

function splitRow(line: string, sep?: string): string[] {
  if (sep === undefined || sep === "") return line.trim().split(/\s+/);
  return line.split(sep).map((c) => c.trim());
}
