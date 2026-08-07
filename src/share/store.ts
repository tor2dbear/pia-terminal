/**
 * A checklist that lives in the cloud and can be edited by more than one
 * logged-in user — the seam behind collaboration, mirroring how
 * `StorageAdapter` sits behind the filesystem. The terminal and the `todo`
 * command talk only to this interface; guests get {@link NullShareStore},
 * logged-in cloud users get the Supabase implementation, tests get
 * {@link MemoryShareStore}.
 */

/**
 * A member's role on a shared list — the collaboration analogue of the /etc
 * write-guard (see `roadmap/shared-file-roles.md`):
 *   owner  — the creator; edits, invites, removes members, deletes the list.
 *   editor — edits content and invites others.
 *   viewer — read-only; sees the list and live updates but can't edit or invite.
 */
export type Role = "owner" | "editor" | "viewer";

/** A role you can *invite* someone as — never straight to owner. */
export type InviteRole = "editor" | "viewer";

export interface SharedList {
  id: string;
  name: string;
  content: string;
  /** The current user's own role on this list (absent if unknown, e.g. a bare
   * `get(id)` that doesn't carry membership). */
  role?: Role;
}

/** One row of a list's membership, for `todo members`. */
export interface Member {
  email: string;
  role: Role;
  /** `member` = joined; `invited` = a pending invite not yet claimed. */
  status: "member" | "invited";
}

export interface ShareStore {
  /** Whether sharing exists at all (i.e. a cloud backend is wired up). */
  available(): boolean;
  /** Lists the current user is a member of (each with the caller's own role). */
  mine(): Promise<SharedList[]>;
  /** Fetch one list's freshest content by id, or null if it's gone. */
  get(id: string): Promise<SharedList | null>;
  /** Create a shared list from a name + content; resolves to its id. The caller
   * becomes its owner. */
  create(name: string, content: string): Promise<string>;
  /** Overwrite a shared list's content (last write wins). Refused for a viewer. */
  save(id: string, content: string): Promise<void>;
  /** Invite someone (by email) to a list the caller can edit, as `role`
   * (default `editor`). */
  invite(id: string, email: string, role?: InviteRole): Promise<void>;
  /** The members and pending invites of a list (visible to any member). */
  members(id: string): Promise<Member[]>;
  /** Remove a member (or cancel a pending invite) by email. Owner only. */
  removeMember(id: string, email: string): Promise<void>;
  /** Delete a whole list. Owner only. */
  deleteList(id: string): Promise<void>;
  /** Leave a shared list (drop your own membership); it stays for the others. */
  leave(id: string): Promise<void>;
  /** Claim any invites addressed to the current user; resolves to the count. */
  claim(): Promise<number>;
  /**
   * Watch a list for changes made by other members. `onChange` fires with the
   * new content whenever it's updated in the cloud. Returns an unsubscribe
   * function. Optional — only a live backend implements it.
   */
  subscribe?(id: string, onChange: (content: string) => void): () => void;
}

/** Sharing turned off: the local/guest build with no cloud backend. */
export class NullShareStore implements ShareStore {
  available(): boolean {
    return false;
  }
  async mine(): Promise<SharedList[]> {
    return [];
  }
  async get(): Promise<SharedList | null> {
    return null;
  }
  async create(): Promise<string> {
    throw new Error("sharing is unavailable");
  }
  async save(): Promise<void> {
    /* no-op */
  }
  async invite(): Promise<void> {
    throw new Error("sharing is unavailable");
  }
  async members(): Promise<Member[]> {
    return [];
  }
  async removeMember(): Promise<void> {
    throw new Error("sharing is unavailable");
  }
  async deleteList(): Promise<void> {
    throw new Error("sharing is unavailable");
  }
  async leave(): Promise<void> {
    /* nothing shared to leave */
  }
  async claim(): Promise<number> {
    return 0;
  }
}

/**
 * An in-memory ShareStore for tests. Simulates the multi-user, role-aware model:
 * each instance acts as one user (identified by {@link email}) over a shared
 * backing store, so a test can hand two instances the same backing and watch an
 * invite flow — and the role gates — from both sides. The gates mirror the
 * server (RLS + RPCs): a viewer's save is refused, only owner/editor can invite,
 * only an owner can remove members or delete a list.
 */
export class MemoryShareStore implements ShareStore {
  static backing(): MemoryBacking {
    return {
      lists: new Map(),
      members: new Map(),
      invites: new Map(),
      listeners: new Map(),
      seq: 0,
    };
  }

