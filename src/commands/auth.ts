import type { Command, CommandContext, Session } from "./registry.js";
import { reconcilePackages } from "../packages/catalog.js";
import { materializeShared } from "../share/materialize.js";

const GUEST = "guest";
const VALID_USER = /^[a-z0-9_-]+$/i;

function invalidName(verb: string): string {
  return `${verb}: username may use letters, digits, - and _ only`;
}

/**
 * Refuse an account change while another window is busy (a command mid-flight or
 * an app open). Switching accounts reloads the shared filesystem, so a command
 * running elsewhere would resolve its paths against the wrong account. Returns an
 * error message, or null if it's safe. (Single-window / no multiplexer → safe.)
 */
function accountBlocked(ctx: CommandContext): string | null {
  return ctx.tabs?.otherWindowsBusy()
    ? "another window is busy — let it finish (or close it) first; switching accounts reloads the filesystem"
    : null;
}

/**
 * Run an account transition under a cross-window lock, so no *other* window can
 * start a command while our awaits (auth, cloud reload) are in flight and the
 * shared VFS is about to be replaced. Pairs with the up-front `accountBlocked`
 * check, which rules out a command already running when we begin.
 */
async function withTransition(ctx: CommandContext, body: () => Promise<void>): Promise<void> {
  ctx.tabs?.beginTransition();
  try {
    // Persist any pending history to the *current* account before we switch
    // identity — otherwise the deferred save would route the old tree through
    // the new account's storage (saving guest files to a cloud account on login,
    // or the user's tree to guest localStorage on logout).
    await ctx.flushHistory?.();
    await body();
  } finally {
    ctx.tabs?.endTransition();
  }
}

/** Point the session, home directory, and cwd at `user`, creating the home. */
async function enter(ctx: CommandContext, user: string): Promise<void> {
  const home = `/home/${user}`;
  ctx.vfs.mkdirp(home);
  ctx.vfs.home = home;
  ctx.session.user = user;
  ctx.setCwd(home);
  await ctx.persist();
  // Adopt the new home's ~/.pia/config (theme, prompt, aliases) — otherwise an
  // in-place account switch keeps the previous user's settings.
  ctx.applyConfig?.();
  // …and its brew packages: drop the previous account's, register this one's, so
  // the live commands match `brew list` for the account you're now in.
  await reconcilePackages(ctx.vfs, ctx.vfs.home, ctx.registry);
  // Other windows share this session/VFS — re-home them onto the new account too.
  ctx.broadcastAccount?.();
}

export const login: Command = {
  name: "login",
  help: "log in (a username locally; email + password with a backend)",
  usage: "login <user> [password]",
  async run(args, ctx) {
    const blocked = accountBlocked(ctx);
    if (blocked) return ctx.error(`login: ${blocked}`);
    return withTransition(ctx, async () => {
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
    });
  },
};

export const useradd: Command = {
  name: "useradd",
  help: "create an account and log in (add email + password with a backend)",
  usage: "useradd <username> [email] [password]",
  aliases: ["register"],
  async run(args, ctx) {
    const blocked = accountBlocked(ctx);
    if (blocked) return ctx.error(`useradd: ${blocked}`);
    const username = args[0];
    if (!username) return ctx.error("useradd: specify a username");
    if (!VALID_USER.test(username)) return ctx.error(invalidName("useradd"));

    return withTransition(ctx, async () => {
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
      // Signup is frictionless (no email round-trip); verifying your inbox is a
      // separate, lazy step — only needed to accept lists others share with you.
      if (ctx.auth.requiresPassword && ctx.auth.sendEmailCheck) {
        ctx.print("tip: run `verify` to confirm your email (needed to accept shared lists)", "dim");
      }
    });
  },
};

export const verify: Command = {
  name: "verify",
  help: "confirm you control your account's email (needed to accept shared lists)",
  usage: "verify [code]",
  async run(args, ctx) {
    if (ctx.session.user === GUEST) return ctx.error("verify: log in first");
    if (!ctx.auth.sendEmailCheck || !ctx.auth.submitEmailCheck || !ctx.share?.confirmEmailControl) {
      return ctx.error("verify: needs a cloud account");
    }

    const code = args[0];
    if (!code) {
      try {
        const email = await ctx.auth.sendEmailCheck();
        ctx.print(`sent a 6-digit code to ${email}`, "accent");
        ctx.print("check your inbox, then run `verify <code>`", "dim");
      } catch (err) {
        ctx.error(`verify: ${err instanceof Error ? err.message : "could not send a code"}`);
      }
      return;
    }

    try {
      await ctx.auth.submitEmailCheck(code);
      const ok = await ctx.share.confirmEmailControl();
      if (!ok) {
        return ctx.error("verify: could not confirm — run `verify` for a fresh code and try again");
      }
      ctx.print("email verified ✓", "accent");
      // Now that you're verified, accept anything already shared with you and
      // drop it into ~/shared, same as a fresh boot would.
      const claimed = await ctx.share.claim();
      if (claimed > 0) {
        const placed = await materializeShared(ctx.vfs, ctx.share);
        await ctx.persist();
        if (placed > 0) {
          ctx.print(`accepted ${placed} shared list${placed === 1 ? "" : "s"} — \`ls ~/shared\``, "dim");
        }
      }
    } catch (err) {
      ctx.error(`verify: ${err instanceof Error ? err.message : "invalid code"}`);
    }
  },
};

export const usermod: Command = {
  name: "usermod",
  help: "rename the current user (home directory and files follow)",
  usage: "usermod <username>",
  async run(args, ctx) {
    const blocked = accountBlocked(ctx);
    if (blocked) return ctx.error(`usermod: ${blocked}`);
    const name = args[0];
    if (!name) return ctx.error("usermod: specify a username");
    if (!VALID_USER.test(name)) return ctx.error(invalidName("usermod"));
    if (ctx.session.user === GUEST) return ctx.error("usermod: log in first");
    if (name === ctx.session.user) return;

    return withTransition(ctx, async () => {
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
      ctx.applyConfig?.(); // the config moved with the home; re-read from the new path
      ctx.broadcastAccount?.(); // re-home other windows onto the renamed account
      ctx.print(`renamed to ${name}`, "accent");
    });
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
    const blocked = accountBlocked(ctx);
    if (blocked) return ctx.error(`logout: ${blocked}`);
    return withTransition(ctx, async () => {
      await ctx.auth.logout();
      await ctx.reloadFs?.(); // back to the guest's local tree
      await enter(ctx, GUEST);
      ctx.print("logged out");
    });
  },
};

export const authCommands: Command[] = [
  login,
  useradd,
  usermod,
  passwd,
  verify,
  invite,
  logout,
];
