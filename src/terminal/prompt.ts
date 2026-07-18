/**
 * Prompt colour markup, zsh-style. A prompt template may carry:
 *   %F{accent}…%f   foreground colour on/off (a token → var(--token), or a #hex)
 *   %B…%b           bold on/off
 *   %%              a literal percent
 * Everything else is plain text (with `{user}`/`{host}`/`{cwd}` placeholders
 * filled by the caller). Parsing yields styled segments the renderer turns into
 * coloured spans — keeping it out of the DOM so it's easy to test.
 */
export interface PromptSegment {
  text: string;
  /** A CSS colour: `var(--token)` for a palette token, or a literal `#hex`. */
  color?: string;
  bold?: boolean;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const IDENT = /^[a-zA-Z][\w-]*$/;

/** Resolve a `%F{…}` colour name: a hex passes through, a plain identifier
 * becomes `var(--name)` (theme-aware), anything else is ignored. */
function resolveColor(name: string): string | undefined {
  const trimmed = name.trim();
  if (HEX.test(trimmed)) return trimmed;
  if (IDENT.test(trimmed)) return `var(--${trimmed})`;
  return undefined;
}

/** Parse a prompt template into styled segments. `subst` fills placeholders in
 * each plain-text run (so markup delimiters never get substituted). */
export function parsePromptSegments(
  template: string,
  subst: (text: string) => string,
): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let color: string | undefined;
  let bold = false;
  let buf = "";
  const flush = (): void => {
    if (buf) {
      segments.push({ text: subst(buf), ...(color ? { color } : {}), ...(bold ? { bold } : {}) });
      buf = "";
    }
  };

  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (c === "%" && i + 1 < template.length) {
      const next = template[i + 1];
      if (next === "%") {
        buf += "%";
        i++;
        continue;
      }
      if (next === "f") {
        flush();
        color = undefined;
        i++;
        continue;
      }
      if (next === "b") {
        flush();
        bold = false;
        i++;
        continue;
      }
      if (next === "B") {
        flush();
        bold = true;
        i++;
        continue;
      }
      if (next === "F" && template[i + 2] === "{") {
        const end = template.indexOf("}", i + 3);
        if (end !== -1) {
          flush();
          color = resolveColor(template.slice(i + 3, end));
          i = end;
          continue;
        }
      }
    }
    buf += c;
  }
  flush();
  return segments;
}
