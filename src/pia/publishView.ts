import type { PublishedSite } from "../share/publish.js";
import { renderMarkdownToHtml } from "./markdownHtml.js";

/**
 * Render a published site (decoded from a `#p=` URL) as a read-only web page:
 * a heading, a table of contents when there's more than one page, and each
 * Markdown file as its own section. Built for viewing, not editing — there's no
 * terminal here (see `main.ts`, which shows this instead of booting the shell).
 *
 * Filenames go in via textContent; only the Markdown bodies become HTML, and
 * those are escaped by {@link renderMarkdownToHtml}.
 */
export function renderPublishedSite(site: PublishedSite): HTMLElement {
  const root = document.createElement("article");
  root.className = "pub";

  const header = document.createElement("header");
  header.className = "pub-head";
  const h1 = document.createElement("h1");
  h1.textContent = site.title || "Published";
  const sub = document.createElement("p");
  sub.className = "pub-sub";
  const n = site.pages.length;
  sub.textContent = `published from PIA · ${n} page${n === 1 ? "" : "s"}`;
  header.append(h1, sub);
  root.append(header);

  // A table of contents only earns its place with more than one page.
  if (n > 1) {
    const nav = document.createElement("nav");
    nav.className = "pub-toc";
    const list = document.createElement("ul");
    site.pages.forEach((page, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#sec-${i}`;
      a.textContent = page.name;
      li.append(a);
      list.append(li);
    });
    nav.append(list);
    root.append(nav);
  }

  const main = document.createElement("main");
  site.pages.forEach((page, i) => {
    const section = document.createElement("section");
    section.className = "pub-section";
    section.id = `sec-${i}`;
    const title = document.createElement("h2");
    title.className = "pub-filename";
    title.textContent = page.name;
    const bodyEl = document.createElement("div");
    bodyEl.className = "pub-body";
    bodyEl.innerHTML = renderMarkdownToHtml(page.content);
    section.append(title, bodyEl);
    main.append(section);
  });
  root.append(main);

  const footer = document.createElement("footer");
  footer.className = "pub-foot";
  const link = document.createElement("a");
  link.href = location.pathname; // back to the terminal itself
  link.textContent = "made with PIA";
  footer.append(link);
  root.append(footer);

  return root;
}
