/**
 * Markdown → HTML for the public web view (`~/public_html`, see
 * `roadmap/publish-garden.md`). Distinct from `markdown.ts`, which renders to
 * *terminal* lines: this produces a safe HTML **body fragment**, rendered once
 * at publish time and stored in `public_pages.html`. The Cloudflare Pages
 * Function wraps the fragment in the page shell (doctype, themed CSS, title), so
 * the theme lives in one place rather than baked into every stored row.
 *
 * Safety is the whole point: all text is HTML-escaped, and link targets are
 * sanitised to http(s)/relative — a `javascript:` URL never survives. The output
 * carries no scripts, styles, or event handlers, so it sits comfortably under
 * the same strict CSP as the rest of `dist/`.
 */

import { slugForName } from "./slug.js";

/** Escape the five characters that matter in HTML text/attribute context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Turn a Markdown link target into a safe, routable href. Rejects unsafe
 *  schemes and protocol-relative URLs (→ `#`); passes absolute/root-relative/
 *  anchor/query targets through untouched; and rewrites a **bare relative page
 *  link** (a flat filename like `Trip Notes.md` or `about`) to its slug route,
 *  so a link written with the source filename lands on the published URL the
 *  publisher stored it under. */
function safeHref(url: string): string {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u; // absolute http(s)
  if (/^\/\//.test(u)) return "#"; // protocol-relative (//host) — reject
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "#"; // any other scheme (javascript:, data:, mailto:) — reject
  // Bare relative filename (no slash, no leading /#?): a link between pages of a
  // flat site → rewrite to the slug the publisher used. `about` / `about.md` /
  // `Trip Notes.md` all resolve to the page's route.
  if (!/^[/#?.]/.test(u) && !u.includes("/")) {
    const slug = slugForName(u);
    if (slug) return slug;
  }
  return u; // /abs, ./rel, ../rel, #frag, ?q, subpaths
}

/** Render inline spans on an already-block-split line. Order matters: code spans
 *  first (their contents are taken literally), then links, then emphasis. All
 *  text is escaped exactly once, here. */
function renderInline(src: string): string {
  const codes: string[] = [];
  // Pull out `code` spans first, leaving a NUL-delimited placeholder, so their
  // contents skip bold/link processing and the slot can't collide with real
  // text (a bare number like "in 5 min" must not look like a placeholder). NUL
  // can't occur in Markdown and survives escapeHtml untouched.
  let text = src.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00${codes.length - 1}\x00`;
  });

  text = escapeHtml(text);

  // [label](url) — both label and url were already escaped once by the
  // escapeHtml(text) pass above, so only sanitise the target here (escaping it
  // again would turn a real `&amp;` into `&amp;amp;`).
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${safeHref(url)}">${label}</a>`;
  });

  // **bold** / *italic* (bold first so it isn't eaten by the italic rule).
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Restore code spans.
  text = text.replace(/\x00(\d+)\x00/g, (_m, i: string) => codes[Number(i)]);
  return text;
}

/**
 * Render Markdown to a safe HTML body fragment. Supports headings, paragraphs,
 * unordered/ordered lists, blockquotes, fenced code blocks, and horizontal
 * rules, with inline bold/italic/code/links. Intentionally small — a reader's
 * subset, not a full CommonMark engine.
 */
export function renderMarkdownHtml(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  const flushList = (tag: "ul" | "ol", items: string[]): void => {
    out.push(`<${tag}>`);
    for (const item of items) out.push(`<li>${renderInline(item)}</li>`);
    out.push(`</${tag}>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — contents are literal (escaped, no inline rendering).
    const fence = /^\s*(`{3,})(.*)$/.exec(line);
    if (fence) {
      const len = fence[1].length;
      const body: string[] = [];
      i++;
      while (i < lines.length && !(new RegExp(`^\\s*\`{${len},}\\s*$`).test(lines[i]))) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (or run off the end)
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Blank line — paragraph break, nothing to emit.
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Heading. Tolerate leading whitespace so the handler matches exactly what
    // the paragraph block-starter predicate below treats as a heading — if the
    // two disagreed, an indented `  # x` would start no block and consume no
    // line, spinning the loop forever.
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (consume consecutive `>` lines).
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      flushList("ul", items);
      continue;
    }

    // Ordered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      flushList("ol", items);
      continue;
    }

    // Paragraph — always consume the current line, then gather until a blank
    // line or a block starter. Taking the first line unconditionally guarantees
    // the loop advances even if some block starter has no matching handler, so
    // the renderer can never spin.
    const para: string[] = [lines[i]];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*(`{3,}|#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s)/.test(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return out.join("\n");
}

/** The display title of a page: its first `# heading`, else the filename
 *  without extension. Used by the Pages Function for `<title>` and the index. */
export function pageTitle(src: string, filename: string): string {
  for (const line of src.split("\n")) {
    const h = /^\s*#\s+(.*)$/.exec(line);
    if (h) return h[1].trim();
  }
  return filename.replace(/\.[^.]+$/, "");
}
