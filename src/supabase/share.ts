import type { SupabaseLike } from "./client.js";
import type { ShareStore, SharedList } from "../share/store.js";

/** A shared-list row as it comes back from PostgREST. */
interface Row {
  id: string;
  name: string;
  content: string;
}

interface Result<T> {
  data: T;
  error: { message: string } | null;
}

/**
 * The slice of the Supabase client the share store needs — RPC calls plus a
 * couple of table reads/updates. Kept separate from {@link SupabaseLike} (which
 * is shaped for the `filesystems` table) and cast to at construction, the same
 * narrow-interface trick the other adapters use.
 */
interface RealtimeChannel {
  on(
    type: "postgres_changes",
    filter: Record<string, unknown>,
    cb: (payload: { new?: Partial<Row> }) => void,
  ): RealtimeChannel;
  subscribe(): RealtimeChannel;
}

interface ShareClient {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Result<unknown>>;
  from(table: string): {
    select(columns: string): PromiseLike<Result<Row[] | null>> & {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): PromiseLike<Result<Row | null>> };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<Result<unknown>>;
    };
  };
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): void;
}

const TABLE = "shared_lists";

/**
 * Cloud-backed shared checklists. Reads/updates of list content go straight
 * through PostgREST (RLS scopes them to the caller's memberships); membership
 * changes go through SECURITY DEFINER RPCs (`create_shared_list`,
 * `invite_to_list`, `claim_invites`) — see `supabase/shared_lists.sql`.
 */
export class SupabaseShareStore implements ShareStore {
  private readonly db: ShareClient;

  constructor(client: SupabaseLike) {
    this.db = client as unknown as ShareClient;
  }

  available(): boolean {
    return true;
  }

  async mine(): Promise<SharedList[]> {
    if (!(await this.uid())) return []; // guest in cloud mode — nothing shared
    const { data, error } = await this.db.from(TABLE).select("id,name,content");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, content: r.content }));
  }

  async get(id: string): Promise<SharedList | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select("id,name,content")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id, name: data.name, content: data.content } : null;
  }

  async create(name: string, content: string): Promise<string> {
    await this.requireAuth();
    const { data, error } = await this.db.rpc("create_shared_list", {
      p_name: name,
      p_content: content,
    });
    if (error) throw new Error(error.message);
    return String(data);
  }

  async save(id: string, content: string): Promise<void> {
    const { error } = await this.db.from(TABLE).update({ content }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async invite(id: string, email: string): Promise<void> {
    await this.requireAuth();
    const { error } = await this.db.rpc("invite_to_list", {
      p_list: id,
      p_email: email,
    });
    if (error) throw new Error(error.message);
  }

  async leave(id: string): Promise<void> {
    if (!(await this.uid())) return;
    const { error } = await this.db.rpc("leave_list", { p_list: id });
    if (error) throw new Error(error.message);
  }

  async claim(): Promise<number> {
    if (!(await this.uid())) return 0;
    const { data, error } = await this.db.rpc("claim_invites");
    if (error) throw new Error(error.message);
    return typeof data === "number" ? data : Number(data ?? 0);
  }

  subscribe(id: string, onChange: (content: string) => void): () => void {
    // Realtime "postgres_changes" respects RLS, so only fellow members of this
    // list receive its UPDATE events.
    const channel = this.db
      .channel(`shared_list:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: TABLE, filter: `id=eq.${id}` },
        (payload) => {
          const content = payload.new?.content;
          if (typeof content === "string") onChange(content);
        },
      )
      .subscribe();
    return () => this.db.removeChannel(channel);
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  private async requireAuth(): Promise<void> {
    if (!(await this.uid())) throw new Error("log in to share (run `login`)");
  }
}
