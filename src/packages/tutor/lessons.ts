/**
 * The `tutor` curriculum: a guided tour of real shell syntax. Each lesson gives
 * an instruction and checks that the learner typed a command of the right
 * *form* — it teaches the muscle memory (command names, flags, redirects) that
 * transfers straight to a real terminal, without needing to actually mutate a
 * filesystem. The matcher is pure so the whole course is unit-testable.
 */

export interface Lesson {
  /** Short label for the progress line. */
  title: string;
  /** What the learner should do. */
  instruction: string;
  /** A canonical command that satisfies the lesson (shown as the hint). */
  solution: string;
  /** True when `input` is an acceptable answer. */
  accepts(input: string): boolean;
  /** One line on what the command does, shown after a correct answer. */
  explain: string;
}

/** Normalise a typed line: trim ends and collapse runs of whitespace. */
export function normalize(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export const LESSONS: Lesson[] = [
  {
    title: "pwd",
    instruction: "Where are you in the filesystem? Print the working directory.",
    solution: "pwd",
    accepts: (i) => normalize(i) === "pwd",
    explain: "`pwd` = print working directory — the folder you're standing in.",
  },
  {
    title: "ls",
    instruction: "List the files and folders here.",
    solution: "ls",
    accepts: (i) => /^ls\b/.test(normalize(i)),
    explain: "`ls` lists a directory's contents. Try `ls -a` to include dotfiles.",
  },
  {
    title: "mkdir",
    instruction: "Make a new directory called `projects`.",
    solution: "mkdir projects",
    accepts: (i) => normalize(i) === "mkdir projects",
    explain: "`mkdir` makes a directory. The argument is its name.",
  },
  {
    title: "cd",
    instruction: "Change into the `projects` directory you just made.",
    solution: "cd projects",
    accepts: (i) => normalize(i) === "cd projects",
    explain: "`cd` changes directory. `cd ..` goes up; `cd` alone goes home.",
  },
  {
    title: "redirect",
    instruction: 'Write the text `hello` into a file called `hi.txt`.',
    solution: "echo hello > hi.txt",
    accepts: (i) => /^echo\s+.+>\s*hi\.txt$/.test(normalize(i)),
    explain: "`>` redirects a command's output into a file (overwriting it).",
  },
  {
    title: "cat",
    instruction: "Show the contents of `hi.txt`.",
    solution: "cat hi.txt",
    accepts: (i) => normalize(i) === "cat hi.txt",
    explain: "`cat` prints a file. It also con-cat-enates several together.",
  },
  {
    title: "pipe",
    instruction: "Count the lines in `hi.txt` by piping `cat` into `wc -l`.",
    solution: "cat hi.txt | wc -l",
    accepts: (i) => /^cat\s+hi\.txt\s*\|\s*wc\s+-l$/.test(normalize(i)),
    explain: "`|` pipes one command's output into the next — the Unix superpower.",
  },
  {
    title: "help",
    instruction: "Finally: list every command PIA knows.",
    solution: "help",
    accepts: (i) => normalize(i) === "help",
    explain: "`help` lists all commands; `help <name>` explains one.",
  },
];
