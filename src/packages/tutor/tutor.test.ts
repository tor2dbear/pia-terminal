import { describe, expect, it } from "vitest";
import { LESSONS, normalize, type Lesson } from "./lessons.js";
import { TutorSession } from "./session.js";

describe("normalize", () => {
  it("trims and collapses whitespace", () => {
    expect(normalize("  ls   -a  ")).toBe("ls -a");
  });
});

describe("lesson matchers", () => {
  it("accepts each lesson's own canonical solution", () => {
    for (const lesson of LESSONS) {
      expect(lesson.accepts(lesson.solution)).toBe(true);
    }
  });

  it("accepts flags on ls but not a different command", () => {
    const ls = LESSONS.find((l) => l.title === "ls") as Lesson;
    expect(ls.accepts("ls -a")).toBe(true);
    expect(ls.accepts("pwd")).toBe(false);
  });

  it("requires the right target on redirect and pipe", () => {
    const redirect = LESSONS.find((l) => l.title === "redirect") as Lesson;
    expect(redirect.accepts("echo hello > hi.txt")).toBe(true);
    expect(redirect.accepts("echo hello > other.txt")).toBe(false);

    const pipe = LESSONS.find((l) => l.title === "pipe") as Lesson;
    expect(pipe.accepts("cat hi.txt | wc -l")).toBe(true);
    expect(pipe.accepts("cat hi.txt")).toBe(false);
  });
});

describe("TutorSession", () => {
  it("advances only on a correct answer", () => {
    const s = new TutorSession();
    expect(s.position()).toEqual({ n: 1, total: LESSONS.length });

    const wrong = s.submit("nonsense");
    expect(wrong.correct).toBe(false);
    expect(wrong.solution).toBe(LESSONS[0].solution);
    expect(s.position().n).toBe(1); // didn't move

    const right = s.submit(LESSONS[0].solution);
    expect(right.correct).toBe(true);
    expect(right.explain).toBe(LESSONS[0].explain);
    expect(s.position().n).toBe(2);
  });

  it("completes after clearing every lesson", () => {
    const s = new TutorSession();
    let last;
    for (const lesson of LESSONS) last = s.submit(lesson.solution);
    expect(last?.complete).toBe(true);
    expect(s.isComplete()).toBe(true);
    expect(s.current()).toBeNull();
  });
});
