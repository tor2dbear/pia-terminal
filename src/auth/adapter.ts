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
  /** The persisted session, or null if nobody is logged in. */
  current(): Promise<Session | null>;
  /** Log in as `user`. The fake adapter accepts anyone. */
  login(user: string, password?: string): Promise<Session>;
  /** Create an account. The fake adapter treats this like login. */
  register(user: string, password?: string): Promise<Session>;
  /** Log out the current session. */
  logout(): Promise<void>;
}
