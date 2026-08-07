import { VERSION } from "../meta.js";
import type { Command } from "./registry.js";

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
    const width = Math.max(...ctx.registry.all().map((c) => c.name.length));
    for (const cmd of ctx.registry.all()) {
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
  echo,
  clear,
  neofetch,
  date,
  history,
];
