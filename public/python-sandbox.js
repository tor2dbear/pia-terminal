/*
 * PIA python sandbox — runs inside the isolated /python-sandbox.html iframe.
 *
 * Loads Pyodide (real CPython on WASM) lazily on the first run, executes code
 * sent by the terminal via postMessage, and replies with captured stdout,
 * stderr, an optional repr of the last expression, and any error. The main app
 * never loads Pyodide or relaxes its CSP — all of that lives here, behind the
 * iframe boundary.
 *
 * Protocol (postMessage):
 *   parent → sandbox : { type: "run", id, code }
 *   sandbox → parent : { type: "ready" }                       (on load)
 *                      { type: "loading", id }                 (first run only)
 *                      { type: "result", id, stdout, stderr, result, error }
 */
(function () {
  "use strict";

  var PYODIDE_VERSION = "0.26.2";
  // Where Pyodide loads from. Defaults to the jsdelivr CDN (allowed by this
  // page's CSP); a host can self-host it and point `window.PIA_PYODIDE_BASE` at
  // a same-origin path instead (see roadmap/python-wasm.md).
  var BASE =
    window.PIA_PYODIDE_BASE ||
    "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";
  var pyodidePromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function initPyodide() {
    return loadScript(BASE + "pyodide.js").then(function () {
      // `loadPyodide` is defined by the CDN script above.
      return self.loadPyodide({ indexURL: BASE });
    });
  }

  function run(code) {
    if (!pyodidePromise) pyodidePromise = initPyodide();
    return pyodidePromise.then(function (pyodide) {
      var stdout = "";
      var stderr = "";
      // `batched` is called once per line, with the trailing newline stripped —
      // re-add it so multi-line output keeps its breaks.
      pyodide.setStdout({
        batched: function (s) {
          stdout += s + "\n";
        },
      });
      pyodide.setStderr({
        batched: function (s) {
          stderr += s + "\n";
        },
      });
      return pyodide
        .runPythonAsync(code)
        .then(function (result) {
          return {
            stdout: stdout,
            stderr: stderr,
            result: result === undefined || result === null ? null : String(result),
            error: null,
          };
        })
        .catch(function (err) {
          return {
            stdout: stdout,
            stderr: stderr,
            result: null,
            error: err && err.message ? String(err.message) : String(err),
          };
        });
    });
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.type !== "run" || typeof msg.code !== "string") return;
    var reply = function (payload) {
      // Reply to whoever sent the request (the terminal's window).
      if (event.source) event.source.postMessage(payload, "*");
    };
    // Tell the terminal we're initialising, so it can show a hint on cold start.
    if (!pyodidePromise) reply({ type: "loading", id: msg.id });
    run(msg.code).then(function (res) {
      reply({
        type: "result",
        id: msg.id,
        stdout: res.stdout,
        stderr: res.stderr,
        result: res.result,
        error: res.error,
      });
    });
  });

  // Announce readiness to receive messages (Pyodide itself still loads lazily).
  if (window.parent) window.parent.postMessage({ type: "ready" }, "*");
})();
