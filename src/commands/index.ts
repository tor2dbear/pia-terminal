import { CommandRegistry } from "./registry.js";
import { fsCommands } from "./fs.js";
import { systemCommands } from "./system.js";

/** Build a registry with all Level 0 commands registered. */
export function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const cmd of [...systemCommands, ...fsCommands]) {
    registry.register(cmd);
  }
  return registry;
}
