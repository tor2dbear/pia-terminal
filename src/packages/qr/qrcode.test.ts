import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encodeQr, type Ecl } from "./qrcode.js";

/**
 * Rasterise a QR matrix to RGBA pixels with a quiet zone, so a real decoder can
 * read it. This is the whole point of the test: we don't trust the encoder's
 * tables — we decode its output and check the text round-trips.
 */
function rasterize(modules: boolean[][], scale = 6, quiet = 4): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const n = modules.length + quiet * 2;
  const width = n * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let r = 0; r < modules.length; r++) {
    for (let c = 0; c < modules[r].length; c++) {
      if (!modules[r][c]) continue;
      const x0 = (c + quiet) * scale;
      const y0 = (r + quiet) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = ((y0 + dy) * width + (x0 + dx)) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }
  }
  return { data, width, height: width };
}

function roundTrip(text: string, ecl: Ecl): string | null {
  const { data, width, height } = rasterize(encodeQr(text, ecl));
  return jsQR(data, width, height)?.data ?? null;
}

describe("encodeQr → jsQR round-trip", () => {
  const samples = [
    "HELLO",
    "https://pia.tor2dbear.com",
    "user@pia:~$ echo hi",
    "The quick brown fox jumps over the lazy dog.",
    "åäö — unicode ✓ works",
  ];

  for (const ecl of ["L", "M", "Q", "H"] as Ecl[]) {
    for (const text of samples) {
      it(`decodes "${text.slice(0, 20)}" at level ${ecl}`, () => {
        expect(roundTrip(text, ecl)).toBe(text);
      });
    }
  }

  it("produces a square matrix (version 1 for a short string)", () => {
    const m = encodeQr("hi", "L");
    // A 2-byte string fits version 1 → 21×21.
    expect(m.length).toBe(21);
    expect(m[0].length).toBe(21);
  });

  it("has the three finder patterns (dark corners)", () => {
    const m = encodeQr("hi", "L");
    // Centre of each finder (offset 3,3) is dark.
    expect(m[3][3]).toBe(true);
    expect(m[3][m.length - 4]).toBe(true);
    expect(m[m.length - 4][3]).toBe(true);
  });

  it("grows to a larger version for longer text (and still decodes)", () => {
    const text = "https://pia.tor2dbear.com/#p=" + "a".repeat(120);
    const m = encodeQr(text, "L");
    expect(m.length).toBeGreaterThan(21);
    expect(roundTrip(text, "L")).toBe(text);
  });

  it("throws when the text exceeds even the largest QR version", () => {
    expect(() => encodeQr("x".repeat(3000), "H")).toThrow(/too long/);
  });

  it("throws on empty input", () => {
    expect(() => encodeQr("", "M")).toThrow(/nothing to encode/);
  });
});
