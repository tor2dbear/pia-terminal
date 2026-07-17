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
      const open = /^\s*(`{3,})/.exec(raw);
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
 * and link contents are stashed before emphasis runs so their characters are
 * left literal, and underscore emphasis is bounded to word edges so ordinary
 * identifiers (`user_account_id`) keep their underscores.
 */
function inline(text: string): string {
  const stash: string[] = [];
  const keep = (s: string): string => `@@${stash.push(s) - 1}@@`;
  return text
    .replace(/`([^`]+)`/g, (_, c) => keep(c)) // protect `code`
    .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => keep(`${t} (${u})`)) // [t](u) → t (u)
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/(^|[^\w])__([^_]+)__(?=[^\w]|$)/g, "$1$2") // __bold__ (word-bounded)
    .replace(/\*([^*]+)\*/g, "$1") // *italic*
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1$2") // _italic_ (word-bounded)
    .replace(/@@(\d+)@@/g, (_, i) => stash[Number(i)]); // restore
}
