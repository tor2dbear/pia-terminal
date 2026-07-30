// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TabManager } from "./tabs.js";
import type { Terminal } from "./terminal.js";

/** A stand-in Terminal — TabManager only calls dispose/focus/title on it. */
function fakeTerm(title = "~"): Terminal & { focus: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } {
  return {
    focus: vi.fn(),
    dispose: vi.fn(),
    title: () => title,
  } as unknown as Terminal & { focus: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
}

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const terms: ReturnType<typeof fakeTerm>[] = [];
  const mgr = new TabManager(root, () => {
    const t = fakeTerm();
    terms.push(t);
    return t;
  });
  return { root, mgr, terms };
}

const activeIndex = (mgr: TabManager) => mgr.list().findIndex((w) => w.active);
const paneCount = (root: HTMLElement) => root.querySelectorAll(".term-pane").length;
const visiblePanes = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(".term-pane")).filter((p) => p.style.display !== "none");

describe("TabManager", () => {
  it("opens a first window, focuses it, and shows no strip yet", () => {
    const { root, mgr, terms } = setup();
    mgr.open();
    expect(paneCount(root)).toBe(1);
    expect(terms[0].focus).toHaveBeenCalled();
    expect(root.classList.contains("has-tabs")).toBe(false); // no chrome for one window
    expect(mgr.list()).toEqual([{ index: 1, active: true, title: "~" }]);
  });

  it("shows the strip and a tab per window once there's more than one", () => {
    const { root, mgr } = setup();
    mgr.open();
    mgr.newWindow();
    expect(paneCount(root)).toBe(2);
    expect(root.classList.contains("has-tabs")).toBe(true);
    expect(root.querySelectorAll(".term-tab").length).toBe(2);
    expect(root.querySelector(".term-tab-add")).not.toBeNull();
    expect(activeIndex(mgr)).toBe(1); // the new one is active
    expect(visiblePanes(root)).toHaveLength(1); // only the active pane is shown
  });

  it("switches with next/prev (wrapping) and select", () => {
    const { mgr } = setup();
    mgr.open();
    mgr.newWindow();
    mgr.newWindow(); // 3 windows, active = 3rd (index 2)
    expect(activeIndex(mgr)).toBe(2);
    mgr.next();
    expect(activeIndex(mgr)).toBe(0); // wrapped
    mgr.prev();
    expect(activeIndex(mgr)).toBe(2); // wrapped back
    mgr.select(2);
    expect(activeIndex(mgr)).toBe(1);
    mgr.select(99); // out of range → no-op
    expect(activeIndex(mgr)).toBe(1);
  });

  it("focuses the newly-activated window each switch", () => {
    const { mgr, terms } = setup();
    mgr.open();
    mgr.newWindow();
    terms[0].focus.mockClear();
    mgr.select(1);
    expect(terms[0].focus).toHaveBeenCalledTimes(1);
  });

  it("kills the current window (disposing it) but never the last", () => {
    const { root, mgr, terms } = setup();
    mgr.open();
    mgr.newWindow(); // 2 windows, active = index 1
    mgr.kill();
    expect(terms[1].dispose).toHaveBeenCalled();
    expect(paneCount(root)).toBe(1);
    expect(root.classList.contains("has-tabs")).toBe(false);
    // The last window can't be killed.
    mgr.kill();
    expect(paneCount(root)).toBe(1);
    expect(terms[0].dispose).not.toHaveBeenCalled();
  });

  it("drives windows from tmux-style Ctrl-B prefix keys", () => {
    const { root, mgr } = setup();
    mgr.open();
    const press = (key: string, ctrl = false) =>
      root.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: ctrl, bubbles: true }));

    press("b", true); // prefix
    press("c"); // create
    expect(paneCount(root)).toBe(2);
    expect(activeIndex(mgr)).toBe(1);

    press("b", true);
    press("p"); // previous
    expect(activeIndex(mgr)).toBe(0);

    press("b", true);
    press("2"); // select window 2
    expect(activeIndex(mgr)).toBe(1);

    press("b", true);
    press("x"); // kill
    expect(paneCount(root)).toBe(1);
  });

  it("passes a bare Ctrl-B follow-key through when it isn't a window command", () => {
    const { root, mgr } = setup();
    mgr.open();
    const ev = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true); // the prefix itself is swallowed
    // A non-command follow key is left alone (not prevented), so the shell sees it.
    const follow = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true });
    root.dispatchEvent(follow);
    expect(follow.defaultPrevented).toBe(false);
    expect(paneCount(root)).toBe(1); // nothing created
  });
});
