const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function center(text: string, width: number): string {
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + text;
}

/** Render a month calendar (month 1–12) as lines, `cal(7, 2026)`. */
export function renderCal(month: number, year: number): string[] {
  const first = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const days = new Date(year, month, 0).getDate(); // last day of the month
  const cells: string[] = [];
  for (let i = 0; i < first; i++) cells.push("  ");
  for (let d = 1; d <= days; d++) cells.push(String(d).padStart(2));

  const out = [center(`${MONTHS[month - 1]} ${year}`, 20), DOW.join(" ")];
  for (let i = 0; i < cells.length; i += 7) {
    out.push(cells.slice(i, i + 7).join(" ").replace(/\s+$/, ""));
  }
  return out;
}
