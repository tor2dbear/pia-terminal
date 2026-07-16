/**
 * A checklist that lives in the cloud and can be edited by more than one
 * logged-in user — the seam behind collaboration, mirroring how
 * `StorageAdapter` sits behind the filesystem. The terminal and the `todo`
 * command talk only to this interface; guests get {@link NullShareStore},
 * logged-in cloud users get the Supabase implementation, tests get
 * {@link MemoryShareStore}.
 */
export interface SharedList {
  id: string;
  name: string;
  content: string;
}

export interface ShareStore {
  /** Whether sharing exists at all (i.e. a cloud backend is wired up). */
  available(): boolean;
  /** Lists the current user is a member of. */
  mine(): Promise<SharedList[]>;
  /** Fetch one list's freshest content by id, or null if it's gone. */
  get(id: string): Promise<SharedList | null>;
  /** Create a shared list from a name + content; resolves to its id. */
  create(name: string, content: string): Promise<string>;
  /** Overwrite a shared list's content (last write wins). */
  save(id: string, content: string): Promise<void>;
  /** Invite someone (by email) to a list the caller is a member of. */
  invite(id: string, email: string): Promise<void>;
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
  async claim(): Promise<number> {
    return 0;
  }
}

/**
 * An in-memory ShareStore for tests. Simulates the multi-user model: each
 * instance acts as one user (identified by {@link email}) over a shared
 * backing store, so a test can hand two instances the same backing and watch
 * an invite flow from both sides.
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

  async mine(): Promise<SharedList[]> {
    return [...this.db.lists.values()]
      .filter((l) => this.db.members.get(l.id)?.has(this.email))
      .map((l) => ({ ...l }));
  }

  async get(id: string): Promise<SharedList | null> {
    const l = this.db.lists.get(id);
    return l ? { ...l } : null;
  }

  async create(name: string, content: string): Promise<string> {
    const id = `mem-${++this.db.seq}`;
    this.db.lists.set(id, { id, name, content });
    this.db.members.set(id, new Set([this.email]));
    return id;
  }

  async save(id: string, content: string): Promise<void> {
    const l = this.db.lists.get(id);
    if (l) l.content = content;
    for (const fn of this.db.listeners.get(id) ?? []) fn(content);
  }

  async invite(id: string, email: string): Promise<void> {
    const set = this.db.invites.get(id) ?? new Set<string>();
    set.add(email.toLowerCase());
    this.db.invites.set(id, set);
  }

  async claim(): Promise<number> {
    let claimed = 0;
    for (const [id, emails] of this.db.invites) {
      if (emails.has(this.email)) {
        const members = this.db.members.get(id) ?? new Set<string>();
        members.add(this.email);
        this.db.members.set(id, members);
        emails.delete(this.email);
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
  members: Map<string, Set<string>>;
  invites: Map<string, Set<string>>;
  /** Live-sync listeners per list id, notified on save (shared across users). */
  listeners: Map<string, Set<(content: string) => void>>;
  seq: number;
}
