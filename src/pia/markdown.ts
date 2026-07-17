import type { LineClass } from "../commands/registry.js";

/** One rendered output line: text plus the colour class to print it with. */
export interface RenderedLine {
  text: string;
  cls: LineClass;
}

const HR = "─".repeat(24);

/**
 * Render Markdown to styled terminal lines — PIA's little `glow`. The terminal
 * prints one colour class per line, so styling is line-level: headings and rules
 * stand out (accent), quotes and code dim, body normal. Inline markers
 * (**bold**, `code`, [links]) are unwrapped to clean text since a line carries a
 * single class.
 */
export function renderMarkdown(src: string): RenderedLine[] {
  const out: RenderedLine[] = [];
  // Length of the currently-open code fence (backtick count), or null. Tracking
  // the length lets a longer outer fence contain shorter ``` lines, and only a
  // backticks-only line at least as long closes it (CommonMark).
  let fence: number | null = null;

  for (const raw of src.split("\n")) {
    if (fence === null) {
      // A fence opener is 3+ backticks plus an optional info string that holds
      // NO backticks — so an inline span like ```code``` on one line is not an
      // opener (which would otherwise swallow every following line).
      const open = /^\s*(`{3,})[^`]*$/.exec(raw);
      if (open) {
        fence = open[1].length;
        continue;
      }
    } else {
      const close = /^\s*(`{3,})\s*$/.exec(raw);
      if (close && close[1].length >= fence) {
        fence = null;
      } else {
        out.push({ text: raw, cls: "dim" });
      }
      continue;
    }

    const line = raw.replace(/\s+$/, "");

    if (line.trim() === "") {
      out.push({ text: "", cls: "normal" });
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push({ text: HR, cls: "dim" });
      continue;
    }

    // Heading (# … ######).
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2]);
      if (level === 1) {
        out.push({ text: text.toUpperCase(), cls: "accent" });
        out.push({ text: "─".repeat(Math.max(text.length, 3)), cls: "dim" });
      } else {
        out.push({ text: `${"#".repeat(level - 1)} ${text}`.trimStart(), cls: "accent" });
      }
      continue;
    }

    // Blockquote.
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      out.push({ text: `│ ${inline(quote[1])}`, cls: "dim" });
      continue;
    }

    // Unordered list item.
    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      out.push({ text: `${ul[1]}• ${inline(ul[2])}`, cls: "normal" });
      continue;
    }

    // Ordered list item (keep the number).
    const ol = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      out.push({ text: `${ol[1]}${ol[2]}. ${inline(ol[3])}`, cls: "normal" });
      continue;
    }

    out.push({ text: inline(line), cls: "normal" });
  }

  return out;
}

/**
 * Unwrap inline Markdown to plain text: links, bold, italic, code. Inline-code
 * and links are emitted literally; emphasis is applied only to the text between
 * them, so their characters are left alone with no placeholder that ordinary
 * text could collide with. Underscore emphasis is bounded to word edges so
 * ordinary identifiers (`user_account_id`) keep their underscores.
 */
function inline(text: string): string {
  const protectedRe = /(`[^`]+`)|(!?\[[^\]]+\]\([^)]+\))/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = protectedRe.exec(text)) !== null) {
    out += emphasis(text.slice(last, m.index));
    if (m[1]) {
      out += m[1].slice(1, -1); // `code` → its contents, verbatim
    } else {
      const link = /!?\[([^\]]+)\]\(([^)]+)\)/.exec(m[2]);
      out += link ? `${link[1]} (${link[2]})` : m[2]; // [t](u) → t (u)
    }
    last = protectedRe.lastIndex;
  }
  return out + emphasis(text.slice(last));
}

/** Strip **bold** / *italic* / _emphasis_ markers (underscores word-bounded). */
function emphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w])__([^_]+)__(?=[^\w]|$)/g, "$1$2")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1$2");
}
