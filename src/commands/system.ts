import type { Command } from "./registry.js";

export const help: Command = {
  name: "help",
  help: "visa den här hjälpen, eller hjälp för ett kommando",
  usage: "help [kommando]",
  run(args, ctx) {
    if (args[0]) {
      const cmd = ctx.registry.get(args[0]);
      if (!cmd) return ctx.error(`help: okänt kommando: ${args[0]}`);
      ctx.print(cmd.usage ?? cmd.name, "accent");
      ctx.print(`  ${cmd.help}`);
      return;
    }
    ctx.print("tillgängliga kommandon:", "dim");
    ctx.print();
    const width = Math.max(...ctx.registry.all().map((c) => c.name.length));
    for (const cmd of ctx.registry.all()) {
      ctx.print(`  ${cmd.name.padEnd(width)}  ${cmd.help}`);
    }
    ctx.print();
    ctx.print("skriv `help <kommando>` för användning.", "dim");
  },
};

export const whoami: Command = {
  name: "whoami",
  help: "visa vem du är inloggad som",
  run(_args, ctx) {
    ctx.print(ctx.session.user);
  },
};

export const echo: Command = {
  name: "echo",
  help: "skriv ut sina argument",
  usage: "echo [text...]",
  run(args, ctx) {
    ctx.print(args.join(" "));
  },
};

export const clear: Command = {
  name: "clear",
  help: "rensa skärmen",
  run(_args, ctx) {
    ctx.clear();
  },
};

export const neofetch: Command = {
  name: "neofetch",
  help: "visa systeminfo med en liten logga",
  run(_args, ctx) {
    const info = [
      `${ctx.session.user}@vera`,
      "─────────────",
      "os      VERA v0.1",
      "shell   vera-sh",
      "kärna   VFS + command registry",
      "tema    grön fosfor",
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
