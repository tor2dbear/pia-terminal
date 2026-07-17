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
