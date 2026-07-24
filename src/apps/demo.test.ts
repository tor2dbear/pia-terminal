// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DemoReel, REEL } from "./demo.js";
import { neofetch } from "../commands/system.js";
import type { CommandContext, LineClass } from "../commands/registry.js";

/** Drive the reel one tick at a time (no timers), collecting the delays. */
function drive(reel: DemoReel, ticks: number): void {
  for (let i = 0; i < ticks; i++) reel.tick();
}

describe("demo reel content", () => {
  it("opens with a real neofetch, captured from the command itself", () => {
    const first = REEL[0];
    expect(first.kind === "cmd" && first.text).toBe("neofetch");

    // Re-run the real neofetch and compare — the scene must not drift.
    const lines: { text: string; cls?: string }[] = [];
    const ctx = {
      session: { user: "guest" },
      print: (text = "", cls: LineClass = "normal") =>
        lines.push(cls === "normal" ? { text } : { text, cls }),
    } as unknown as CommandContext;
    neofetch.run([], ctx);

    expect(first.kind === "cmd" && first.out).toEqual(lines);
  });

  it("is a loop: every scene ends by clearing the screen", () => {
    expect(REEL.at(-1)).toEqual({ kind: "clear" });
  });
});

describe("DemoReel playback", () => {
  it("types a command character by character before running it", () => {
    const reel = new DemoReel(() => {});
    reel.tick(); // start → begins the first command line, phase: typing
    expect(reel.snapshot().phase).toBe("typing");

    const cmd = REEL[0];
    const len = cmd.kind === "cmd" ? cmd.text.length : 0;
    // One typing tick per character; it should take exactly `len` of them to
    // reveal the whole command and move on to running it.
    let typed = 0;
    while (reel.snapshot().phase === "typing") {
      reel.tick();
      typed++;
    }
    expect(typed).toBe(len);
    expect(reel.snapshot().phase).toBe("run");
  });

  it("cycles back to the first scene after the last, forever", () => {
    const reel = new DemoReel(() => {});
    // Plenty of ticks to run the whole reel more than once.
    let sawLastStep = false;
    for (let i = 0; i < 4000; i++) {
      if (reel.snapshot().stepIdx === REEL.length - 1) sawLastStep = true;
      reel.tick();
    }
    expect(sawLastStep).toBe(true);
    // Never runs off the end of the reel.
    expect(reel.snapshot().stepIdx).toBeLessThan(REEL.length);
  });

  it("clears the logical scrollback at each scene break", () => {
    const reel = new DemoReel(() => {});
    // Advance until the first `clear` step is reached and consumed.
    for (let i = 0; i < 400; i++) {
      reel.tick();
      const { stepIdx } = reel.snapshot();
      if (REEL[stepIdx].kind === "clear") {
        reel.tick(); // process the clear
        expect(reel.snapshot().lines).toBe(0);
        return;
      }
    }
    throw new Error("never reached a clear step");
  });

  it("renders into a mounted container and exits on a key", () => {
    let exited = false;
    const reel = new DemoReel(() => {
      exited = true;
    });
    const host = document.createElement("div");
    reel.mount(host);
    drive(reel, 30);
    expect(host.querySelector(".demo-screen")?.querySelectorAll(".term-line").length).toBeGreaterThan(0);

    reel.onKey(new KeyboardEvent("keydown", { key: "q" }));
    expect(exited).toBe(true);
  });
});
