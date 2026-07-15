/**
 * Split a command line into tokens. Supports double quotes so arguments with
 * spaces survive (e.g. `touch "mina anteckningar.txt"`). Pipes and redirects
 * (Level 1) are intentionally not handled yet.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let hasToken = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasToken = true;
      continue;
    }
    if (ch === " " && !inQuotes) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken) tokens.push(current);
  return tokens;
}
