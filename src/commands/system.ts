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
      `${ctx.session.user}@vera`,
      "─────────────",
      "os      VERA v0.1",
      "shell   vera-sh",
      "kernel  VFS + command registry",
      "theme   green phosphor",
    ];
    const logo = [
      "  ┌──────┐",
      "  │ VERA │",
      "  │  ◗◖  │",
      "  └──────┘",
      "          ",
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

export const systemCommands: Command[] = [help, whoami, echo, clear, neofetch];
