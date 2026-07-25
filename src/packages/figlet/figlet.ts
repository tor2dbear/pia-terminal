/**
 * A tiny FIGlet: render text as a 5-row ASCII banner. A compact block font
 * (uppercase A–Z, 0–9, space and a little punctuation) authored inline — no
 * external font file, so it's a self-contained, CSP-safe package. Lowercase maps
 * to uppercase; unknown glyphs render as a blank space.
 */

// Each glyph is 5 rows. Rows may be ragged; `render` pads each glyph to its own
// widest row so columns line up, then joins glyphs with a one-column gap.
const FONT: Record<string, string[]> = {
  A: [" ## ", "#  #", "####", "#  #", "#  #"],
  B: ["### ", "#  #", "### ", "#  #", "### "],
  C: [" ###", "#   ", "#   ", "#   ", " ###"],
  D: ["### ", "#  #", "#  #", "#  #", "### "],
  E: ["####", "#   ", "### ", "#   ", "####"],
  F: ["####", "#   ", "### ", "#   ", "#   "],
  G: [" ###", "#   ", "# ##", "#  #", " ###"],
  H: ["#  #", "#  #", "####", "#  #", "#  #"],
  I: ["###", " # ", " # ", " # ", "###"],
  J: ["  ##", "   #", "   #", "#  #", " ## "],
  K: ["#  #", "# # ", "##  ", "# # ", "#  #"],
  L: ["#   ", "#   ", "#   ", "#   ", "####"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  N: ["#  #", "## #", "# ##", "#  #", "#  #"],
  O: [" ## ", "#  #", "#  #", "#  #", " ## "],
  P: ["### ", "#  #", "### ", "#   ", "#   "],
  Q: [" ## ", "#  #", "#  #", "# # ", " # #"],
  R: ["### ", "#  #", "### ", "# # ", "#  #"],
  S: [" ###", "#   ", " ## ", "   #", "### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#  #", "#  #", "#  #", "#  #", " ## "],
  V: ["#   #", "#   #", " # # ", " # # ", "  #  "],
  W: ["#   #", "#   #", "# # #", "## ##", "#   #"],
  X: ["#   #", " # # ", "  #  ", " # # ", "#   #"],
  Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
  Z: ["####", "  # ", " #  ", "#   ", "####"],
  "0": [" ## ", "#  #", "# ##", "## #", " ## "],
  "1": [" # ", "## ", " # ", " # ", "###"],
  "2": [" ## ", "#  #", "  # ", " #  ", "####"],
  "3": ["### ", "   #", " ## ", "   #", "### "],
  "4": ["#  #", "#  #", "####", "   #", "   #"],
  "5": ["####", "#   ", "### ", "   #", "### "],
  "6": [" ###", "#   ", "### ", "#  #", " ## "],
  "7": ["####", "   #", "  # ", " #  ", " #  "],
  "8": [" ## ", "#  #", " ## ", "#  #", " ## "],
  "9": [" ## ", "#  #", " ###", "   #", "### "],
  "!": ["#", "#", "#", " ", "#"],
  "?": ["### ", "   #", " ## ", "    ", " #  "],
  ".": [" ", " ", " ", " ", "#"],
  ",": [" ", " ", " ", "#", "#"],
  "-": ["   ", "   ", "###", "   ", "   "],
  ":": [" ", "#", " ", "#", " "],
  "+": ["   ", " # ", "###", " # ", "   "],
  "/": ["   #", "  # ", " #  ", "#   ", "#   "],
};

const HEIGHT = 5;
const SPACE_WIDTH = 3;

/** Pad each row of a glyph to its widest, so its columns are rectangular. */
function block(glyph: string[]): string[] {
  const w = Math.max(...glyph.map((r) => r.length));
  return glyph.map((r) => r.padEnd(w, " "));
}

/** Render `text` as an array of {@link HEIGHT} banner rows. */
export function figlet(text: string): string[] {
  const rows = Array.from({ length: HEIGHT }, () => "");
  const glyphs = [...text.toUpperCase()].map((ch) =>
    ch === " " ? Array.from({ length: HEIGHT }, () => " ".repeat(SPACE_WIDTH)) : FONT[ch],
  );
  let first = true;
  for (const glyph of glyphs) {
    if (!glyph) continue; // unknown char — skip
    const padded = block(glyph);
    for (let r = 0; r < HEIGHT; r++) rows[r] += (first ? "" : " ") + padded[r];
    first = false;
  }
  return rows;
}
