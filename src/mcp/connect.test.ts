// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { isConnectRequest, renderConnect } from "./connect.js";

describe("isConnectRequest", () => {
  it("recognises an OAuth authorization request", () => {
    expect(isConnectRequest("?response_type=code&client_id=abc&code_challenge=xyz")).toBe(true);
  });
  it("rejects anything without the full authorize signature", () => {
    expect(isConnectRequest("")).toBe(false);
    expect(isConnectRequest("?response_type=code&client_id=abc")).toBe(false); // no challenge
    expect(isConnectRequest("?client_id=abc&code_challenge=xyz")).toBe(false); // no response_type
    expect(isConnectRequest("?foo=bar")).toBe(false);
  });
});

describe("renderConnect", () => {
  let root: HTMLElement;
  const POST = "https://x.supabase.co/functions/v1/mcp/authorize";
  beforeEach(() => {
    root = document.createElement("div");
  });

  it("builds a form that POSTs the OAuth params + token to the authorize endpoint", () => {
    renderConnect(root, POST, "?response_type=code&client_id=cid1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&code_challenge=chal1&state=st1");
    const form = root.querySelector("form")!;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe(POST);
    const hidden = Object.fromEntries(
      [...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((i) => [i.name, i.value]),
    );
    expect(hidden.client_id).toBe("cid1");
    expect(hidden.redirect_uri).toBe("https://claude.ai/cb");
    expect(hidden.code_challenge).toBe("chal1");
    expect(hidden.state).toBe("st1");
    expect(form.querySelector("input[type=password]")?.getAttribute("name")).toBe("token");
    expect(root.querySelector("button")?.textContent).toBe("Connect");
  });

  it("shows a passed-through error", () => {
    renderConnect(root, POST, "?response_type=code&client_id=c&code_challenge=h&mcp_error=That%20token%20wasn%27t%20recognised");
    expect(root.querySelector(".err")?.textContent).toMatch(/wasn't recognised/);
  });

  it("treats query values as data, never markup (no injection)", () => {
    renderConnect(root, POST, "?response_type=code&client_id=c&code_challenge=h&state=%22%3E%3Cimg%20src%3Dx%3E");
    // The crafted state lands as an input value, not as an injected element.
    expect(root.querySelector("img")).toBeNull();
    const state = [...root.querySelectorAll<HTMLInputElement>("input[type=hidden]")].find((i) => i.name === "state");
    expect(state?.value).toBe('"><img src=x>');
  });
});
