import { LESSONS, type Lesson } from "./lessons.js";

export interface SubmitResult {
  correct: boolean;
  /** Shown on success — what the command does. */
  explain?: string;
  /** Shown on failure — a canonical answer. */
  solution?: string;
  /** True once the final lesson has been cleared. */
  complete: boolean;
}

/**
 * The course progression, with no DOM — advance through lessons by submitting
 * answers. Pure and injectable (pass your own lessons in tests), so the whole
 * flow is unit-testable independently of the screen app that renders it.
 */
export class TutorSession {
  private index = 0;

  constructor(private readonly lessons: Lesson[] = LESSONS) {}

  current(): Lesson | null {
    return this.lessons[this.index] ?? null;
  }

  position(): { n: number; total: number } {
    return { n: Math.min(this.index + 1, this.lessons.length), total: this.lessons.length };
  }

  isComplete(): boolean {
    return this.index >= this.lessons.length;
  }

  submit(input: string): SubmitResult {
    const lesson = this.current();
    if (!lesson) return { correct: false, complete: true };
    if (!lesson.accepts(input)) {
      return { correct: false, solution: lesson.solution, complete: false };
    }
    this.index++;
    return { correct: true, explain: lesson.explain, complete: this.isComplete() };
  }
}
