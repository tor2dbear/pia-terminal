/**
 * Colour themes. A theme is just the five palette tokens the whole app already
 * reads as CSS custom properties (see src/style.css :root); switching one sets
 * those properties on the document element, overriding the stylesheet defaults.
 * Setting them via the CSSOM (element.style.setProperty) — not an inline style
 * attribute — keeps this compatible with the site's Content-Security-Policy.
 */
export interface Palette {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  error: string;
}

export const THEMES: Record<string, Palette> = {
  // The original: green phosphor on near-black.
  phosphor: { bg: "#0b0f0a", fg: "#c9e8c2", dim: "#6f8f6a", accent: "#7cf27c", error: "#f27c7c" },
  // Warm amber CRT.
  amber: { bg: "#0d0a04", fg: "#ffd596", dim: "#9c7b43", accent: "#ffb000", error: "#ff6b5e" },
  // Cool blue tube.
  ice: { bg: "#06090f", fg: "#bcd8f0", dim: "#5f7d99", accent: "#5cc8ff", error: "#ff7c9c" },
  // Neutral greyscale.
  mono: { bg: "#0a0a0a", fg: "#d8d8d8", dim: "#7a7a7a", accent: "#ffffff", error: "#ff9a9a" },
};

/** The default theme name — the app's original look. */
export const DEFAULT_THEME = "phosphor";

/** All theme names, sorted, for listing and validation. */
export function themeNames(): string[] {
  return Object.keys(THEMES).sort();
}

/** Apply a theme by name, falling back to the default for an unknown name. */
export function applyTheme(name: string, root: HTMLElement = document.documentElement): void {
  const p = THEMES[name] ?? THEMES[DEFAULT_THEME];
  root.style.setProperty("--bg", p.bg);
  root.style.setProperty("--fg", p.fg);
  root.style.setProperty("--dim", p.dim);
  root.style.setProperty("--accent", p.accent);
  root.style.setProperty("--error", p.error);
}

/**
 * Layer the user's own appearance overrides on top of the theme: per-token hex
 * colours, plus font family and size. Applied after {@link applyTheme}, so a
 * removed override falls back to the theme (colours, re-set by applyTheme) or
 * the stylesheet default (font, cleared here). All via the CSSOM, CSP-safe.
 */
export function applyAppearance(
  colors: Partial<Palette>,
  font: string | undefined,
  fontSize: number | undefined,
  root: HTMLElement = document.documentElement,
): void {
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--${key}`, value);
  }
  if (font) root.style.setProperty("--font", font);
  else root.style.removeProperty("--font");
  if (fontSize) root.style.setProperty("--font-size", `${fontSize}px`);
  else root.style.removeProperty("--font-size");
}
