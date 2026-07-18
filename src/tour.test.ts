// @vitest-environment jsdom
//
// The tour: one scripted session driven through the REAL terminal (the same
// Terminal class, input loop and commands the app uses), captured as a golden
// transcript in `tour.golden.txt`. It's the broad "does a whole session still
// look right" check, and doubles as human-readable documentation of what PIA
// does — read the golden file to see a full session's output.
//
// When you add a feature: add lines to TOUR, run `vitest -u` to update the
// golden, and review the transcript diff (that diff IS the output verification).
// Volatile bits (share/publish payloads) are redacted and the clock is frozen,
// so the only changes are real behaviour changes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "./terminal/terminal.js";
import { VFS } from "./vfs/vfs.js";
import { MemoryStorageAdapter } from "./storage/localStorage.js";
import { MemoryAuthAdapter } from "./auth/fakeAuth.js";
import { buildRegistry } from "./commands/index.js";
import { piaExtendContext } from "./pia/context.js";
import { loadTerminalConfig } from "./pia/terminalConfig.js";
import { boot } from "./boot.js";

const tick = () => new Promise((r) => setTimeout(r, 1));
/** A fixed instant so `date -u` is deterministic regardless of the CI clock. */
const FIXED = new Date("2026-07-18T12:00:00Z");

let term: Terminal | undefined;
let root: HTMLElement;

function mount(): void {
  root = document.createElement("div");
  document.body.append(root);
  const vfs = VFS.seed();
  term = new Terminal(root, {
    vfs,
    adapter: new MemoryStorageAdapter(),
    registry: buildRegistry(),
    session: { user: "guest" },
    // Seed + apply ~/.pia/config at boot, exactly like main.ts.
    configure: () => loadTerminalConfig(vfs),
    // A fixed baseUrl so share/publish links don't depend on the test host.
    extendContext: piaExtendContext(new MemoryAuthAdapter(), undefined, "https://pia.example/"),
  });
}

async function run(line: string): Promise<void> {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
  field.value = line;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  // Wait for the command to actually finish (busy collapses the input line;
  // it un-collapses when done) rather than a fixed delay — async commands like
  // `brew install` (a dynamic import) can take longer on a slow CI runner.
  const inputline = root.querySelector(".term-inputline") as HTMLElement;
  for (let i = 0; i < 2000 && inputline.classList.contains("collapsed"); i++) {
    await tick();
  }
}

/** The whole session transcript, with volatile bits redacted. */
function transcript(): string {
  return [...root.querySelectorAll(".term-line")]
    .map((n) => (n.textContent ?? "").replace(/([#&][sp])=[A-Za-z0-9_-]+/g, "$1=<payload>"))
    .join("\n");
}

// Each entry is a command line, run in order. `echo "# …"` lines are section
// headers so the golden file reads as a guided tour.
const TOUR: string[] = [
  'echo "# filesystem"',
  "pwd",
  "ls",
  "ls -a",
  "mkdir notes",
  "cd notes",
  "pwd",
  'echo "first line" > a.txt',
  'echo "second line" >> a.txt',
  "cat a.txt",
  "cp a.txt b.txt",
  "mv b.txt c.txt",
  "ls",
  "rm c.txt",
  "ls",
  "cd ..",
  "tree",

  'echo "# text & pipes"',
  'echo "banana" > fruit.txt',
  'echo "apple" >> fruit.txt',
  'echo "apple" >> fruit.txt',
  'echo "cherry" >> fruit.txt',
  "sort fruit.txt",
  "sort fruit.txt | uniq",
  "cat fruit.txt | wc -l",
  "head -2 fruit.txt",
  "tail -1 fruit.txt",
  "grep -n apple fruit.txt",
  "cut -c1-3 fruit.txt",
  "ls *.txt",
  "echo hi && echo bye",
  "cat nope.txt || echo recovered",

  'echo "# config, theme, prompt"',
  "theme",
  "theme amber",
  "alias ll ls -la",
  "alias",
  "source ~/.pia/config",
  "cat ~/.pia/config",

  'echo "# share & publish"',
  "share fruit.txt",
  "mkdir site",
  'echo "# My Site" > site/index.md',
  'echo "welcome, visitor" >> site/index.md',
  "publish site",
  "glow site/index.md",

  'echo "# scheduling"',
  "crontab -l",
  "at now+5m echo remember",
  "at -l",
  "at -r 1",

  'echo "# packages (brew)"',
  "brew list",
  "brew install cowsay",
  "cowsay hello from a package",
  "brew uninstall cowsay",
  "brew install cal",
  "cal 7 2026",
  "brew install bc",
  'bc "2 + 3 * 4"',
  "echo 6*7 | bc",
  "brew install fortune",
  "fortune",
  // Screen-app packages: install-only here (they take over the screen when run).
  "brew install sl",
  "brew install cmatrix",
  "brew install tutor",
  "brew install life",
  "brew install tetris",
  "brew install qr",
  "brew install python",

  'echo "# system"',
  "whoami",
  "date -u",
  "help",
  "history | tail -5",
];

describe("tour — a scripted session through the real terminal", () => {
  beforeEach(() => {
    // Freeze Date only (leave setTimeout real, so `flush()` still works).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED);
    mount();
  });
  afterEach(() => {
    term?.dispose();
    term = undefined;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("matches the golden transcript (update with `vitest -u`)", async () => {
    await boot(term!);
    for (const line of TOUR) await run(line);
    await expect(transcript()).toMatchFileSnapshot("./tour.golden.txt");
  });
});
