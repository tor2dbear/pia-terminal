import { CommandRegistry } from "./registry.js";
import { fsCommands } from "./fs.js";
import { systemCommands } from "./system.js";
import { editCommands } from "./edit.js";
import { authCommands } from "./auth.js";

/** Build a registry with all Level 0 commands registered. */
export function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const cmd of [
    ...systemCommands,
    ...fsCommands,
    ...editCommands,
    ...authCommands,
  ]) {
    registry.register(cmd);
  }
  return registry;
}
