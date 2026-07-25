// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Wordle, scoreGuess } from "./wordle.js";
import { WORDS } from "./words.js";

describe("word list", () => {
  it("is all lowercase five-letter words", () => {
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{5}$/);
  });
});

describe("scoreGuess", () => {
  it("marks an exact match all correct", () => {
    expect(scoreGuess("piano", "piano")).toEqual(Array(5).fill("correct"));
  });

  it("marks present letters in the wrong spot", () => {
    expect(scoreGuess("abcde", "edcba")).toEqual([
      "present", "present", "correct", "present", "present",
    ]);
  });

  it("handles duplicate letters with two-pass counting", () => {
    // answer brass, guess sassy: one s is correct, one s present, the extra absent.
    expect(scoreGuess("sassy", "brass")).toEqual([
      "present", "present", "absent", "correct", "absent",
    ]);
  });
});

describe("Wordle app", () => {
  const mount = (rng = () => 0) => {
    const root = document.createElement("div");
    let exited = false;
    const app = new Wordle(() => (exited = true), rng);
    app.mount(root);
    return { app, root, exited: () => exited };
  };

  it("draws the board and picks an answer from the list", () => {
    const { app, root } = mount();
    expect(root.querySelector(".wd-grid")).not.toBeNull();
    expect(WORDS).toContain(app.snapshot().answer);
  });

  it("records a valid guess and wins when it matches", () => {
    const { app } = mount(() => 0); // answer = WORDS[0] = "about"
    expect(app.snapshot().answer).toBe("about");
    app.onText("about");
    app.submit();
    const s = app.snapshot();
    expect(s.guesses).toEqual(["about"]);
    expect(s.won).toBe(true);
    expect(s.done).toBe(true);
  });

  it("rejects a non-word without consuming a turn", () => {
    const { app } = mount();
    app.onText("zzzzz");
    app.submit();
    expect(app.snapshot().guesses).toEqual([]);
  });

  it("exits on q once the game is over", () => {
    const { app, exited } = mount(() => 0);
    app.onText("about");
    app.submit(); // win
    app.onText("q");
    expect(exited()).toBe(true);
  });
});
