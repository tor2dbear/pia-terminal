import type { Terminal } from "./terminal/terminal.js";
import { VERSION } from "./meta.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether the user asked the OS for reduced motion — the same check
 * `Terminal.printTyped` uses, so the whole boot animation honours it together. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Options controlling the boot animation. */
export interface BootOptions {
  /** Play the longer retro BIOS/POST preamble before the prompt (opt-in). */
  bios?: boolean;
}

/** Print a short boot sequence, then hand the terminal to the user. */
export async function boot(term: Terminal, opts: BootOptions = {}): Promise<void> {
  // Hold the live prompt back until the sequence finishes, so it appears last —
  // like a real machine booting (messages, then a prompt), not sitting under a
  // banner that types in above it. This also ignores input during boot, so a
  // command can't be submitted before the prompt is even shown.
  term.setBooting(true);
  // Reduced motion collapses every paced delay to nothing (the lines still
  // print — they're content, not decoration), matching printTyped's behaviour.
  const reduce = prefersReducedMotion();
  const pause = (ms: number) => (reduce ? Promise.resolve() : delay(ms));
  try {
    // Opt-in retro power-on self-test — a longer, BIOS-flavoured preamble.
    if (opts.bios) await postSequence(term, reduce);

    // Wordmark lockup — the same p + block-cursor mark as the favicon.
    term.print("pia:~$ █", "accent");
    await term.printTyped("a little computer in the browser", "dim");
    await pause(160);
    term.print(`PIA v${VERSION} · Personal Integrated Applications`, "dim");
    await pause(140);
    // In BIOS mode the POST already reported memory/adapters, so skip the terse
    // one-liner rather than say it twice.
    if (!opts.bios) {
      term.print("memory ok · vfs mounted · adapters loaded", "dim");
      await pause(220);
    }
    term.print();
    // The invitation, typed out — the little computer greeting you.
    await term.printTyped("hi. type 'help' to begin.");
    // A signpost for newcomers: a self-running tour, the interactive tutor, and
    // the manual. `tutor`/`man` are preinstalled in the seed so these all work
    // on first run (see VFS.seed).
    term.print("new here? try `demo` for a tour, `tutor` to learn, or `man pia`.", "dim");
    term.print();
  } finally {
    term.setBooting(false);
  }
}

/**
 * A longer, retro power-on self-test — the opt-in `bios` boot, the complement to
 * the CRT overlay (both purely cosmetic, both off by default). Any keypress
 * skips the remaining pauses so a reload never traps you behind it.
 */
async function postSequence(term: Terminal, reduce: boolean): Promise<void> {
  let skipped = false;
  const onKey = () => {
    skipped = true;
  };
  // Under reduced motion the whole POST is instant, so there's nothing to skip.
  const listening = !reduce && typeof window !== "undefined";
  if (listening) window.addEventListener("keydown", onKey);
  const pause = (ms: number) => (skipped || reduce ? Promise.resolve() : delay(ms));
  try {
    term.print(`PIA BIOS v${VERSION}`, "accent");
    await pause(140);
    term.print("Personal Integrated Applications", "dim");
    await pause(200);
    term.print();
    // Dotted-leader POST lines — the machine checking itself over, retro-style.
    const steps = [
      "Memory Test ............. 65536K OK",
      "Detecting storage ....... vfs0",
      "Mounting filesystem ..... OK",
      "Loading adapters ........ storage · auth · share · reminders",
      "Boot device ............. vfs0",
    ];
    for (const line of steps) {
      term.print(line, "dim");
      await pause(150);
    }
    term.print();
    term.print("Starting PIA …", "dim");
    await pause(260);
    term.print();
  } finally {
    if (listening) window.removeEventListener("keydown", onKey);
  }
}
