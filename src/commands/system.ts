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
      `${ctx.session.user}@pia`,
      "─────────────",
      "os      PIA v0.1",
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

export const systemCommands: Command[] = [help, whoami, echo, clear, neofetch, date];
