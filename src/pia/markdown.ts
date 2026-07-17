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
  let inFence = false;

  for (const raw of src.split("\n")) {
    // Fenced code block: toggle on ```; render the inner lines verbatim (dim).
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push({ text: raw, cls: "dim" });
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

/** Unwrap inline Markdown to plain text: links, bold, italic, code. */
function inline(text: string): string {
  return text
    .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // [t](u) / ![t](u) → t (u)
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/__([^_]+)__/g, "$1") // __bold__
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2") // *italic* (not part of **)
    .replace(/(^|[^_])_([^_]+)_/g, "$1$2") // _italic_
    .replace(/`([^`]+)`/g, "$1"); // `code`
}
