// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyTheme, themeNames, THEMES } from "./themes.js";

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
