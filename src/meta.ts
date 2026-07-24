/**
 * App metadata, sourced from package.json and injected by Vite at build time
 * (see vite.config.ts). Kept in one place so the boot banner, `neofetch`,
 * `about` and `version` never drift from each other or from package.json.
 * Falls back to "dev"/"" when running unbuilt (e.g. a bare tsc check).
 */
export const VERSION = typeof __PIA_VERSION__ !== "undefined" ? __PIA_VERSION__ : "dev";
export const REPO_URL = typeof __PIA_REPO_URL__ !== "undefined" ? __PIA_REPO_URL__ : "";
export const HOMEPAGE = typeof __PIA_HOMEPAGE__ !== "undefined" ? __PIA_HOMEPAGE__ : "";
export const NPM_URL = typeof __PIA_NPM_URL__ !== "undefined" ? __PIA_NPM_URL__ : "";
