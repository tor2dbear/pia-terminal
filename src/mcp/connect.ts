/**
 * The MCP connector's OAuth authorize screen — rendered by the PIA app itself.
 *
 * Why here and not on the Edge Function: Supabase forces `text/plain` +
 * `nosniff` on any HTML a function returns (anti-phishing), so a form can't be
 * rendered from the connector's own domain. The app (served real HTML by
 * Cloudflare) is also the more on-brand home — the terminal handles connect, no
 * foreign login page. The connector's `/authorize` GET redirects here with the
 * OAuth query params; this form POSTs the user's minted token straight back to
 * the connector's `/authorize` POST, which issues the code and redirects to the
 * client. The terminal stays the source of truth (you paste a `mcp token`).
 */

/** True when the current URL carries an OAuth authorization request (the app was
 * reached via the connector's authorize redirect), so we show connect not boot. */
export function isConnectRequest(search: string = location.search): boolean {
  const p = new URLSearchParams(search);
  return p.get("response_type") === "code" && p.has("client_id") && p.has("code_challenge");
}

/** True when the app was sent back from `/authorize` with an issued code to hand
 * to the client. The final hop to the client's callback is done here, by the app,
 * because a form-submission redirect chain is constrained by `form-action` (which
 * can't allowlist arbitrary client callbacks) but a script navigation is not. */
export function isConnectCallback(search: string = location.search): boolean {
  const p = new URLSearchParams(search);
  return p.has("mcp_redirect") && p.has("code");
}

/** Hand the authorization code to the client by navigating to its callback.
 * Uses `location.replace` (script navigation — not governed by `form-action`).
 * Only http(s) targets are allowed, so a crafted param can't run `javascript:`. */
export function finishConnect(
  search: string = location.search,
  navigate: (url: string) => void = (url) => location.replace(url),
): void {
  const p = new URLSearchParams(search);
  try {
    const target = new URL(p.get("mcp_redirect") ?? "");
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("bad scheme");
    target.searchParams.set("code", p.get("code") ?? "");
    const state = p.get("state");
    if (state) target.searchParams.set("state", state);
    navigate(target.toString());
  } catch {
    document.body.textContent = "Invalid connect callback.";
  }
}

const STYLE = `
.mcp-connect { max-width: 34rem; margin: 0 auto; padding: 2rem 1.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #c9d1d9; line-height: 1.55; }
.mcp-connect .prompt { color: #7ee787; margin: 0 0 1.25rem; }
.mcp-connect .prompt b { color: #c9d1d9; font-weight: 600; }
.mcp-connect code { color: #79c0ff; }
.mcp-connect .dim { color: #8b949e; font-size: .92rem; }
.mcp-connect .err { color: #ff7b72; }
.mcp-connect input[type=password] { width: 100%; box-sizing: border-box; background: #010409;
  border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-family: inherit; font-size: 1rem;
  padding: .65rem .75rem; margin: 1rem 0; }
.mcp-connect input[type=password]:focus { outline: none; border-color: #2f81f7; }
.mcp-connect button { background: #238636; color: #fff; border: 0; border-radius: 6px; font-family: inherit;
  font-size: 1rem; padding: .6rem 1.4rem; cursor: pointer; }
.mcp-connect button:hover { background: #2ea043; }
`;

/** Render the connect form into `root`, posting to the connector's `/authorize`.
 * Values from the query string are set as element properties (never innerHTML),
 * so a crafted `state`/`redirect_uri` can't inject markup. */
export function renderConnect(
  root: HTMLElement,
  authorizePostUrl: string,
  search: string = location.search,
): void {
  const p = new URLSearchParams(search);
  root.textContent = "";

  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  const box = document.createElement("div");
  box.className = "mcp-connect";

  const prompt = document.createElement("p");
  prompt.className = "prompt";
  prompt.append("user@pia:~$ ");
  const b = document.createElement("b");
  b.textContent = "mcp connect";
  prompt.append(b);
  box.append(prompt);

  const intro = document.createElement("p");
  intro.append("An AI client wants to connect to your PIA as an MCP connector. It will be able to read your home and write under ");
  const inbox = document.createElement("code");
  inbox.textContent = "~/inbox/";
  intro.append(inbox, ".");
  box.append(intro);

  const help = document.createElement("p");
  help.className = "dim";
  const cmd = document.createElement("code");
  cmd.textContent = "mcp token <name>";
  help.append("Paste a token you minted in the terminal with ", cmd,
    ". It's held briefly (up to 10 minutes) only to complete the connection, then discarded.");
  box.append(help);

  const error = p.get("mcp_error");
  if (error) {
    const e = document.createElement("p");
    e.className = "err";
    e.textContent = error;
    box.append(e);
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = authorizePostUrl;
  for (const key of ["client_id", "redirect_uri", "code_challenge", "state"]) {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = key;
    hidden.value = p.get(key) ?? "";
    form.append(hidden);
  }
  const token = document.createElement("input");
  token.type = "password";
  token.name = "token";
  token.placeholder = "pia_...";
  token.autocomplete = "off";
  token.autocapitalize = "off";
  token.spellcheck = false;
  token.autofocus = true;
  form.append(token);

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Connect";
  form.append(button);

  box.append(form);
  root.append(box);
}
