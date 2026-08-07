/**
 * Manual-page content and rendering for the `man` package. A page is either
 * hand-written here (rich: description, options, examples) or, for any command
 * not in this table, built on the fly from the registry (NAME/SYNOPSIS from the
 * command's own name/usage/help). Pure and DOM-free, so it's easily tested; the
 * command wrapper in `index.ts` handles the registry lookup, paging and piping.
 */

export interface ManPage {
  /** One-line summary — the right-hand side of the NAME line. */
  summary: string;
  /** SYNOPSIS line. Commands default this to their `usage`; concepts may omit it. */
  synopsis?: string;
  /** DESCRIPTION paragraphs. */
  description?: string[];
  /** OPTIONS as [flag, explanation] pairs. */
  options?: [string, string][];
  /** EXAMPLES as [command, note?] pairs. */
  examples?: [string, string?][];
  /** SEE ALSO — related page names. */
  seeAlso?: string[];
  /** True for a topic that isn't a command (so no SYNOPSIS is inferred). */
  concept?: boolean;
}

const BODY_INDENT = "       "; // 7 spaces, like a real man page
const WIDTH = 70;

/** Greedy word-wrap to `width` columns; always returns at least one line. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (cur && cur.length + 1 + word.length > width) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Render a resolved page to man-style lines (section headers flush-left, body indented). */
export function renderPage(name: string, page: ManPage): string[] {
  const out: string[] = [];
  const para = (text: string, indent = BODY_INDENT, width = WIDTH) => {
    for (const line of wrap(text, width)) out.push(indent + line);
  };

  out.push("NAME");
  para(`${name} - ${page.summary}`);

  if (page.synopsis) {
    out.push("", "SYNOPSIS");
    para(page.synopsis);
  }

  if (page.description?.length) {
    out.push("", "DESCRIPTION");
    page.description.forEach((p, i) => {
      if (i) out.push("");
      para(p);
    });
  }

  if (page.options?.length) {
    out.push("", "OPTIONS");
    for (const [flag, text] of page.options) {
      out.push(BODY_INDENT + flag);
      para(text, BODY_INDENT + "    ", WIDTH - 4);
    }
  }

  if (page.examples?.length) {
    out.push("", "EXAMPLES");
    page.examples.forEach(([cmd, note], i) => {
      if (i) out.push("");
      out.push(BODY_INDENT + cmd);
      if (note) para(note, BODY_INDENT + "    ", WIDTH - 4);
    });
  }

  if (page.seeAlso?.length) {
    out.push("", "SEE ALSO");
    para(page.seeAlso.join(", "));
  }

  return out;
}

/**
 * The hand-written pages: a curated set of core commands fleshed out beyond
 * their one-line help, plus a few concept pages that have no single command
 * (the system itself, pipes, the config file). Everything else falls back to an
 * auto-generated skeleton from the registry.
 */
