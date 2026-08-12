import { VERSION } from "../meta.js";
import type { Command, CommandContext } from "./registry.js";

export const help: Command = {
  name: "help",
  help: "show this help, or help for one command",
  usage: "help [command]",
  run(args, ctx) {
    if (args[0]) {
      const cmd = ctx.registry.get(args[0]);
      if (!cmd) return ctx.error(`help: unknown command: ${args[0]}`);
      ctx.print(cmd.usage ?? cmd.name, "accent");
      ctx.print(`  ${cmd.help}`);
      return;
    }
    ctx.print("available commands:", "dim");
    ctx.print();
    // Hidden commands (easter eggs) stay off the list — they're a discovery,
    // not a menu — but `help <name>` still resolves them for the curious.
    const visible = ctx.registry.all().filter((c) => !c.hidden);
    const width = Math.max(...visible.map((c) => c.name.length));
    for (const cmd of visible) {
      ctx.print(`  ${cmd.name.padEnd(width)}  ${cmd.help}`);
    }
    ctx.print();
    ctx.print("type `help <command>` for usage.", "dim");
  },
};

export const whoami: Command = {
  name: "whoami",
  help: "show who you are logged in as",
  run(_args, ctx) {
    ctx.print(ctx.session.user);
  },
};

// The machine, not the user: `whoami` answers with your login (`guest`), while
// `whoareyou` lets the little computer introduce itself. A deliberate coinage
// (no Unix equivalent) — persona, not utility — and the line the social-preview
// (og.png) image shows, kept honest: retype it and you get exactly this.
export const whoareyou: Command = {
  name: "whoareyou",
  help: "ask the machine to introduce itself",
  aliases: ["whoru"],
  run(_args, ctx) {
    ctx.print("a little computer in the browser", "dim");
  },
};

/** Re-quote one already-tokenized argument so re-lexing the joined line yields
 * the same token — otherwise `sudo touch "/etc/my file"` would split back into
 * two files. Wrap in double quotes (the only quoting the lexer knows) when the
 * token is empty or carries whitespace or a shell operator. */
