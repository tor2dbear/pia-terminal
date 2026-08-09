import { describe, expect, it } from "vitest";
import {
  HANDLE_MAX,
  RESERVED_HANDLES,
  slugifyHandle,
  validateHandle,
  handleCandidates,
} from "./handle.js";

describe("slugifyHandle", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugifyHandle("Tor Bjorn")).toBe("tor-bjorn");
  });

  it("strips diacritics (åäö → aao)", () => {
    expect(slugifyHandle("Tör Björn")).toBe("tor-bjorn");
    expect(slugifyHandle("Håkan Ärlig Öberg")).toBe("hakan-arlig-oberg");
  });

  it("collapses runs of punctuation to a single hyphen", () => {
    expect(slugifyHandle("a  b__c!!d")).toBe("a-b-c-d");
  });

  it("trims leading and trailing separators", () => {
    expect(slugifyHandle("  -.hello.-  ")).toBe("hello");
  });

  it("keeps digits and passes an already-clean handle through", () => {
    expect(slugifyHandle("tor2dbear")).toBe("tor2dbear");
  });

  it("derives from an email local-part", () => {
    expect(slugifyHandle("tb.hedberg")).toBe("tb-hedberg");
  });

  it("clamps to the max length without leaving a trailing hyphen", () => {
    const out = slugifyHandle("x".repeat(50));
    expect(out.length).toBe(HANDLE_MAX);
    const out2 = slugifyHandle("a".repeat(HANDLE_MAX - 1) + " tail");
    expect(out2.endsWith("-")).toBe(false);
    expect(out2.length).toBeLessThanOrEqual(HANDLE_MAX);
  });

  it("returns empty for input with nothing usable", () => {
    expect(slugifyHandle("！！！")).toBe("");
  });
});

describe("validateHandle", () => {
  it("accepts a plain handle", () => {
    expect(validateHandle("tor2dbear")).toEqual({ ok: true });
    expect(validateHandle("a-b-c")).toEqual({ ok: true });
  });

  it("rejects too short and too long", () => {
    expect(validateHandle("a").ok).toBe(false);
    expect(validateHandle("x".repeat(HANDLE_MAX + 1)).ok).toBe(false);
  });

  it("rejects uppercase and illegal characters", () => {
    expect(validateHandle("Tor").ok).toBe(false);
    expect(validateHandle("tor_dbear").ok).toBe(false);
    expect(validateHandle("tör").ok).toBe(false);
  });

  it("rejects leading, trailing, and doubled hyphens", () => {
    expect(validateHandle("-tor").ok).toBe(false);
    expect(validateHandle("tor-").ok).toBe(false);
    expect(validateHandle("to--r").ok).toBe(false);
  });

  it("rejects reserved words", () => {
    expect(validateHandle("api").ok).toBe(false);
    expect(validateHandle("admin").ok).toBe(false);
    expect(validateHandle("feed").ok).toBe(false);
    expect(validateHandle("incoming").ok).toBe(false);
  });

  it("every reserved word is itself charset/length-legal (so the denylist is the only thing stopping it)", () => {
    for (const word of RESERVED_HANDLES) {
      const check = validateHandle(word);
      expect(check.ok, `"${word}" should be rejected only for being reserved`).toBe(false);
      if (!check.ok) expect(check.reason).toContain("reserved");
    }
  });
});

describe("handleCandidates", () => {
  const take = (base: string, n: number): string[] => {
    const out: string[] = [];
    for (const c of handleCandidates(base)) {
      out.push(c);
      if (out.length === n) break;
    }
    return out;
  };

  it("offers the slug first, then numbered fallbacks", () => {
    expect(take("tor2dbear", 3)).toEqual(["tor2dbear", "tor2dbear2", "tor2dbear3"]);
  });

  it("skips an invalid/reserved base but still yields numbered candidates", () => {
    // "api" is reserved → not offered bare, but api2/api3 are fine.
    expect(take("api", 2)).toEqual(["api2", "api3"]);
  });

  it("falls back to a stem when the base slugifies to nothing", () => {
    const [first] = take("！！！", 1);
    expect(validateHandle(first).ok).toBe(true);
  });

  it("keeps numbered candidates within the length cap", () => {
    const long = "a".repeat(HANDLE_MAX);
    for (const c of take(long, 5)) {
      expect(c.length).toBeLessThanOrEqual(HANDLE_MAX);
      expect(validateHandle(c).ok).toBe(true);
    }
  });
});
