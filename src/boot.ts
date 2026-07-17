import type { Terminal } from "./terminal/terminal.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Print a short boot sequence, then hand the terminal to the user. */
export async function boot(term: Terminal): Promise<void> {
  // Wordmark lockup — the same p + block-cursor mark as the favicon.
  term.print("pia:~$ █", "accent");
  term.print("a little computer in the browser", "dim");
  await delay(180);
  term.print("PIA v0.1 · Personal Integrated Applications", "dim");
  await delay(180);
  term.print("memory ok · vfs mounted · adapters loaded", "dim");
  await delay(180);
  term.print();
  term.print("hi. type 'help' to begin.");
  term.print();
}
