// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Pager } from "./pager.js";

const content = Array.from({ length: 50 }, (_, i) => `L${i + 1}`).join("\n");
const key = (k: string): KeyboardEvent =>
  ({ key: k, preventDefault() {} }) as unknown as KeyboardEvent;

describe("Pager (scroll model)", () => {
  it("shows the first screenful", () => {
    const p = new Pager("t", content, () => {});
    expect(p.snapshot()).toMatchObject({ top: 0, rows: 20, total: 50 });
    expect(p.visible()[0]).toBe("L1");
    expect(p.visible()).toHaveLength(20);
  });

  it("pages down a screenful with Space", () => {
    const p = new Pager("t", content, () => {});
    p.onText(" ");
    expect(p.snapshot().top).toBe(20);
    expect(p.visible()[0]).toBe("L21");
  });

  it("PageDown clamps at the end; PageUp steps back", () => {
    const p = new Pager("t", content, () => {});
    p.onKey(key("PageDown"));
    p.onKey(key("PageDown")); // 0 → 20 → 30 (maxTop = 50 - 20)
    expect(p.snapshot()).toMatchObject({ top: 30, atEnd: true });
    p.onKey(key("PageUp"));
    expect(p.snapshot().top).toBe(10);
  });

  it("jumps to the end with G and back with g", () => {
    const p = new Pager("t", content, () => {});
    p.onText("G");
    expect(p.snapshot()).toMatchObject({ top: 30, atEnd: true });
    expect(p.visible().at(-1)).toBe("L50");
    p.onText("g");
    expect(p.snapshot().top).toBe(0);
  });

  it("scrolls one line with the arrows and clamps at the top", () => {
    const p = new Pager("t", content, () => {});
    p.onKey(key("ArrowDown"));
    expect(p.snapshot().top).toBe(1);
    p.onKey(key("ArrowUp"));
    p.onKey(key("ArrowUp"));
    expect(p.snapshot().top).toBe(0);
  });

  it("quits on q and Escape", () => {
    let exited = 0;
    const p = new Pager("t", content, () => exited++);
    p.onText("q");
    p.onKey(key("Escape"));
    expect(exited).toBe(2);
  });

  it("renders one window of lines into a container", () => {
    const p = new Pager("readme", content, () => {});
    const el = document.createElement("div");
    p.mount(el);
    expect(el.querySelector(".ed-title")?.textContent).toContain("readme");
    expect(el.querySelectorAll(".ed-line").length).toBe(20);
    p.unmount();
  });
});
