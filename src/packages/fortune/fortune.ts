/**
 * `fortune` — a random epigram. Quotes lean toward computing and the Unix
 * tradition, on-brand for a terminal. `pickFortune` takes an injectable rng so
 * the selection is testable; the command seeds it from the clock.
 */

export const FORTUNES: string[] = [
  "Programs must be written for people to read, and only incidentally for machines to execute.\n    — Harold Abelson",
  "There are only two hard things in Computer Science: cache invalidation and naming things.\n    — Phil Karlton",
  "Simplicity is prerequisite for reliability.\n    — Edsger W. Dijkstra",
  "Talk is cheap. Show me the code.\n    — Linus Torvalds",
  "First, solve the problem. Then, write the code.\n    — John Johnson",
  "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.\n    — Martin Fowler",
  "Weeks of coding can save you hours of planning.",
  "Deleted code is debugged code.\n    — Jeff Sickel",
  "The most disastrous thing that you can ever learn is your first programming language.\n    — Alan Kay",
  "A language that doesn't affect the way you think about programming is not worth knowing.\n    — Alan Perlis",
  "Controlling complexity is the essence of computer programming.\n    — Brian Kernighan",
  "Unix is user-friendly. It's just very selective about who its friends are.",
  "rm -rf / — measure twice, cut once.",
  "It works on my machine.",
  "Real programmers count from zero.",
];

/** Pick a fortune. `rng` returns a float in [0, 1); defaults to Math.random. */
export function pickFortune(rng: () => number = Math.random): string {
  const idx = Math.floor(rng() * FORTUNES.length) % FORTUNES.length;
  return FORTUNES[idx] ?? FORTUNES[0];
}
