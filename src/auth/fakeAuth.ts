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
}
