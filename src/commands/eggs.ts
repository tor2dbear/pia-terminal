import type { Command } from "./registry.js";

/**
 * Hidden easter eggs — genuine terminal folklore, never advertised in `help` or
 * Tab-completion (see {@link Command.hidden}). They stay reachable if you
 * already know the name — that's the whole game — including via `man <name>`.
 *
 * The line we hold: an egg must not *lie about the machine*. PIA's `sudo` really
 * elevates and its `nano` really edits, so a fake `sudo: permission denied` or a
 * fake `rm -rf /` would contradict the real thing — those are deliberately
 * absent. What's left is honest lore (a magic word, a teapot) and friendly
 * redirects for muscle memory (vi/emacs → nano, `:q` → exit). See
 * `roadmap/easter-eggs.md` for the policy.
 */

// `xyzzy` — the magic word from Colossal Cave Adventure. On most Unix systems
// (via bsdgames) it prints exactly this and does nothing at all.
export const xyzzy: Command = {
  name: "xyzzy",
  help: "a magic word",
  hidden: true,
  run(_args, ctx) {
    ctx.print("Nothing happens.");
  },
};

// `coffee` — HTCPCP (RFC 2324): the server is a teapot, so it can't brew coffee.
// Deliberately its own command, distinct from `brew` — PIA's real package
// manager, which the gag must never shadow.
export const coffee: Command = {
  name: "coffee",
  help: "brew a cup (RFC 2324)",
  hidden: true,
  run(_args, ctx) {
    ctx.print("HTTP 418: I'm a teapot.", "accent");
  },
};

// vi / vim / emacs / pico — this machine ships `nano` (which is itself a pico
// clone). A friendly redirect for editor muscle memory, not a jab: you get
// pointed at the real editor instead of "command not found".
export const editorRedirect: Command = {
  name: "vim",
  help: "(this machine ships nano)",
  aliases: ["vi", "emacs", "pico"],
  hidden: true,
  run(_args, ctx) {
    ctx.print("this machine ships `nano` — try that (alias `edit`).", "dim");
  },
};

// `ed` — "ed is the standard text editor". The oldest editor gag in Unix. ed
// isn't implemented here, and the joke owns that while still pointing home.
export const ed: Command = {
  name: "ed",
  help: "the standard text editor",
  hidden: true,
  run(_args, ctx) {
    ctx.print("ed is the standard text editor.");
    ctx.print("(this machine ships `nano`, though — try that.)", "dim");
  },
};

// `:q` / `:wq` / `:x` — the vim-quit reflex, typed at the shell by a hand that
// thinks it's still in an editor. Point it at the real way out.
export const quitReflex: Command = {
  name: ":q",
  help: "(you're at the shell — type exit)",
  aliases: [":q!", ":wq", ":wq!", ":x"],
  hidden: true,
  run(_args, ctx) {
    ctx.print("you're at the shell, not in vi — type `exit` to leave.", "dim");
  },
};

export const eggCommands: Command[] = [
  xyzzy,
  coffee,
  editorRedirect,
  ed,
  quitReflex,
];
