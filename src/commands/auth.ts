import type { Command, CommandContext, Session } from "./registry.js";

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

/** Shared flow for login/useradd: authenticate, pull the tree, enter home. */
async function authenticate(
  ctx: CommandContext,
  verb: "login" | "useradd",
  args: string[],
): Promise<void> {
  const user = args[0];
  const password = args[1];
  const cred = verb === "login" ? "login <email> <password>" : "useradd <email> <password>";

  if (!user) return ctx.error(`${verb}: specify a ${ctx.auth.requiresPassword ? "email" : "username"}`);
  if (ctx.auth.requiresPassword) {
    if (!password) return ctx.error(`${verb}: password required — ${cred}`);
  } else if (!VALID_USER.test(user)) {
    return ctx.error(`${verb}: username may use letters, digits, - and _ only`);
  }

  let session: Session;
  try {
    session =
      verb === "login"
        ? await ctx.auth.login(user, password)
        : await ctx.auth.register(user, password);
  } catch (err) {
    return ctx.error(err instanceof Error ? err.message : String(err));
  }

  await ctx.reloadFs?.(); // adopt the user's cloud tree, if any
  await enter(ctx, session.user);
  ctx.print(
    verb === "login"
      ? `logged in as ${session.user}`
      : `account created — logged in as ${session.user}`,
    "accent",
  );
}

export const login: Command = {
  name: "login",
  help: "log in (a name locally; email + password with a backend)",
  usage: "login <user> [password]",
  run: (args, ctx) => authenticate(ctx, "login", args),
};

export const useradd: Command = {
  name: "useradd",
  help: "create an account and log in (email + password with a backend)",
  usage: "useradd <user> [password]",
  aliases: ["register"],
  run: (args, ctx) => authenticate(ctx, "useradd", args),
};

export const logout: Command = {
  name: "logout",
  help: "log out and return to guest",
  async run(_args, ctx) {
    if (ctx.session.user === GUEST) {
      return ctx.error("logout: already guest");
    }
    await ctx.auth.logout();
    await ctx.reloadFs?.(); // back to the guest's local tree
    await enter(ctx, GUEST);
    ctx.print("logged out");
  },
};

export const authCommands: Command[] = [login, useradd, logout];
