/**
 * A curated list of common five-letter words — both the answer pool and the
 * accepted-guess set (kept the same to keep the package small and self-contained;
 * no dictionary fetch, so it stays CSP-safe). Lowercase, deduped, all length 5.
 */
export const WORDS: string[] = [
  "about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult", "after", "again",
  "agent", "agree", "ahead", "alarm", "album", "alert", "alike", "alive", "allow", "alone",
  "along", "alter", "among", "anger", "angle", "angry", "apart", "apple", "apply", "arena",
  "argue", "arise", "array", "aside", "asset", "audio", "audit", "avoid", "award", "aware",
  "badly", "baker", "bases", "basic", "beach", "began", "begin", "being", "below", "bench",
  "birth", "black", "blame", "blank", "blast", "blind", "block", "blood", "board", "boost",
  "booth", "bound", "brain", "brand", "brave", "bread", "break", "breed", "brief", "bring",
  "broad", "broke", "brown", "build", "built", "buyer", "cabin", "cable", "carry", "catch",
  "cause", "chain", "chair", "chaos", "charm", "chart", "chase", "cheap", "check", "chest",
  "chief", "child", "china", "chose", "civil", "claim", "class", "clean", "clear", "click",
  "climb", "clock", "close", "cloud", "coach", "coast", "could", "count", "court", "cover",
  "craft", "crash", "crazy", "cream", "crime", "cross", "crowd", "crown", "curve", "cycle",
  "daily", "dance", "dealt", "death", "delay", "depth", "doing", "doubt", "dozen", "draft",
  "drama", "drank", "dream", "dress", "drink", "drive", "drove", "dying", "eager", "early",
  "earth", "eight", "elite", "empty", "enemy", "enjoy", "enter", "entry", "equal", "error",
  "event", "every", "exact", "exist", "extra", "faith", "false", "fault", "fiber", "field",
  "fifth", "fifty", "fight", "final", "first", "fixed", "flame", "flash", "fleet", "floor",
  "focus", "force", "forth", "forty", "forum", "found", "frame", "frank", "fraud", "fresh",
  "front", "fruit", "fully", "funny", "ghost", "giant", "given", "glass", "globe", "glory",
  "grace", "grade", "grain", "grand", "grant", "grass", "great", "green", "gross", "group",
  "grown", "guard", "guess", "guest", "guide", "happy", "harsh", "heart", "heavy", "hence",
  "horse", "hotel", "house", "human", "ideal", "image", "index", "inner", "input", "issue",
  "japan", "joint", "judge", "known", "label", "large", "laser", "later", "laugh", "layer",
  "learn", "lease", "least", "leave", "legal", "level", "light", "limit", "linen", "links",
  "lives", "local", "logic", "loose", "lower", "lucky", "lunch", "lying", "magic", "major",
  "maker", "march", "match", "maybe", "mayor", "meant", "medal", "media", "metal", "meter",
  "might", "minor", "minus", "mixed", "model", "money", "month", "moral", "motor", "mount",
  "mouse", "mouth", "movie", "music", "needs", "nerve", "never", "newly", "night", "noise",
  "north", "noted", "novel", "nurse", "occur", "ocean", "offer", "often", "order", "other",
  "ought", "paint", "panel", "paper", "party", "peace", "phase", "phone", "photo", "piano",
  "piece", "pilot", "pitch", "place", "plain", "plane", "plant", "plate", "point", "pound",
  "power", "press", "price", "pride", "prime", "print", "prior", "prize", "proof", "proud",
  "prove", "queen", "quick", "quiet", "quite", "radio", "raise", "range", "rapid", "ratio",
  "reach", "ready", "realm", "rebel", "refer", "relax", "reply", "right", "rigid", "rival",
  "river", "robot", "rocky", "roman", "rough", "round", "route", "royal", "rural", "scale",
  "scene", "scope", "score", "sense", "serve", "seven", "shall", "shape", "share", "sharp",
  "sheet", "shelf", "shell", "shift", "shine", "shirt", "shock", "shoot", "short", "shown",
  "sight", "since", "sixth", "sixty", "sized", "skill", "sleep", "slide", "small", "smart",
  "smile", "smith", "smoke", "solid", "solve", "sorry", "sound", "south", "space", "spare",
  "speak", "speed", "spend", "spent", "split", "spoke", "sport", "staff", "stage", "stair",
  "stake", "stand", "start", "state", "steam", "steel", "stick", "still", "stock", "stone",
  "stood", "store", "storm", "story", "strip", "stuck", "study", "stuff", "style", "sugar",
  "suite", "super", "sweet", "table", "taken", "taste", "taxes", "teach", "teeth", "terry",
  "texas", "thank", "theft", "their", "theme", "there", "these", "thick", "thing", "think",
  "third", "those", "three", "threw", "throw", "tight", "times", "tired", "title", "today",
  "topic", "total", "touch", "tough", "tower", "track", "trade", "train", "treat", "trend",
  "trial", "tribe", "trick", "tried", "tries", "truck", "truly", "trust", "truth", "twice",
  "under", "undue", "union", "unity", "until", "upper", "upset", "urban", "usage", "usual",
  "valid", "value", "video", "virus", "visit", "vital", "voice", "waste", "watch", "water",
  "wheel", "where", "which", "while", "white", "whole", "whose", "woman", "world", "worry",
  "worse", "worst", "worth", "would", "wound", "write", "wrong", "wrote", "yield", "young",
  "youth",
  // Common openers/guesses people reach for first.
  "crane", "slate", "trace", "stare", "adieu", "roast", "irate", "saint", "canoe", "cameo",
  "alien", "atone", "least", "louse", "noise", "raise", "ranch", "reign", "renal", "ridge",
  "roman", "rouse", "salet", "scare", "share", "shard", "shore", "siren", "snare", "spade",
  "stain", "steak", "stone", "stray", "swore", "tease", "tenor", "toast", "trace", "trail",
];

/** True if `word` is an accepted five-letter guess. */
export function isWord(word: string): boolean {
  return WORDS.includes(word.toLowerCase());
}
