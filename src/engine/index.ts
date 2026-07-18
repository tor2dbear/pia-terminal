/**
 * The reusable terminal engine — the "motor" of PIA, gathered behind one public
 * API. Everything re-exported here is app-agnostic (or an interface an app
 * implements). PIA's own commands, adapters, themes and config live *outside*
 * this door.
 *
 * A different app builds a shell by: implementing the adapter interfaces,
 * registering its own {@link Command}s on a {@link CommandRegistry}, and
 * handing them to a {@link Terminal}.
 *
 * NOTE: {@link Command} / the command context are not yet fully generic over an
 * app's own context extensions — that genericization is the next refinement,
 * and it's what a genuinely different second shell needs. This index defines
 * the intended surface; the internals are still being tidied behind it.
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