  constructor(
    public email: string,
    private readonly db: MemoryBacking = MemoryShareStore.backing(),
  ) {}

  available(): boolean {
    return true;
  }

  private key(): string {
    return this.email.toLowerCase();
  }

  /** The caller's role on a list, or undefined if they're not a member. */
  private roleOn(id: string): Role | undefined {
    return this.db.members.get(id)?.get(this.key());
  }

  async mine(): Promise<SharedList[]> {
    return [...this.db.lists.values()]
      .map((l) => ({ list: l, role: this.roleOn(l.id) }))
      .filter((x): x is { list: SharedList; role: Role } => x.role !== undefined)
      .map(({ list, role }) => ({ ...list, role }));
  }

  async get(id: string): Promise<SharedList | null> {
    const l = this.db.lists.get(id);
    if (!l) return null;
    const role = this.roleOn(id);
    return role ? { ...l, role } : { ...l };
  }

  async create(name: string, content: string): Promise<string> {
    const id = `mem-${++this.db.seq}`;
    this.db.lists.set(id, { id, name, content });
    this.db.members.set(id, new Map([[this.key(), "owner"]]));
    return id;
  }

  async save(id: string, content: string): Promise<void> {
    const role = this.roleOn(id);
    if (role === "viewer") throw new Error(`permission denied: read-only`);
    if (role === undefined) throw new Error("not a member of this list");
    const l = this.db.lists.get(id);
    if (l) l.content = content;
    for (const fn of this.db.listeners.get(id) ?? []) fn(content);
  }

  async invite(id: string, email: string, role: InviteRole = "editor"): Promise<void> {
    const mine = this.roleOn(id);
    if (mine !== "owner" && mine !== "editor") {
      throw new Error("not allowed to invite to this list");
    }
    if (role !== "editor" && role !== "viewer") throw new Error(`invalid role: ${role}`);
    const set = this.db.invites.get(id) ?? new Map<string, InviteRole>();
    set.set(email.toLowerCase(), role);
    this.db.invites.set(id, set);
  }

  async members(id: string): Promise<Member[]> {
    if (this.roleOn(id) === undefined) throw new Error("not a member of this list");
    const out: Member[] = [];
    for (const [email, role] of this.db.members.get(id) ?? []) {
      out.push({ email, role, status: "member" });
    }
    for (const [email, role] of this.db.invites.get(id) ?? []) {
      out.push({ email, role, status: "invited" });
    }
    return out;
  }

  async removeMember(id: string, email: string): Promise<void> {
    if (this.roleOn(id) !== "owner") throw new Error("only the owner can remove members");
    const target = email.toLowerCase();
    this.db.invites.get(id)?.delete(target);
    const members = this.db.members.get(id);
    if (members && target !== this.key() && members.get(target) !== "owner") {
      members.delete(target);
    }
  }

  async deleteList(id: string): Promise<void> {
    if (this.roleOn(id) !== "owner") throw new Error("only the owner can delete this list");
    this.db.lists.delete(id);
    this.db.members.delete(id);
    this.db.invites.delete(id);
    this.db.listeners.delete(id);
  }

  async leave(id: string): Promise<void> {
    const members = this.db.members.get(id);
    if (!members) return;
    const others = [...members].filter(([e]) => e !== this.key());
    if (
      members.get(this.key()) === "owner" &&
      others.length > 0 &&
      !others.some(([, r]) => r === "owner")
    ) {
      throw new Error("you are the only owner — remove the other members or delete the list first");
    }
    members.delete(this.key());
  }

  async claim(): Promise<number> {
    let claimed = 0;
    for (const [id, emails] of this.db.invites) {
      const role = emails.get(this.key());
      if (role) {
        const members = this.db.members.get(id) ?? new Map<string, Role>();
        if (!members.has(this.key())) {
          members.set(this.key(), role);
          this.db.members.set(id, members);
        }
        emails.delete(this.key());
        claimed++;
      }
    }
    return claimed;
  }

  subscribe(id: string, onChange: (content: string) => void): () => void {
    const set = this.db.listeners.get(id) ?? new Set();
    set.add(onChange);
    this.db.listeners.set(id, set);
    return () => set.delete(onChange);
  }
}

interface MemoryBacking {
  lists: Map<string, SharedList>;
  /** list id → (member email → role). */
  members: Map<string, Map<string, Role>>;
  /** list id → (invited email → role). */
  invites: Map<string, Map<string, InviteRole>>;
  /** Live-sync listeners per list id, notified on save (shared across users). */
  listeners: Map<string, Set<(content: string) => void>>;
  seq: number;
}
