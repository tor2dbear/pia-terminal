import type { Terminal } from "./terminal/terminal.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** App version from package.json (injected by vite); "dev" if not built. */
const VERSION = typeof __PIA_VERSION__ !== "undefined" ? __PIA_VERSION__ : "dev";

/** Print a short boot sequence, then hand the terminal to the user. */
export async function boot(term: Terminal): Promise<void> {
  // Wordmark lockup — the same p + block-cursor mark as the favicon.
  term.print("pia:~$ █", "accent");
  await term.printTyped("a little computer in the browser", "dim");
  await delay(160);
  term.print(`PIA v${VERSION} · Personal Integrated Applications`, "dim");
  await delay(140);
  term.print("memory ok · vfs mounted · adapters loaded", "dim");
  await delay(220);
  term.print();
  // The invitation, typed out — the little computer greeting you.
  await term.printTyped("hi. type 'help' to begin.");
  term.print();
}
