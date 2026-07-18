import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { DirNode } from "../../vfs/types.js";
import type { Package } from "../types.js";
import { runPython, type PythonResult } from "./bridge.js";
import { PythonRepl } from "./repl.js";

export { PythonRepl };

/** Parse `python` arguments into the code to run (or an error/usage state). */
export function parsePythonArgs(
  args: string[],
  readFile: (path: string) => string | null,
): { code: string } | { error: string } | { usage: true } {
  if (args.length === 0) return { usage: true };
  if (args[0] === "-c") {
    const code = args.slice(1).join(" ");
    if (code === "") return { error: "python: -c: no code given" };
    return { code };
  }
  const path = args[0];
  const content = readFile(path);
  if (content === null) return { error: `python: can't open file '${path}'` };
  return { code: content };
}

/** The (flat) text files directly inside a directory node, name → content. */
export function collectDirFiles(dir: DirNode | null): Record<string, string> {
  const files: Record<string, string> = {};
  if (!dir) return files;
  for (const child of Object.values(dir.children)) {
    if (child.type === "file") files[child.name] = child.content;
  }
  return files;
}

const python: Command<CoreCommandContext> = {
  name: "python",
  help: "run Python via Pyodide (python, python file.py, or python -c 'code')",
  usage: "python | python <file.py> | python -c \"<code>\"",
  aliases: ["python3"],
  async run(args, ctx) {
    // Files in the working directory, mounted into Pyodide before each run and
    // synced back after, so Python can read your files and its writes show up
    // in `ls`.
    const cwdFiles = (): Record<string, string> => {
      const node = ctx.vfs.getNode(ctx.cwd);
      return collectDirFiles(node && node.type === "dir" ? node : null);
    };
    const writeBack = (files: Record<string, string>): void => {
      const names = Object.keys(files);
      if (names.length === 0) return;
      for (const name of names) ctx.vfs.writeFile(ctx.vfs.resolve(ctx.cwd, name), files[name]);
      void ctx.persist();
    };

    // No arguments → interactive REPL.
    if (args.length === 0) {
      await ctx.runApp(
        (exit) =>
          new PythonRepl(exit, async (source, onLoading) => {
            const res = await runPython(source, { mode: "repl", files: cwdFiles(), onLoading });
            writeBack(res.files);
            return res;
          }),
      );
      return;
    }

    const parsed = parsePythonArgs(args, (path) => {
      const node = ctx.vfs.getNode(ctx.vfs.resolve(ctx.cwd, path));
      return node && node.type === "file" ? node.content : null;
    });
    if ("usage" in parsed) {
      ctx.print("usage: python  |  python <file.py>  |  python -c \"<code>\"");
      return;
    }
    if ("error" in parsed) {
      ctx.error(parsed.error);
      return;
    }

    const res: PythonResult = await runPython(parsed.code, {
      files: cwdFiles(),
      onLoading: () => ctx.print("loading Python (first run downloads the runtime)…", "dim"),
    });
    writeBack(res.files);

    if (res.stdout) for (const line of res.stdout.replace(/\n$/, "").split("\n")) ctx.print(line);
    if (res.stderr) for (const line of res.stderr.replace(/\n$/, "").split("\n")) ctx.error(line);
    if (res.error) ctx.error(res.error);
    else if (res.result !== null && !res.stdout) ctx.print(res.result);
  },
};

export const pkg: Package = {
  name: "python",
  description: "run real Python in a sandbox (Pyodide/WASM)",
  commands: [python],
};
