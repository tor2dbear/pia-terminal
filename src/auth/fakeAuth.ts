import type { AuthAdapter, Session } from "./adapter.js";

const KEY = "pia:session:v1";

/**
 * A stand-in for real auth: it accepts any username, ignores the password, and
 * remembers the session in localStorage. Same shape as the future Supabase
 * adapter, so the login/logout commands never change.
 */
export class FakeAuthAdapter implements AuthAdapter {
  readonly requiresPassword = false;

  constructor(private key: string = KEY) {}

  async current(): Promise<Session | null> {
    const user = localStorage.getItem(this.key);
    return user ? { user } : null;
  }

  async login(user: string): Promise<Session> {
    localStorage.setItem(this.key, user);
    return { user };
  }

  async register(username: string): Promise<Session> {
    return this.login(username);
  }

  async rename(username: string): Promise<void> {
    localStorage.setItem(this.key, username);
  }

  async logout(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}

/** In-memory auth — for tests and no-storage environments. */
export class MemoryAuthAdapter implements AuthAdapter {
  readonly requiresPassword = false;
  private user: string | null = null;
  /** Records magic-link invites, so tests can assert the email path. */
  readonly invitedEmails: string[] = [];

  async current(): Promise<Session | null> {
    return this.user ? { user: this.user } : null;
  }

  async login(user: string): Promise<Session> {
    this.user = user;
    return { user };
  }

  async register(username: string): Promise<Session> {
    return this.login(username);
  }

  async rename(username: string): Promise<void> {
    this.user = username;
  }

  async logout(): Promise<void> {
    this.user = null;
  }

  async inviteByEmail(email: string): Promise<void> {
    this.invitedEmails.push(email);
  }

  /** The code the last {@link sendEmailCheck} "emailed" — tests read it back. */
  emailCode: string | null = null;

  async sendEmailCheck(): Promise<string> {
    if (!this.user) throw new Error("verify: log in first");
    this.emailCode = "424242";
    return `${this.user}@example.test`;
  }

  async submitEmailCheck(code: string): Promise<void> {
    if (code !== this.emailCode) throw new Error("invalid or expired code");
    this.emailCode = null;
  }
}
