import type { AuthAdapter, Session } from "../auth/adapter.js";
import type { SupabaseLike } from "./client.js";

interface AuthUser {
  email: string | null;
  user_metadata?: { username?: string };
}

/** The chosen username (account metadata), falling back to the email handle. */
function handle(user: AuthUser | null | undefined): string {
  if (!user) return "user";
  return user.user_metadata?.username ?? (user.email?.split("@")[0] ?? "user");
}

/** Real authentication backed by Supabase Auth (email + password). */
export class SupabaseAuthAdapter implements AuthAdapter {
  readonly requiresPassword = true;

  constructor(private readonly client: SupabaseLike) {}

  async current(): Promise<Session | null> {
    const { data } = await this.client.auth.getUser();
    return data.user ? { user: handle(data.user) } : null;
  }

  async login(email: string, password?: string): Promise<Session> {
    if (!password) throw new Error("login: password required — login <email> <password>");
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return { user: handle(data.user) };
  }

  async register(username: string, email?: string, password?: string): Promise<Session> {
    if (!email || !password) {
      throw new Error("useradd: email and password required — useradd <username> <email> <password>");
    }
    const { error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw new Error(error.message);
    // With email confirmation on, sign-up creates no session yet.
    const { data: session } = await this.client.auth.getSession();
    if (!session.session) {
      throw new Error("account created — confirm via the email link, then run login");
    }
    return { user: username };
  }

  async rename(username: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ data: { username } });
    if (error) throw new Error(error.message);
  }

  async logout(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }
}
