import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { runPython } from "./bridge.js";

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

const python: Command<CoreCommandContext> = {
  name: "python",
  help: "run Python via Pyodide (python file.py, or python -c 'code')",
  usage: "python <file.py> | python -c \"<code>\"",
  aliases: ["python3"],
  async run(args, ctx) {
    // Resolve a file argument against the VFS before touching the sandbox.
    const parsed = parsePythonArgs(args, (path) => {
      const node = ctx.vfs.getNode(ctx.vfs.resolve(ctx.cwd, path));
      return node && node.type === "file" ? node.content : null;
    });
    if ("usage" in parsed) {
      ctx.print("usage: python <file.py>  or  python -c \"<code>\"");
      return;
    }
    if ("error" in parsed) {
      ctx.error(parsed.error);
      return;
    }

    let announced = false;
    const res = await runPython(parsed.code, () => {
      announced = true;
      ctx.print("loading Python (first run downloads the runtime)…", "dim");
    });
    void announced;

    if (res.stdout) for (const line of res.stdout.replace(/\n$/, "").split("\n")) ctx.print(line);
    if (res.stderr) for (const line of res.stderr.replace(/\n$/, "").split("\n")) ctx.error(line);
    if (res.error) ctx.error(res.error);
    // A bare expression's value (REPL-style), when there was no other output.
    else if (res.result !== null && !res.stdout) ctx.print(res.result);
  },
};

export const pkg: Package = {
  name: "python",
  description: "run real Python in a sandbox (Pyodide/WASM)",
  commands: [python],
};
