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

  // Where Pyodide loads from. Self-hosted at the app's own origin (fetched into
  // /pyodide/ at build by scripts/fetch-pyodide.mjs), so there's no third-party
  // CDN at runtime and this page's CSP can stay locked to 'self'. Overridable
  // via `window.PIA_PYODIDE_BASE` (used by the verification harness).
  var BASE = window.PIA_PYODIDE_BASE || new URL("pyodide/", location.href).href;
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

  var WORKDIR = "/home/pyodide";

  function initPyodide() {
    return loadScript(BASE + "pyodide.js").then(function () {
      // `loadPyodide` is defined by the CDN script above.
      return self.loadPyodide({ indexURL: BASE }).then(function (pyodide) {
        // A private helper (in a throwaway namespace so it doesn't pollute the
        // user's REPL globals) that reports whether interactive input is a
        // complete statement, an incomplete block, or a syntax error.
        var checkNs = pyodide.runPython("dict()");
        pyodide.runPython(
          "import codeop\n" +
            "def check(s):\n" +
            "    try:\n" +
            "        return 'incomplete' if codeop.compile_command(s, '<repl>', 'single') is None else 'complete'\n" +
            "    except (SyntaxError, ValueError, OverflowError):\n" +
            "        return 'error'\n",
          { globals: checkNs },
        );
        pyodide._piaCheckNs = checkNs;
        return pyodide;
      });
    });
  }

  /** Write the terminal's files into Pyodide's FS; return them for diffing. */
  function syncIn(pyodide, files) {
    var before = {};
    if (!files) return before;
    for (var name in files) {
      if (!Object.prototype.hasOwnProperty.call(files, name)) continue;
      try {
        pyodide.FS.writeFile(WORKDIR + "/" + name, files[name]);
        before[name] = files[name];
      } catch (e) {
        /* ignore unwritable names */
      }
    }
    return before;
  }

  /** Read back the work dir; return only files that are new or changed (text). */
  function syncOut(pyodide, before) {
    var out = {};
    var entries;
    try {
      entries = pyodide.FS.readdir(WORKDIR);
    } catch (e) {
      return out;
    }
    for (var i = 0; i < entries.length; i++) {
      var name = entries[i];
      if (name === "." || name === "..") continue;
      var path = WORKDIR + "/" + name;
      try {
        var st = pyodide.FS.stat(path);
        if (pyodide.FS.isDir(st.mode)) continue;
        var content = pyodide.FS.readFile(path, { encoding: "utf8" });
        if (before[name] !== content) out[name] = content;
      } catch (e) {
        /* binary or unreadable — skip */
      }
    }
    return out;
  }

  function run(msg) {
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

      // REPL: bail out early if the input isn't a complete statement yet.
      if (msg.mode === "repl") {
        var status = "complete";
        try {
          pyodide._piaCheckNs.set("s", msg.code);
          status = pyodide.runPython("check(s)", { globals: pyodide._piaCheckNs });
        } catch (e) {
          status = "complete";
        }
        if (status === "incomplete") {
          return { stdout: "", stderr: "", result: null, error: null, incomplete: true, files: {} };
        }
      }

      var before = syncIn(pyodide, msg.files);
      // REPL runs in the persistent __main__ namespace (state carries across
      // lines); a script (`python file.py`) gets a fresh namespace each run.
      var globals = msg.mode === "repl" ? pyodide.globals : pyodide.runPython("dict()");

      return pyodide
        .runPythonAsync(msg.code, { globals: globals })
        .then(function (result) {
          return {
            stdout: stdout,
            stderr: stderr,
            result: result === undefined || result === null ? null : String(result),
            error: null,
            incomplete: false,
            files: syncOut(pyodide, before),
          };
        })
        .catch(function (err) {
          return {
            stdout: stdout,
            stderr: stderr,
            result: null,
            error: err && err.message ? String(err.message) : String(err),
            incomplete: false,
            files: syncOut(pyodide, before),
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
    run(msg).then(function (res) {
      reply({
        type: "result",
        id: msg.id,
        stdout: res.stdout,
        stderr: res.stderr,
        result: res.result,
        error: res.error,
        incomplete: res.incomplete,
        files: res.files,
      });
    });
  });

  // Announce readiness to receive messages (Pyodide itself still loads lazily).
  if (window.parent) window.parent.postMessage({ type: "ready" }, "*");
})();