function requote(token: string): string {
  return token === "" || /[\s"|<>;&]/.test(token) ? `"${token}"` : token;
}

// `sudo <cmd>` runs the command elevated — the write-guard on the system tree
// (/etc) is lifted for the payload, so `sudo rm /etc/motd` / `sudo nano
// /etc/hostname` work where a plain command gets `permission denied`. There's no
// password or user model: PIA is single-user, you're always allowed to elevate;
// `sudo` is just the deliberate "I mean it, touch the system files" switch. The
// sandwich is the xkcd #149 gag.
export const sudo: Command = {
  name: "sudo",
  help: "run a command with elevated privileges (e.g. write to /etc)",
  usage: "sudo <command>",
  async run(args, ctx) {
    if (args.length === 0) {
      ctx.print("usage: sudo <command>", "dim");
      ctx.print("runs a command elevated — e.g. `sudo nano /etc/hostname`.", "dim");
      return;
    }
    if (args.join(" ").toLowerCase() === "make me a sandwich") {
      ctx.print("okay.", "accent"); // xkcd 149
      return;
    }
    // Refuse to take part in a pipe or a redirect. `sudo` re-runs its payload as
    // a *fresh* line, so a pipe's stdin never reaches it and a redirect is done
    // by the shell (unelevated) around it — so `echo x | sudo cat` would drop
    // the input and `sudo echo x > /etc/f` would truncate the file to empty.
    // Elevate the write itself instead (`sudo nano <file>`), like a real shell.
    if (ctx.piped || ctx.stdin !== "") {
      return ctx.error(
        "sudo: can't run in a pipe or with a redirect — elevate the command itself, e.g. `sudo nano /etc/hostname`",
      );
    }
    if (!ctx.exec) return ctx.error("sudo: not supported here");
    // Elevation lifts a *process-wide* guard, so hold the cross-window lock for
    // its duration: refuse if another window is mid-command, then block other
    // windows from starting one until the payload finishes — otherwise a plain
    // command elsewhere could write the protected tree while we're elevated
    // (`sudo nano` in particular stays open, so elevation lasts a while).
    if (ctx.tabs?.otherWindowsBusy()) {
      return ctx.error(
        "sudo: another window is busy — let it finish (or close it) first; elevation locks the machine",
      );
    }
    ctx.tabs?.beginTransition();
    try {
      // Re-quote each token so boundaries survive the payload's re-parse, then
      // run it with the write-guard lifted (async is held until it settles).
      // Propagate the payload's exit status silently so `&&`/`||` behave — its
      // own errors are already printed.
      const payload = args.map(requote).join(" ");
      const ok = await ctx.vfs.runElevated(() => ctx.exec!(payload));
      if (!ok) ctx.fail?.();
    } finally {
      ctx.tabs?.endTransition();
    }
  },
};

// `sh <file>` runs a script: it reads a file from the VFS and feeds each line
// through `ctx.exec` — the same seam `sudo` uses — so pipes, `;`/`&&`/`||`,
// redirects and globbing all work exactly as when typed at the prompt. `sh -c
// "<cmd>"` runs a command string; `cat script | sh` (no file) runs stdin as the
// script. Comments (`#…`, including a `#!` shebang) and blank lines are skipped.
// Like a real shell without `set -e`, a failing line doesn't stop the script;
// the exit status is the last command's, propagated via `ctx.fail?.()` so
// `sh a.sh && echo ok` behaves. There's no exec-bit in the VFS, so `chmod +x` +
// `./script` is out of scope (see roadmap/sh-scripts.md).
export const sh: Command = {
  name: "sh",
  help: "run a script file (or `sh -c \"<command>\"`)",
  usage: "sh [-c <command> | <file>]",
  aliases: ["bash"],
  async run(args, ctx) {
    if (!ctx.exec) return ctx.error("sh: not supported here");

    // `sh -c "cmd; cmd"` — run the rest of the line as one script source.
    if (args[0] === "-c") {
      const src = args.slice(1).join(" ");
      if (src === "") return ctx.error("sh: -c: option requires an argument");
      return runScript(src, ctx);
    }

    // A file argument: read it from the VFS. Extra args (`sh f.sh a b`) are
    // accepted but ignored — positional `$1`/`$@` await variable expansion.
    if (args.length > 0) {
      const file = args[0];
      const abs = ctx.vfs.resolve(ctx.cwd, file);
      const node = ctx.vfs.getNode(abs);
      if (!node) return ctx.error(`sh: cannot open ${file}: no such file`);
      if (node.type !== "file") return ctx.error(`sh: ${file}: is a directory`);
      return runScript(ctx.vfs.readFile(abs), ctx);
    }

    // No file: run piped/redirected stdin as the script (`echo cmd | sh`). An
    // empty piped script (`echo "" | sh`, an empty file) is valid — a silent
    // no-op — so key off *being* piped, not on the text being non-empty. With no
    // pipe at all there's nothing to run: the terminal itself is the interactive
    // shell, so we don't open a nested REPL — just show a hint.
    if (ctx.stdinPiped || ctx.stdin !== "") return runScript(ctx.stdin, ctx);
    ctx.print("usage: sh <file>   ·   sh -c \"<command>\"   ·   cat script | sh", "dim");
  },
};

/** Run script text line by line through the shell. Skips blanks and `#`
 * comments; continues past a failing line (no `set -e`); the exit status is the
 * last executed command's, surfaced via `ctx.fail?.()`. Stops on Ctrl-C.
 *
 * A script runs like a subprocess: a `cd` inside it must not leave the caller's
 * shell in a new directory (that's `source`'s job, not `sh`'s). So we snapshot
 * the cwd and restore it afterwards — the script's own lines still see each
 * other's `cd`, but the interactive prompt returns to where it started. */
async function runScript(src: string, ctx: CommandContext): Promise<void> {
  const cwd0 = ctx.cwd;
  let ok = true;
  try {
    for (const raw of src.split("\n")) {
      if (ctx.signal?.aborted) break; // Ctrl-C stops the rest of the script
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue; // blank / comment / shebang
      ok = await ctx.exec!(line);
    }
  } finally {
    // Restore unconditionally: `ctx.cwd` is a snapshot from when this context was
    // built, so it can't tell us whether a script line `cd`'d (those ran in their
    // own contexts and moved the terminal's live cwd). Setting it back to the
    // caller's is a harmless no-op when nothing changed.
    ctx.setCwd(cwd0); // subprocess semantics: caller's cwd is preserved
  }
  // Propagate the last command's status without re-printing — payload errors
  // were already shown by the shell machinery (mirrors how `sudo` forwards it).
  if (!ok) ctx.fail?.();
}

export const echo: Command = {
  name: "echo",
  help: "print the arguments",
  usage: "echo [text...]",
  run(args, ctx) {
    ctx.print(args.join(" "));
  },
};

export const clear: Command = {
  name: "clear",
  help: "clear the screen",
  run(_args, ctx) {
    ctx.clear();
  },
};

export const neofetch: Command = {
  name: "neofetch",
  help: "show system info with a small logo",
  run(_args, ctx) {
    const info = [
      `${ctx.session.user}@pia`,
      "─────────────",
      `os      PIA v${VERSION}`,
      "name    Personal Integrated Applications",
      "shell   pia-sh",
      "kernel  VFS + command registry",
      "theme   green phosphor",
    ];
    const logo = [
      "  ┌──────┐",
      "  │      │",
      "  │ p █  │",
      "  │      │",
      "  └──────┘",
      "    pia   ",
      "          ",
    ];
    const rows = Math.max(logo.length, info.length);
    for (let i = 0; i < rows; i++) {
      const left = (logo[i] ?? "").padEnd(12);
      const right = info[i] ?? "";
      ctx.print(`${left}${right}`, i === 0 ? "accent" : "normal");
    }
  },
};

export const date: Command = {
  name: "date",
  help: "print the current date and time",
  usage: "date [-u]",
  run(args, ctx) {
    const utc = args.includes("-u") || args.includes("--utc");
    const d = new Date();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const p = (n: number): string => String(n).padStart(2, "0");
    const wd = days[utc ? d.getUTCDay() : d.getDay()];
    const mo = months[utc ? d.getUTCMonth() : d.getMonth()];
    const day = utc ? d.getUTCDate() : d.getDate();
    const hh = utc ? d.getUTCHours() : d.getHours();
    const mm = utc ? d.getUTCMinutes() : d.getMinutes();
    const ss = utc ? d.getUTCSeconds() : d.getSeconds();
    const year = utc ? d.getUTCFullYear() : d.getFullYear();
    const offset = d.getTimezoneOffset(); // minutes behind UTC
    const tz =
      utc || offset === 0
        ? "UTC"
        : `UTC${offset < 0 ? "+" : "-"}${Math.floor(Math.abs(offset) / 60)}`;
    ctx.print(`${wd} ${mo} ${p(day)} ${p(hh)}:${p(mm)}:${p(ss)} ${tz} ${year}`);
  },
};

// `exit` — leave the current shell. In tmux that closes the active window, so
// with more than one window open PIA does exactly that. The last window *is* the
// whole machine, running in a browser tab, and script can't reliably close a tab
// — so on the last window (or with no multiplexer) `exit` says so honestly rather
// than pretending to quit. (`logout` is a separate auth command — signing out,
// not leaving.) This is also the real command the `:q`/`vi` eggs point at.
export const exit: Command = {
  name: "exit",
  help: "close the current window (like leaving a shell)",
  run(_args, ctx) {
    const tabs = ctx.tabs;
    if (tabs && tabs.list().length > 1) {
      tabs.kill(); // exiting a shell closes its tmux window
      return;
    }
    ctx.print("this is the last window — close the browser tab to leave.", "dim");
    ctx.print("(`tmux new` opens another window; `tmux` lists them.)", "dim");
  },
};

export const history: Command = {
  name: "history",
  help: "list your command history (persists across sessions; -c to clear)",
  usage: "history [-c]",
  run(args, ctx) {
    if (args.includes("-c")) {
      ctx.clearHistory?.();
      return;
    }
    const entries = ctx.history?.() ?? [];
    const width = String(entries.length).length;
    entries.forEach((cmd, i) => {
      ctx.print(`${String(i + 1).padStart(width)}  ${cmd}`);
    });
  },
};

export const systemCommands: Command[] = [
  help,
  whoami,
  whoareyou,
  sudo,
  sh,
  echo,
  clear,
  neofetch,
  date,
  exit,
  history,
];
