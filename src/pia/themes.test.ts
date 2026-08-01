// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyTheme, applyAppearance, themeNames, THEMES } from "./themes.js";

describe("applyTheme", () => {
  it("sets the palette custom properties on the root element", () => {
    const root = document.createElement("div");
    applyTheme("amber", root);
    expect(root.style.getPropertyValue("--bg")).toBe(THEMES.amber.bg);
    expect(root.style.getPropertyValue("--accent")).toBe(THEMES.amber.accent);
  });

  it("falls back to phosphor for an unknown theme", () => {
    const root = document.createElement("div");
    applyTheme("chartreuse", root);
    expect(root.style.getPropertyValue("--accent")).toBe(THEMES.phosphor.accent);
  });

  it("lists all themes sorted", () => {
    expect(themeNames()).toEqual(["amber", "ice", "mono", "phosphor"]);
  });
});

describe("applyAppearance", () => {
  it("layers colour overrides, font and margin onto the root", () => {
    const root = document.createElement("div");
    applyAppearance({ accent: "#ff8800" }, '"Berkeley Mono", monospace', 15, 24, root);
    expect(root.style.getPropertyValue("--accent")).toBe("#ff8800");
    expect(root.style.getPropertyValue("--font")).toBe('"Berkeley Mono", monospace');
    expect(root.style.getPropertyValue("--font-size")).toBe("15px");
    expect(root.style.getPropertyValue("--pad")).toBe("24px");
  });

  it("clears font/size/margin when not set, so the stylesheet default returns", () => {
    const root = document.createElement("div");
    root.style.setProperty("--font", "old");
    root.style.setProperty("--font-size", "20px");
    root.style.setProperty("--pad", "30px");
    applyAppearance({}, undefined, undefined, undefined, root);
    expect(root.style.getPropertyValue("--font")).toBe("");
    expect(root.style.getPropertyValue("--font-size")).toBe("");
    expect(root.style.getPropertyValue("--pad")).toBe("");
  });

  it("keeps a zero margin (flush to the safe-area), not treating it as unset", () => {
    const root = document.createElement("div");
    applyAppearance({}, undefined, undefined, 0, root);
    expect(root.style.getPropertyValue("--pad")).toBe("0px");
  });
});
