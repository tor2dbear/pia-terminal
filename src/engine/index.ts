/**
 * The reusable terminal engine — the "motor" of PIA, gathered behind one public
 * API. Everything re-exported here is app-agnostic (or an interface an app
 * implements). PIA's own commands, adapters, themes and config live *outside*
 * this door.
 *
 * A different app builds a shell by registering its own {@link Command}s on a
 * {@link CommandRegistry} and handing them to a {@link Terminal}. Everything
 * else is optional: with no filesystem, storage, auth or session the engine
 * supplies sensible defaults (see `examples/adventure/`).
 *
 * {@link Command} / {@link CommandRegistry} / {@link Terminal} are generic over
 * the command context. The default is PIA's own `CommandContext` (which lives
 * outside this door); a leaner shell uses {@link CoreCommandContext} (the engine
 * core) and, if it needs its own fields, supplies a `TerminalOptions.extendContext`
 * to add them.
 */

// ---- command model --------------------------------------------------------
export { CommandRegistry } from "../commands/registry.js";
export type { Command, CoreCommandContext, LineClass } from "../commands/registry.js";

// ---- command-line parsing -------------------------------------------------
export { tokenize, parsePipeline, parseSequence } from "../terminal/parse.js";
export type {
  Pipeline,
  Stage,
  Redirect,
  ParseResult,
  Connector,
  SequenceItem,
  SequenceResult,
} from "../terminal/parse.js";

// ---- filename globbing ----------------------------------------------------
export { expandArg, expandArgs, unescapeWild, WILD_STAR, WILD_QUES } from "../terminal/glob.js";
export type { GlobFs } from "../terminal/glob.js";

// ---- full-screen apps -----------------------------------------------------
export type { ScreenApp, ScreenAppFactory, KeySpec } from "../terminal/screen.js";

// ---- the DOM renderer -----------------------------------------------------
export { Terminal } from "../terminal/terminal.js";
export type { TerminalOptions, TerminalConfig } from "../terminal/terminal.js";

// ---- in-memory filesystem -------------------------------------------------
export { VFS, VfsError, HOME } from "../vfs/vfs.js";
export { isDir, isFile } from "../vfs/types.js";
export type { VNode, FileNode, DirNode } from "../vfs/types.js";

// ---- adapter seams (interfaces an app implements) -------------------------
export type { StorageAdapter } from "../storage/adapter.js";
export type { AuthAdapter, Session } from "../auth/adapter.js";
