import type { Command, CommandContext } from "./registry.js";

const GUEST = "guest";
const VALID_USER = /^[a-z0-9_-]+$/i;

/** Point the session, home directory, and cwd at `user`, creating the home. */
async function enter(ctx: CommandContext, user: string): Promise<void> {
  const home = `/home/${user}`;
  ctx.vfs.mkdirp(home);
  ctx.vfs.home = home;
  ctx.session.user = user;
  ctx.setCwd(home);
  await ctx.persist();
}

export const login: Command = {
  name: "login",
  help: "log in as a user (fake — accepts anyone)",
  usage: "login <user>",
  async run(args, ctx) {
    const user = args[0];
    if (!user) return ctx.error("login: specify a username");
    if (!VALID_USER.test(user)) {
      return ctx.error("login: username may use letters, digits, - and _ only");
    }
    const session = await ctx.auth.login(user);
    await enter(ctx, session.user);
    ctx.print(`logged in as ${session.user}`, "accent");
  },
};

export const logout: Command = {
  name: "logout",
  help: "log out and return to guest",
  async run(_args, ctx) {
    if (ctx.session.user === GUEST) {
      return ctx.error("logout: already guest");
    }
    await ctx.auth.logout();
    await enter(ctx, GUEST);
    ctx.print("logged out");
  },
};

export const authCommands: Command[] = [login, logout];
