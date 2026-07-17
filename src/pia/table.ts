/**
 * Format delimited rows into an aligned table — the core of `column -t`. Splits
 * each line on `sep` (runs of whitespace when omitted), pads every column but
 * the last to its widest cell, and joins with two spaces. Blank lines are
 * dropped, matching `column`.
 */
export function formatColumns(lines: string[], sep?: string): string[] {
  const rows = lines.filter((l) => l.trim() !== "").map((l) => splitRow(l, sep));
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i < row.length - 1 ? cell.padEnd(widths[i]) : cell))
      .join("  ")
      .replace(/\s+$/, ""),
  );
}

function splitRow(line: string, sep?: string): string[] {
  if (sep === undefined || sep === "") return line.trim().split(/\s+/);
  return line.split(sep).map((c) => c.trim());
}
