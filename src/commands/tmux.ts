import type { Command } from "./registry.js";

/**
 * `tmux` — manage terminal windows (the multiplexer's command surface, and the
 * touch-friendly way to do what Ctrl-B c/n/p/x/1-9 do on a keyboard). Windows
 * share one machine: the same filesystem and account, each with its own cwd,
 * history and scrollback. Deliberately windows-only (no panes yet).
 */
export const tmux: Command = {
  name: "tmux",
  help: "manage terminal windows (new, next, prev, kill, or a number)",
  usage: "tmux [new | next | prev | kill | <n>]",
  aliases: ["tab"],
  run(args, ctx) {
    const tabs = ctx.tabs;
    if (!tabs) return ctx.error("tmux: windows aren't available here");

    const sub = args[0]?.toLowerCase();
    if (!sub) {
      const wins = tabs.list();
      ctx.print("windows:", "dim");
      for (const w of wins) ctx.print(`  ${w.index}: ${w.title}${w.active ? "  *" : ""}`);
      ctx.print(
        "`tmux new` · `tmux next`/`prev` · `tmux <n>` · `tmux kill`" +
          "   (or Ctrl-B then c / n / p / x / 1-9)",
        "dim",
      );
      return;
    }
    if (sub === "new" || sub === "c") return tabs.newWindow();
    if (sub === "next" || sub === "n") return tabs.next();
    if (sub === "prev" || sub === "p") return tabs.prev();
    if (sub === "kill" || sub === "x") return tabs.kill();
    if (/^[1-9][0-9]*$/.test(sub)) return tabs.select(Number(sub));
    ctx.error(`tmux: unknown command '${sub}' — try new, next, prev, kill, or a number`);
  },
};

export const tmuxCommands: Command[] = [tmux];
