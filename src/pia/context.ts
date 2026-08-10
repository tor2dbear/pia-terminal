import type { CommandContext, CoreCommandContext } from "../commands/registry.js";
import type { AuthAdapter } from "../auth/adapter.js";
import type { ShareStore } from "../share/store.js";
import type { HandleStore } from "../share/handleStore.js";
import type { PublicPagesStore } from "../share/publicPages.js";
import type { ReminderStore } from "./reminders.js";
import type { TokenStore } from "../mcp/tokens.js";
import type { TabControl } from "../terminal/tabcontrol.js";

/**
 * PIA's half of the command seam, in one place. Given the app's auth backend and
 * (optional) share store, return the `extendContext` that turns the engine's
 * {@link CoreCommandContext} into PIA's {@link CommandContext} — adding the auth
 * backend, the share store, and the app URL used for share links.
 *
 * The engine builds the core (filesystem, I/O, config, file bridges); this adds
 * the three PIA-specific fields. `main.ts` and the tests both wire the context
 * through here, so production and tests agree on the seam.
 */
export function piaExtendContext(
  auth: AuthAdapter,
  share?: ShareStore,
  baseUrl: string = `${location.origin}${location.pathname}`,
  reminders?: ReminderStore,
  tabs?: TabControl,
  tokens?: TokenStore,
  handles?: HandleStore,
  publicPages?: PublicPagesStore,
): (core: CoreCommandContext) => CommandContext {
  return (core) => ({
    ...core,
    auth,
    baseUrl,
    share,
    reminders,
    tokens,
    tabs,
    handles,
    publicPages,
  });
}
