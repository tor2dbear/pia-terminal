/*
 * The terminal-side bridge to the Python sandbox. Creates one hidden,
 * same-origin iframe (`/python-sandbox.html`) that runs Pyodide behind its own
 * relaxed CSP, and talks to it purely over postMessage. The iframe is created
 * lazily on the first `python` and then reused, so Pyodide only loads once.
 *
 * Reaching for `document`/`window` here is a deliberate web bridge — the same
 * accepted divergence as the file-picker/download hooks — because there is no
 * terminal equivalent for "run WASM in an isolated frame".
 */

export interface PythonResult {
  stdout: string;
  stderr: string;
  result: string | null;
  error: string | null;
}

interface SandboxWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

let frame: HTMLIFrameElement | null = null;
let ready: Promise<SandboxWindow> | null = null;
let seq = 0;

/** The URL of the sandbox page, resolved against the app's own document. */
function sandboxUrl(): string {
  return new URL("./python-sandbox.html", document.baseURI).href;
}

/** Create the hidden iframe once and resolve when it signals it's alive. */
function ensureFrame(): Promise<SandboxWindow> {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const f = document.createElement("iframe");
    f.title = "python sandbox";
    f.setAttribute("aria-hidden", "true");
    f.style.display = "none";
    f.src = sandboxUrl();

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== f.contentWindow) return;
      const data = event.data as { type?: string };
      if (data && data.type === "ready" && f.contentWindow) {
        window.removeEventListener("message", onMessage);
        resolve(f.contentWindow as unknown as SandboxWindow);
      }
    };
    window.addEventListener("message", onMessage);
    f.addEventListener("error", () => reject(new Error("failed to load the python sandbox")));

    document.body.appendChild(f);
    frame = f;
  });
  return ready;
}

/**
 * Run Python `code` in the sandbox, resolving with its captured output.
 * `onLoading` fires once if Pyodide has to initialise first (cold start).
 */
export function runPython(code: string, onLoading?: () => void): Promise<PythonResult> {
  return ensureFrame().then(
    (sandbox) =>
      new Promise<PythonResult>((resolve) => {
        const id = ++seq;
        const onMessage = (event: MessageEvent): void => {
          if (frame && event.source !== frame.contentWindow) return;
          const data = event.data as (PythonResult & { type?: string; id?: number }) | undefined;
          if (!data || data.id !== id) return;
          if (data.type === "loading") {
            onLoading?.();
            return;
          }
          if (data.type === "result") {
            window.removeEventListener("message", onMessage);
            resolve({
              stdout: data.stdout ?? "",
              stderr: data.stderr ?? "",
              result: data.result ?? null,
              error: data.error ?? null,
            });
          }
        };
        window.addEventListener("message", onMessage);
        sandbox.postMessage({ type: "run", id, code }, "*");
      }),
  );
}

/** Tear down the sandbox (used when switching accounts, or in tests). */
export function disposePython(): void {
  if (frame) frame.remove();
  frame = null;
  ready = null;
}
