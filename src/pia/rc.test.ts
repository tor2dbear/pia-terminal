import { describe, expect, it } from "vitest";
import { parseConfig, setConfigValue, setAlias, removeAlias, DEFAULT_CONFIG } from "./rc.js";

describe("parseConfig", () => {
  it("reads theme, prompt and aliases, ignoring comments and blanks", () => {
    const cfg = parseConfig(
      [
        "# a comment",
        "",
        "theme = amber",
        "prompt = {user}$ ",
        "alias ll = ls -la",
        "alias g = grep -n",
        "# alias ignored = nope",
      ].join("\n"),
    );
    expect(cfg.theme).toBe("amber");
    expect(cfg.prompt).toBe("{user}$");
    expect(cfg.aliases).toEqual({ ll: "ls -la", g: "grep -n" });
  });

  it("is lenient about spacing around =", () => {
    expect(parseConfig("theme=ice").theme).toBe("ice");
    expect(parseConfig("alias x=echo hi").aliases.x).toBe("echo hi");
  });

  it("parses the seeded default", () => {
    const cfg = parseConfig(DEFAULT_CONFIG);
    expect(cfg.theme).toBe("phosphor");
    expect(cfg.prompt).toBe("{user}@pia:{cwd}$");
    expect(cfg.aliases.ll).toBe("ls -la");
  });
});

describe("setConfigValue", () => {
  it("replaces an existing key in place, keeping comments", () => {
    const out = setConfigValue("# hi\ntheme = phosphor\nprompt = x", "theme", "amber");
    expect(out).toBe("# hi\ntheme = amber\nprompt = x");
  });

  it("appends the key when absent", () => {
    expect(parseConfig(setConfigValue("prompt = x", "theme", "ice")).theme).toBe("ice");
  });

  it("appends before a trailing blank line", () => {
    const out = setConfigValue("prompt = x\n", "theme", "ice");
    expect(out).toBe("prompt = x\ntheme = ice\n");
  });
});

describe("setAlias / removeAlias", () => {
  it("adds, replaces, and removes an alias", () => {
    let text = "theme = amber\n";
    text = setAlias(text, "ll", "ls -la");
    expect(parseConfig(text).aliases.ll).toBe("ls -la");

    text = setAlias(text, "ll", "ls -a"); // replace
    expect(parseConfig(text).aliases.ll).toBe("ls -a");
    expect(text.match(/alias ll/g)?.length).toBe(1); // not duplicated

    text = removeAlias(text, "ll");
    expect(parseConfig(text).aliases.ll).toBeUndefined();
  });

  it("leaves text unchanged when removing a missing alias", () => {
    const text = "theme = amber";
    expect(removeAlias(text, "nope")).toBe(text);
  });
});

describe("parseConfig — colours, font, size", () => {
  it("reads color.* overrides and font settings", () => {
    const cfg = parseConfig(
      [
        "theme = amber",
        "color.accent = #ff8800",
        "color.bg = #001018",
        'font = "Berkeley Mono", monospace',
        "font-size = 15",
      ].join("\n"),
    );
    expect(cfg.colors.accent).toBe("#ff8800");
    expect(cfg.colors.bg).toBe("#001018");
    expect(cfg.font).toBe('"Berkeley Mono", monospace');
    expect(cfg.fontSize).toBe(15);
  });

  it("drops invalid values instead of applying them", () => {
    const cfg = parseConfig(
      [
        "color.accent = not-a-hex",
        "color.bogus = #ffffff", // unknown token
        "font = bad;value{",
        "font-size = 999", // out of range
      ].join("\n"),
    );
    expect(cfg.colors.accent).toBeUndefined();
    expect(cfg.colors).toEqual({});
    expect(cfg.font).toBeUndefined();
    expect(cfg.fontSize).toBeUndefined();
  });

  it("accepts 3-, 6- and 8-digit hex", () => {
    const cfg = parseConfig("color.fg = #abc\ncolor.dim = #aabbcc\ncolor.error = #aabbccdd");
    expect(cfg.colors.fg).toBe("#abc");
    expect(cfg.colors.dim).toBe("#aabbcc");
    expect(cfg.colors.error).toBe("#aabbccdd");
  });
});
