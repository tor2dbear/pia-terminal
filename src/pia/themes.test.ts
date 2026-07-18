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
  it("layers colour overrides and font onto the root", () => {
    const root = document.createElement("div");
    applyAppearance({ accent: "#ff8800" }, '"Berkeley Mono", monospace', 15, root);
    expect(root.style.getPropertyValue("--accent")).toBe("#ff8800");
    expect(root.style.getPropertyValue("--font")).toBe('"Berkeley Mono", monospace');
    expect(root.style.getPropertyValue("--font-size")).toBe("15px");
  });

  it("clears font/size when not set, so the stylesheet default returns", () => {
    const root = document.createElement("div");
    root.style.setProperty("--font", "old");
    root.style.setProperty("--font-size", "20px");
    applyAppearance({}, undefined, undefined, root);
    expect(root.style.getPropertyValue("--font")).toBe("");
    expect(root.style.getPropertyValue("--font-size")).toBe("");
  });
});
