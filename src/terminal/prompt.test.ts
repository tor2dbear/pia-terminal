import { describe, expect, it } from "vitest";
import { parsePromptSegments } from "./prompt.js";

const id = (s: string) => s;

describe("parsePromptSegments", () => {
  it("returns one plain segment when there's no markup", () => {
    expect(parsePromptSegments("{user}@pia:{cwd}$", id)).toEqual([
      { text: "{user}@pia:{cwd}$" },
    ]);
  });

  it("substitutes placeholders in each text run", () => {
    const segs = parsePromptSegments("%F{accent}{user}%f$", (t) =>
      t.replace("{user}", "guest"),
    );
    expect(segs).toEqual([
      { text: "guest", color: "var(--accent)" },
      { text: "$" },
    ]);
  });

  it("maps a token to a CSS var and passes hex through", () => {
    expect(parsePromptSegments("%F{dim}a%f", id)[0]).toEqual({
      text: "a",
      color: "var(--dim)",
    });
    expect(parsePromptSegments("%F{#ff8800}a%f", id)[0]).toEqual({
      text: "a",
      color: "#ff8800",
    });
  });

  it("handles bold, a literal percent, and an unclosed colour", () => {
    expect(parsePromptSegments("%Bx%b", id)).toEqual([{ text: "x", bold: true }]);
    expect(parsePromptSegments("100%%", id)).toEqual([{ text: "100%" }]);
    // No %f — the colour runs to the end.
    expect(parsePromptSegments("%F{accent}rest", id)).toEqual([
      { text: "rest", color: "var(--accent)" },
    ]);
  });

  it("ignores an invalid colour name (renders default)", () => {
    expect(parsePromptSegments("%F{no spaces!}a%f", id)).toEqual([{ text: "a" }]);
  });
});
