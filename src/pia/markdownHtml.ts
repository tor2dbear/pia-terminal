/**
 * Render Markdown to a safe HTML string, for the published page
 * (`publishView.ts`). PIA's terminal `glow` renders Markdown to coloured *rows*
 * (`markdown.ts`); a public web page wants real HTML — headings, lists, links —
 * so this is the HTML-target sibling.
 *
 * Security: every piece of source text is HTML-escaped before any of our own
 * tags are added, and link targets are restricted to safe protocols. So nothing
 * in a published document can inject markup or script, even though the result is
 * assigned via innerHTML.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only these link targets are allowed; anything else (javascript:, data:, …)
 * is rendered as plain text instead of a clickable link. */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  // Relative / same-page links are fine; a bare "foo:" scheme is not.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return trimmed;
}

/** Apply **bold**, *italic* and _italic_ to already-escaped text. Underscore
 * emphasis is word-bounded so identifiers (`a_b_c`) keep their underscores. */
function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])__([^_]+)__(?=[^\w]|$)/g, "$1<strong>$2</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1<em>$2</em>");
}

/** Render inline Markdown (code, links, emphasis) of one raw line to HTML.
 * Code spans and link contents are escaped verbatim; emphasis is applied only
 * to the text between them (mirrors the terminal renderer's approach). */
function inline(text: string): string {
  const protectedRe = /(`[^`]+`)|(!?\[[^\]]+\]\([^)]+\))/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = protectedRe.exec(text)) !== null) {
    out += emphasis(escapeHtml(text.slice(last, m.index)));
    if (m[1]) {
      out += `<code>${escapeHtml(m[1].slice(1, -1))}</code>`;
    } else {
      const link = /!?\[([^\]]+)\]\(([^)]+)\)/.exec(m[2]);
      const label = link ? escapeHtml(link[1]) : escapeHtml(m[2]);
      const href = link ? safeHref(link[2]) : null;
      out += href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : link
          ? `${label} (${escapeHtml(link[2])})`
          : label;
    }
    last = protectedRe.lastIndex;
  }
  return out + emphasis(escapeHtml(text.slice(last)));
}

/** Render a Markdown document to an HTML string (blocks + inline). */
export function renderMarkdownToHtml(src: string): string {
  const out: string[] = [];
  const lines = src.split("\n");
  let i = 0;

  // Accumulators for multi-line blocks.
  let paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const raw = lines[i];

    // Fenced code block: everything until a closing fence, verbatim.
    const fence = /^\s*(`{3,})([^`]*)$/.exec(raw);
    if (fence) {
      flushParagraph();
      const width = fence[1].length;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const close = /^\s*(`{3,})\s*$/.exec(lines[i]);
        if (close && close[1].length >= width) {
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    if (raw.trim() === "") {
      flushParagraph();
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) {
      flushParagraph();
      out.push("<hr>");
      i++;
      continue;
    }

    // Heading (# … ######).
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote — consecutive `>` lines.
    if (/^\s*>\s?/.test(raw)) {
      flushParagraph();
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(inline(lines[i].replace(/^\s*>\s?/, "")));
        i++;
      }
      out.push(`<blockquote>${body.join("<br>")}</blockquote>`);
      continue;
    }

    // Unordered list — consecutive `-`/`*`/`+` items.
    if (/^\s*[-*+]\s+/.test(raw)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list — consecutive `N.` items.
    if (/^\s*\d+\.\s+/.test(raw)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    paragraph.push(raw.trimEnd());
    i++;
  }
  flushParagraph();

  return out.join("\n");
}
