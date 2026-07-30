// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TabManager } from "./tabs.js";
import type { Terminal } from "./terminal.js";

type FakeTerm = Terminal & {
  focus: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  rehome: ReturnType<typeof vi.fn>;
  setTitle: (t: string) => void;
  fireTitle: () => void;
  setApp: (v: boolean) => void;
  setRunning: (v: boolean) => void;
};

/** A stand-in Terminal — TabManager only calls a handful of methods on it. */
function fakeTerm(): FakeTerm {
  let title = "~";
  let app = false;
  let running = false;
  let listener: (() => void) | undefined;
  return {
    focus: vi.fn(),
    dispose: vi.fn(),
    rehome: vi.fn(),
    title: () => title,
    hasApp: () => app,
    isRunningCommand: () => running,
    setTitleListener: (fn: (() => void) | undefined) => (listener = fn),
    setTitle: (t: string) => (title = t),
    fireTitle: () => listener?.(),
    setApp: (v: boolean) => (app = v),
    setRunning: (v: boolean) => (running = v),
  } as unknown as FakeTerm;
}

function setup(opts: { ready?: boolean } = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const terms: FakeTerm[] = [];
  const mgr = new TabManager(root, () => {
    const t = fakeTerm();
    terms.push(t);
    return t;
  });
  if (opts.ready !== false) mgr.markReady(); // most tests exercise the post-boot state
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

  it("keeps the same window selected when a tab to its left is closed", () => {
    const { root, mgr, terms } = setup();
    mgr.open();
    mgr.newWindow();
    mgr.newWindow(); // 3 windows A,B,C
    terms[0].setTitle("A");
    terms[1].setTitle("B");
    terms[2].setTitle("C");
    mgr.select(2); // B active (index 1)
    // Close A via its tab's × control.
    const closeA = root.querySelectorAll<HTMLElement>(".term-tab .term-tab-x")[0];
    closeA.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    // B is still the active window (now at index 0), not C.
    expect(terms[0].dispose).toHaveBeenCalled(); // A was disposed
    const active = mgr.list().find((w) => w.active);
    expect(active?.title).toBe("B");
  });

  it("won't open new windows until it's marked ready (mid-boot gate)", () => {
    const { root, mgr } = setup({ ready: false });
    mgr.open(); // the first window always opens (it's the one that boots)
    mgr.newWindow(); // gated — nothing yet
    expect(paneCount(root)).toBe(1);
    mgr.markReady();
    mgr.newWindow();
    expect(paneCount(root)).toBe(2);
  });

  it("won't close a window while a command is mid-flight", () => {
    const { root, mgr, terms } = setup();
    mgr.open();
    mgr.newWindow(); // 2 windows, active index 1
    terms[1].setRunning(true); // a command is running in the active window
    mgr.kill();
    expect(paneCount(root)).toBe(2); // refused
    expect(terms[1].dispose).not.toHaveBeenCalled();
    terms[1].setRunning(false);
    mgr.kill();
    expect(paneCount(root)).toBe(1); // now it closes
  });

  it("reports when any window has a full-screen app open", () => {
    const { mgr, terms } = setup();
    mgr.open();
    mgr.newWindow();
    expect(mgr.hasAppOpen()).toBe(false);
    terms[0].setApp(true);
    expect(mgr.hasAppOpen()).toBe(true);
  });

  it("re-homes every window when the account changes (rehomeAll)", () => {
    const { mgr, terms } = setup();
    mgr.open();
    mgr.newWindow();
    mgr.rehomeAll();
    expect(terms[0].rehome).toHaveBeenCalledTimes(1);
    expect(terms[1].rehome).toHaveBeenCalledTimes(1);
  });

  it("refreshes the active tab label when its cwd changes", () => {
    const { root, mgr, terms } = setup();
    mgr.open();
    mgr.newWindow(); // window 2 active
    terms[1].setTitle("~/notes");
    terms[1].fireTitle(); // a `cd` in the active window
    const activeTab = root.querySelector(".term-tab.active");
    expect(activeTab?.textContent).toContain("~/notes");
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
