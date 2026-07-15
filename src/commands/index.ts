import { CommandRegistry } from "./registry.js";
import { fsCommands } from "./fs.js";
import { systemCommands } from "./system.js";
import { editCommands } from "./edit.js";
import { authCommands } from "./auth.js";
import { textCommands } from "./text.js";
import { gameCommands } from "./games.js";

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
  ]) {
    registry.register(cmd);
  }
  return registry;
}
