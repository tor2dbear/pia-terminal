/**
 * A tiny arithmetic evaluator for `bc`. Recursive-descent over the usual
 * grammar — `+ - * / %`, `^` (right-associative power), unary minus, and
 * parentheses. Uses JS floating-point rather than bc's arbitrary precision:
 * this is a learning toy, not a numerics engine.
 */

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

const OPS = new Set(["+", "-", "*", "/", "%", "^", "(", ")"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (OPS.has(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) j++;
      const text = src.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new Error(`bad number: ${text}`);
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    throw new Error(`unexpected character: ${c}`);
  }
  return tokens;
}

/** Evaluate an arithmetic expression, throwing `Error` on any syntax problem. */
export function evalExpr(src: string): number {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const eat = (value: string): boolean => {
    const t = peek();
    if (t && t.kind === "op" && t.value === value) {
      pos++;
      return true;
    }
    return false;
  };

  // additive → multiplicative (('+'|'-') multiplicative)*
  function additive(): number {
    let left = multiplicative();
    for (;;) {
      if (eat("+")) left += multiplicative();
      else if (eat("-")) left -= multiplicative();
      else return left;
    }
  }

  // multiplicative → unary (('*'|'/'|'%') unary)*
  function multiplicative(): number {
    let left = unary();
    for (;;) {
      if (eat("*")) left *= unary();
      else if (eat("/")) {
        const r = unary();
        if (r === 0) throw new Error("divide by zero");
        left /= r;
      } else if (eat("%")) {
        const r = unary();
        if (r === 0) throw new Error("divide by zero");
        left %= r;
      } else return left;
    }
  }

  // unary → '-' unary | '+' unary | power
  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return power();
  }

  // power → primary ('^' unary)?   (right-associative)
  function power(): number {
    const base = primary();
    if (eat("^")) return Math.pow(base, unary());
    return base;
  }

  // primary → number | '(' additive ')'
  function primary(): number {
    const t = peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "num") {
      pos++;
      return t.value;
    }
    if (eat("(")) {
      const inner = additive();
      if (!eat(")")) throw new Error("missing closing parenthesis");
      return inner;
    }
    throw new Error(`unexpected token: ${t.value}`);
  }

  const result = additive();
  if (pos !== tokens.length) throw new Error(`unexpected token: ${peek()?.value ?? ""}`);
  return result;
}
