import { VERSION, REPO_URL, HOMEPAGE, NPM_URL } from "../meta.js";
import type { Command } from "./registry.js";

// `about` — what PIA is and where to find it. There's no Unix equivalent for
// "open my repo", so this is a plainly-named surface (like `share`/`publish`):
// version, the tagline, and the source/home/npm links (clickable in the app).

export const about: Command = {
  name: "about",
  help: "about PIA — version, source, and links",
  aliases: ["repo"],
  run(_args, ctx) {
    ctx.print(`PIA v${VERSION} — a little computer in the browser`, "accent");
    ctx.print("Personal Integrated Applications");
    ctx.print();
    if (HOMEPAGE) ctx.print(`home     ${HOMEPAGE}`, "dim");
    if (REPO_URL) ctx.print(`source   ${REPO_URL}`, "dim");
    if (NPM_URL) ctx.print(`npm      ${NPM_URL}`, "dim");
    ctx.print();
    ctx.print("run `changelog` to see what's new.", "dim");
  },
};

export const aboutCommands: Command[] = [about];
