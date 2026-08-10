/**
 * Turn a filename (or a relative link target) into a URL-safe page slug:
 * lowercase, diacritics stripped, every run of other characters collapsed to a
 * single hyphen. Kept dependency-free so both the `publish` command and the
 * Markdown renderer (which the Pages Function bundles) can share one mapping —
 * that's what keeps filename ↔ path ↔ URL ↔ intra-site link all in step.
 */
export function slugForName(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
