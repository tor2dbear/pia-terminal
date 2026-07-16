import type { Command, CommandContext, Session } from "./registry.js";

const GUEST = "guest";
const VALID_USER = /^[a-z0-9_-]+$/i;

function invalidName(verb: string): string {
  return `${verb}: username may use letters, digits, - and _ only`;
}

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
  help: "log in (a username locally; email + password with a backend)",
  usage: "login <user> [password]",
  async run(args, ctx) {
    let session: Session;
    try {
      if (ctx.auth.requiresPassword) {
        const [email, password] = args;
        if (!email) return ctx.error("login: specify an email");
        if (!password) {
          return ctx.error("login: password required — login <email> <password>");
        }
        session = await ctx.auth.login(email, password);
      } else {
        const user = args[0];
        if (!user) return ctx.error("login: specify a username");
        if (!VALID_USER.test(user)) return ctx.error(invalidName("login"));
        session = await ctx.auth.login(user);
      }
    } catch (err) {
      return ctx.error(err instanceof Error ? err.message : String(err));
    }

    await ctx.reloadFs?.(); // adopt the user's cloud tree, if any
    await enter(ctx, session.user);
    ctx.print(`logged in as ${session.user}`, "accent");
  },
};

export const useradd: Command = {
  name: "useradd",
  help: "create an account and log in (add email + password with a backend)",
  usage: "useradd <username> [email] [password]",
  aliases: ["register"],
  async run(args, ctx) {
    const username = args[0];
    if (!username) return ctx.error("useradd: specify a username");
    if (!VALID_USER.test(username)) return ctx.error(invalidName("useradd"));

    let session: Session;
    try {
      if (ctx.auth.requiresPassword) {
        const [, email, password] = args;
        if (!email || !password) {
          return ctx.error(
            "useradd: email and password required — useradd <username> <email> <password>",
          );
        }
        session = await ctx.auth.register(username, email, password);
      } else {
        session = await ctx.auth.register(username);
      }
    } catch (err) {
      return ctx.error(err instanceof Error ? err.message : String(err));
    }

    await ctx.reloadFs?.();
    await enter(ctx, session.user);
    ctx.print(`account created — logged in as ${session.user}`, "accent");
  },
};

export const usermod: Command = {
  name: "usermod",
  help: "rename the current user (home directory and files follow)",
  usage: "usermod <username>",
  async run(args, ctx) {
    const name = args[0];
    if (!name) return ctx.error("usermod: specify a username");
    if (!VALID_USER.test(name)) return ctx.error(invalidName("usermod"));
    if (ctx.session.user === GUEST) return ctx.error("usermod: log in first");
    if (name === ctx.session.user) return;

    try {
      await ctx.auth.rename(name);
    } catch (err) {
      return ctx.error(err instanceof Error ? err.message : String(err));
    }

    // Rename the home directory so the user's files follow the new name.
    const oldHome = `/home/${ctx.session.user}`;
    const newHome = `/home/${name}`;
    if (ctx.vfs.getNode(oldHome) && !ctx.vfs.getNode(newHome)) {
      ctx.vfs.move(oldHome, newHome);
    } else {
      ctx.vfs.mkdirp(newHome);
    }
    ctx.vfs.home = newHome;
    ctx.session.user = name;
    ctx.setCwd(newHome);
    await ctx.persist();
    ctx.print(`renamed to ${name}`, "accent");
  },
};

export const passwd: Command = {
  name: "passwd",
  help: "set or change your account password",
  usage: "passwd <new-password>",
  async run(args, ctx) {
    if (ctx.session.user === GUEST) return ctx.error("passwd: log in first");
    if (!ctx.auth.setPassword) {
      return ctx.error("passwd: passwords need a backend account");
    }
    const password = args[0];
    if (!password) return ctx.error("passwd: usage: passwd <new-password>");
    if (password.length < 6) {
      return ctx.error("passwd: password must be at least 6 characters");
    }
    try {
      await ctx.auth.setPassword(password);
    } catch (err) {
      return ctx.error(err instanceof Error ? err.message : String(err));
    }
    ctx.print("password set — you can now `login <email> <password>`", "accent");
  },
};

export const invite: Command = {
  name: "invite",
  help: "invite someone to PIA by email (sends them a sign-in link)",
  usage: "invite <email>",
  async run(args, ctx) {
    if (ctx.session.user === GUEST) return ctx.error("invite: log in first");
    if (!ctx.auth.inviteByEmail) {
      return ctx.error("invite: needs a cloud account");
    }
    const email = args[0];
    if (!email) return ctx.error("invite: specify an email");
    try {
      await ctx.auth.inviteByEmail(email, ctx.baseUrl);
    } catch (err) {
      return ctx.error(err instanceof Error ? err.message : String(err));
    }
    ctx.print(`invited ${email} — they'll get a sign-in link`, "accent");
    ctx.print("clicking it creates their account and logs them in", "dim");
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
    await ctx.reloadFs?.(); // back to the guest's local tree
    await enter(ctx, GUEST);
    ctx.print("logged out");
  },
};

export const authCommands: Command[] = [
  login,
  useradd,
  usermod,
  passwd,
  invite,
  logout,
];
