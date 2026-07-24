import type { Terminal } from "./terminal/terminal.js";
import { VERSION } from "./meta.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Print a short boot sequence, then hand the terminal to the user. */
export async function boot(term: Terminal): Promise<void> {
  // Hold the live prompt back until the sequence finishes, so it appears last —
  // like a real machine booting (messages, then a prompt), not sitting under a
  // banner that types in above it.
  term.setPromptVisible(false);
  try {
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
  } finally {
    term.setPromptVisible(true);
  }
}