export const MANPAGES: Record<string, ManPage> = {
  // ---- concept pages --------------------------------------------------------
  pia: {
    concept: true,
    summary: "a little computer in your browser",
    description: [
      "PIA (Personal Integrated Applications) is a self-contained web terminal: " +
        "an in-memory filesystem, a shell with pipes and redirection, a text " +
        "editor, and a catalog of installable packages — all running client-side.",
      "It follows Unix convention wherever it can: real command names, flags, and " +
        "behaviour. Type `help` for the full command list, `man <command>` for a " +
        "page, or `tutor` for an interactive lesson. New tools install with `brew`.",
    ],
    seeAlso: ["help", "brew", "pipes", "config", "tutor"],
  },
  pipes: {
    concept: true,
    summary: "connect commands with | and redirect with > >>",
    description: [
      "A pipe `|` feeds one command's output into the next as its input, so small " +
        "tools compose into larger ones. Redirection sends output to a file " +
        "instead: `>` overwrites, `>>` appends.",
      "`&&` runs the next command only if the previous succeeded; `||` only if it " +
        "failed; `;` always runs the next. This is the same grammar a real shell uses.",
    ],
    examples: [
      ["sort fruit.txt | uniq | wc -l", "count the distinct lines in a file"],
      ["echo hello > a.txt", "write (overwrite) a file"],
      ["cat a.txt >> log.txt", "append to a file"],
      ["cat missing || echo not found", "run the fallback only on failure"],
    ],
    seeAlso: ["grep", "sort", "wc", "pia"],
  },
  config: {
    concept: true,
    summary: "the ~/.pia/config dotfile — prompt, theme, appearance, aliases",
    description: [
      "PIA reads ~/.pia/config at startup. It sets the prompt template, the colour " +
        "theme, the CRT overlay, and command aliases. Edit it with `nano " +
        "~/.pia/config`, then `source ~/.pia/config` to apply without a reload.",
      "Lines are `key = value`; `#` starts a comment. Aliases use " +
        "`alias name = expansion`.",
      "Appearance keys: `font` (an installed font, by name), `font-size` (px, " +
        "8–40), and `margin` (px of breathing room around the content — top and " +
        "sides, 0–80; the bottom keeps room for the on-screen key bar, and every " +
        "edge is clamped up to the device safe-area).",
      "The prompt's `{host}` placeholder is the machine name, read from the system " +
        "file /etc/hostname (not this config) — edit it to rename the machine, e.g. " +
        "`echo laptop > /etc/hostname` then `source ~/.pia/config`.",
    ],
    examples: [
      ["theme amber", "change the theme (writes to the config)"],
      ["font-size = 16", "bump the text size (edit the config)"],
      ["margin = 24", "more breathing room around the content"],
      ["echo laptop > /etc/hostname", "rename the machine (prompt {host})"],
      ["alias ll = ls -la", "define a shortcut"],
      ["source ~/.pia/config", "re-read and apply the config"],
    ],
    seeAlso: ["theme", "crt", "alias", "nano", "pia"],
  },

  // ---- fleshed-out command pages -------------------------------------------
  man: {
    summary: "display the manual page for a command or topic",
    synopsis: "man [-k keyword] [name]",
    description: [
      "Show the manual page for a command or concept. With no rich page written " +
        "for a command, man builds one from its name, usage and help, so every " +
        "installed command has at least a basic entry.",
      "The page opens in a pager (Space/b to scroll, q to quit). When man's output " +
        "is piped or redirected it prints plain text instead, like the real man.",
    ],
    options: [["-k keyword", "search page names and summaries (same as `apropos`)"]],
    examples: [
      ["man ls", "read the page for ls"],
      ["man pipes", "read the concept page on pipes"],
      ["man -k directory", "find pages mentioning 'directory'"],
    ],
    seeAlso: ["help", "apropos", "pia"],
  },
  ls: {
    summary: "list directory contents",
    synopsis: "ls [-a] [file...]",
    description: [
      "List the files in a directory (the current one by default). Directories " +
        "are shown with a trailing '/'; a shared file gets a trailing '@'.",
    ],
    options: [["-a", "include entries starting with '.' (hidden files)"]],
    examples: [["ls -a", "list including hidden files like .pia"]],
    seeAlso: ["cd", "pwd", "tree", "cat"],
  },
  cd: {
    summary: "change the working directory",
    synopsis: "cd [dir]",
    description: ["Change directory. `cd ..` goes up, and `cd ~` or `cd` alone goes home."],
    seeAlso: ["ls", "pwd", "mkdir"],
  },
  cat: {
    summary: "concatenate files and print them",
    synopsis: "cat [file...]",
    description: [
      "Print the contents of each file in turn. With no file, cat passes its piped " +
        "input straight through — handy as the start or end of a pipeline.",
    ],
    examples: [["cat a.txt b.txt", "print two files back to back"]],
    seeAlso: ["less", "head", "tail", "grep"],
  },
  echo: {
    summary: "write arguments to output",
    synopsis: "echo [text...]",
    description: ["Print its arguments, separated by spaces. Often used to write files via redirection."],
    examples: [["echo hello > a.txt", "create a file containing 'hello'"]],
    seeAlso: ["cat", "pipes"],
  },
  grep: {
    summary: "search for a pattern in text",
    synopsis: "grep [-n] pattern [file...]",
    description: [
      "Print the lines that contain the pattern. Reads files, or piped input when " +
        "no file is given.",
    ],
    options: [["-n", "prefix each match with its line number"]],
    examples: [["cat log.txt | grep -n error", "find 'error' lines with numbers"]],
    seeAlso: ["cat", "sort", "wc", "pipes"],
  },
  nano: {
    summary: "a small screen text editor",
    synopsis: "nano <file>",
    description: [
      "Edit a file in a full-screen editor (the filename is required). Save with " +
        "^O (WriteOut) and exit with ^X. `edit` is an alias.",
    ],
    seeAlso: ["cat", "less", "config"],
  },
  brew: {
    summary: "install and manage packages",
    synopsis: "brew <list|install|uninstall> [package]",
    description: [
      "PIA ships a small core; everything else is a package you opt into. `brew " +
        "list` shows the catalog, `brew install <name>` adds its commands, and they " +
        "persist across reloads.",
    ],
    examples: [
      ["brew list", "see every available package"],
      ["brew install coreutils", "add rev, base64, factor, xxd"],
    ],
    seeAlso: ["help", "pia"],
  },
  ping: {
    summary: "measure round-trip latency to the app or cloud",
    synopsis: "ping [-c count] [self|cloud]",
    description: [
      "An honest latency probe: the browser has no ICMP, so ping times a real " +
        "HTTP HEAD request to the app's own origin (`self`) or the cloud backend " +
        "(`cloud`). It refuses arbitrary hosts rather than invent numbers, since " +
        "the CSP blocks every other origin.",
    ],
    options: [["-c count", "number of packets to send (default 4, max 20)"]],
    examples: [["ping -c 8 self", "eight timed probes to the app's server"]],
    seeAlso: ["about", "pia"],
  },
  theme: {
    summary: "change the colour theme",
    synopsis: "theme [name]",
    description: ["Show the available themes, or switch to one. The choice is saved to ~/.pia/config."],
    seeAlso: ["crt", "config"],
  },
  sudo: {
    summary: "run a command with elevated privileges",
    synopsis: "sudo <command>",
    description: [
      "Run a command elevated: the write-guard on the system tree (/etc) is " +
        "lifted for it, so `sudo rm /etc/motd` or `sudo nano /etc/hostname` work " +
        "where a plain command gets `permission denied`.",
      "There's no password or user model — PIA is single-user, so you're always " +
        "allowed to elevate. sudo is just the deliberate switch for touching the " +
        "system files.",
      "Like a real shell, a redirection (`>`) is performed by the shell, not the " +
        "elevated command — so `sudo echo x > /etc/hostname` couldn't work — and " +
        "a pipe's input never reaches the elevated command. sudo therefore refuses " +
        "to run inside a pipe or with a redirect; elevate the command itself with " +
        "`sudo nano /etc/hostname` (or sudo rm/touch/cp/mv) instead.",
    ],
    examples: [
      ["sudo nano /etc/hostname", "rename the machine (edit a protected file)"],
      ["sudo rm /etc/motd", "remove a protected system file"],
    ],
    seeAlso: ["config", "whoami"],
  },
};
