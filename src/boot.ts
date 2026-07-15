import type { Terminal } from "./terminal/terminal.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Print a short boot sequence, then hand the terminal to the user. */
export async function boot(term: Terminal): Promise<void> {
  term.print("VERA v0.1", "accent");
  await delay(180);
  term.print("minne ok · vfs monterat · adaptrar laddade", "dim");
  await delay(180);
  term.print();
  term.print("hej. skriv 'help' för att börja.");
  term.print();
}
