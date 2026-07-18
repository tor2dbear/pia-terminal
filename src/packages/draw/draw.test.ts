import { describe, expect, it } from "vitest";
import { Draw } from "./draw.js";

const make = () => new Draw(() => {}, () => {});

describe("Draw", () => {
  it("starts empty", () => {
    expect(make().toText()).toBe("");
  });

  it("toggles the cell under the cursor", () => {
    const d = make();
    d.toggle();
    expect(d.toText()).toBe("█");
    d.move(1, 0);
    d.toggle();
    expect(d.toText()).toBe("██");
  });

  it("un-toggles and clears", () => {
    const d = make();
    d.toggle();
    d.toggle(); // back off
    expect(d.toText()).toBe("");
    d.move(2, 1);
    d.toggle();
    d.clear();
    expect(d.toText()).toBe("");
  });

  it("clamps the cursor at the edges", () => {
    const d = make();
    d.move(-5, -5); // already top-left → stays
    d.toggle();
    expect(d.toText()).toBe("█"); // still (0,0)
  });

  it("prints multi-row art with trailing space trimmed", () => {
    const d = make();
    d.toggle(); // (0,0)
    d.move(0, 2); // down two rows (x stays 0)
    d.toggle(); // (0,2)
    expect(d.toText()).toBe("█\n\n█");
  });
});
