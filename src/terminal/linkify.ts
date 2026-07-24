/**
 * Turn http(s) URLs in a line of terminal output into clickable links. Terminal
 * output is otherwise plain text; this is what makes `about`/`neofetch`'s repo
 * and npm links tappable (a real help on mobile). External links open in a new
 * tab with `noopener`. Anchors carry no inline handlers, so this stays within
 * the strict CSP.
 */

const OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Trim punctuation that trails a URL but isn't part of it. Sentence marks and
 * quotes always go; a closing bracket goes only when it's *unmatched* within the
 * URL — so `…/Function_(mathematics)` keeps its `)`, but a URL wrapped in `(…)`
 * gives the `)` back to the text.
 */
function trimUrlEnd(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,;:!?\"'".includes(ch)) {
      end--;
      continue;
    }
    const open = OPENER[ch];
    if (open) {
      const slice = url.slice(0, end);
      const closes = slice.split(ch).length - 1;
      const opens = slice.split(open).length - 1;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

/** Split text into plain / URL segments, keeping trailing punctuation out of URLs. */
export function segmentUrls(text: string): { url: boolean; text: string }[] {
  // Cheap guard: no scheme, no work — and the URL-free line renders identically.
  if (!text.includes("http")) return [{ url: false, text }];
  const segs: { url: boolean; text: string }[] = [];
  for (const part of text.split(/(https?:\/\/[^\s]+)/g)) {
    if (part === "") continue;
    if (/^https?:\/\//.test(part)) {
      const url = trimUrlEnd(part);
      segs.push({ url: true, text: url });
      if (url.length < part.length) segs.push({ url: false, text: part.slice(url.length) });
    } else {
      segs.push({ url: false, text: part });
    }
  }
  return segs;
}

/** Fill `el` with `text`, rendering any http(s) URLs as clickable links. */
export function fillLinkified(el: HTMLElement, text: string): void {
  const segs = segmentUrls(text);
  if (segs.length === 1 && !segs[0].url) {
    el.textContent = text; // fast path: byte-identical to plain text
    return;
  }
  for (const seg of segs) {
    if (!seg.url) {
      el.append(document.createTextNode(seg.text));
      continue;
    }
    const a = document.createElement("a");
    a.className = "term-link";
    a.href = seg.text;
    a.textContent = seg.text;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    el.append(a);
  }
}
