import { CommandRegistry } from "./registry.js";
import { fsCommands } from "./fs.js";
import { systemCommands } from "./system.js";
import { editCommands } from "./edit.js";
import { authCommands } from "./auth.js";
import { textCommands } from "./text.js";
import { gameCommands } from "./games.js";
import { shareCommands } from "./share.js";
import { publishCommands } from "./publish.js";
import { schedulingCommands } from "./cron.js";
import { todoCommands } from "./todo.js";
import { configCommands } from "./config.js";
import { glowCommands } from "./glow.js";
import { viewCommands } from "./view.js";
import { transferCommands } from "./transfer.js";
import { pagerCommands } from "./pager.js";

/** Build a registry with all commands registered. */
export function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const cmd of [
    ...systemCommands,
    ...fsCommands,
    ...editCommands,
    ...authCommands,
    ...textCommands,
    ...gameCommands,
    ...shareCommands,
    ...publishCommands,
    ...schedulingCommands,
    ...todoCommands,
    ...configCommands,
    ...glowCommands,
    ...viewCommands,
    ...transferCommands,
    ...pagerCommands,
  ]) {
    registry.register(cmd);
  }
  return registry;
}
