/** Who the terminal thinks you are. Fake for now; real accounts land later. */
export interface Session {
  user: string;
}

/**
 * Authentication contract. Deliberately async so swapping the fake local
 * implementation for a backend (Supabase Auth) is a change of implementation,
 * not of every call site.
 */
export interface AuthAdapter {
  /** Whether login/registration needs a password (cloud) or just a name (fake). */
  readonly requiresPassword: boolean;
  /** The persisted session, or null if nobody is logged in. */
  current(): Promise<Session | null>;
  /** Log in. Local: `user` is the username. Cloud: `user` is the email. */
  login(user: string, password?: string): Promise<Session>;
  /**
   * Create an account with a chosen `username`. Cloud also needs email +
   * password (the username is stored as account metadata); the fake adapter
   * just uses the username.
   */
  register(username: string, email?: string, password?: string): Promise<Session>;
  /** Change the current user's display username. */
  rename(username: string): Promise<void>;
  /** Log out the current session. */
  logout(): Promise<void>;
  /**
   * Send a passwordless magic-link invite to `email`. Clicking it creates the
   * account (if new) and lands them logged in at `redirectTo`. Optional — only
   * a backend that can send email implements it; local/guest auth omits it.
   */
  inviteByEmail?(email: string, redirectTo: string): Promise<void>;
}
