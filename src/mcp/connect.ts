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

/** Render the connect prompt into `root`, posting to the connector's `/authorize`.
 * Modelled on a shell password read: `token:` then the value typed inline (masked
 * dots + a blinking block cursor), Enter to submit — no boxed input, no button.
 * Styling lives in the bundled `src/style.css` (`.mcp-connect …`), not a runtime
 * `<style>`: the app's CSP is `style-src 'self'`, which would drop an injected
 * inline stylesheet and leave a default password box + button.
 * Query values are set as element properties (never innerHTML), so a crafted
 * `state`/`redirect_uri` can't inject markup. */
export function renderConnect(
  root: HTMLElement,
  authorizePostUrl: string,
  search: string = location.search,
): void {
  const p = new URLSearchParams(search);
  root.textContent = "";

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
    ", then press Enter. It's held briefly (up to 10 minutes) only to complete the connection, then discarded.");
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

  // The readline: label, then a field where a transparent password input (which
  // captures paste/typing) overlays a mask that renders the dots + block cursor.
  const readline = document.createElement("div");
  readline.className = "readline";
  readline.append("token: ");

  const field = document.createElement("span");
  field.className = "field";
  const mask = document.createElement("span");
  mask.className = "mask";
  const dots = document.createElement("span");
  dots.className = "dots";
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  cursor.textContent = "█";
  mask.append(dots, cursor);

  const token = document.createElement("input");
  token.type = "password";
  token.name = "token";
  token.className = "real";
  token.autocomplete = "off";
  token.autocapitalize = "off";
  token.spellcheck = false;
  token.autofocus = true;
  token.setAttribute("enterkeyhint", "go");
  token.setAttribute("aria-label", "token");
  token.addEventListener("input", () => {
    dots.textContent = "•".repeat(token.value.length);
  });
  field.append(mask, token);
  readline.append(field);
  form.append(readline);

  // Enter submits; this button is the mechanism, kept off-screen so there's no
  // visible button (a lone text field would submit on Enter anyway, but an
  // explicit submit control makes it reliable across browsers).
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "offscreen";
  submit.textContent = "Connect";
  form.append(submit);

  box.append(form);
  root.append(box);
  token.focus();
}
