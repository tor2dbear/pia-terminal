import type { AuthAdapter, Session } from "../auth/adapter.js";
import type { SupabaseLike } from "./client.js";

/** A short display handle from an email — the part before the @. */
function handle(email: string | null | undefined): string {
  return email ? email.split("@")[0] : "user";
}

/** Real authentication backed by Supabase Auth (email + password). */
export class SupabaseAuthAdapter implements AuthAdapter {
  readonly requiresPassword = true;

  constructor(private readonly client: SupabaseLike) {}

  async current(): Promise<Session | null> {
    const { data } = await this.client.auth.getUser();
    return data.user ? { user: handle(data.user.email) } : null;
  }

  async login(email: string, password?: string): Promise<Session> {
    if (!password) throw new Error("login: password required — login <email> <password>");
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return { user: handle(data.user?.email) };
  }

  async register(email: string, password?: string): Promise<Session> {
    if (!password) {
      throw new Error("register: password required — register <email> <password>");
    }
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    // With email confirmation on, sign-up creates no session yet.
    const { data: session } = await this.client.auth.getSession();
    if (!session.session) {
      throw new Error("account created — confirm via the email link, then run login");
    }
    return { user: handle(data.user?.email) };
  }

  async logout(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }
}
