/**
 * Turn http(s) URLs in a line of terminal output into clickable links. Terminal
 * output is otherwise plain text; this is what makes `about`/`neofetch`'s repo
 * and npm links tappable (a real help on mobile). External links open in a new
 * tab with `noopener`. Anchors carry no inline handlers, so this stays within
 * the strict CSP.
 */

/** Split text into plain / URL segments, keeping trailing punctuation out of URLs. */
export function segmentUrls(text: string): { url: boolean; text: string }[] {
  // Cheap guard: no scheme, no work — and the URL-free line renders identically.
  if (!text.includes("http")) return [{ url: false, text }];
  const segs: { url: boolean; text: string }[] = [];
  for (const part of text.split(/(https?:\/\/[^\s]+)/g)) {
    if (part === "") continue;
    if (/^https?:\/\//.test(part)) {
      // Don't swallow sentence punctuation that trails a URL.
      const url = part.replace(/[.,;:!?)\]}'"]+$/, "");
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
