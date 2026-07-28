// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DemoReel, REEL } from "./demo.js";
import { neofetch } from "../commands/system.js";
import { figlet } from "../packages/figlet/figlet.js";
import { find, grep } from "../commands/text.js";
import { pkg as figletPkg } from "../packages/figlet/index.js";
import { Todo } from "./todo.js";
import { VFS } from "../vfs/vfs.js";
import type { Command, CommandContext, LineClass } from "../commands/registry.js";

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

  it("shows the real figlet banner, styled like the figlet command", () => {
    const scene = REEL.find((s) => s.kind === "cmd" && s.text === "figlet PIA");
    const shown = scene?.kind === "cmd" ? (scene.out ?? []) : [];
    // Run the real `figlet` command and compare text AND styling — it prints
    // every row with the `accent` class, so a text-only check would miss a
    // colour mismatch in the reel.
    const real: { text: string; cls?: string }[] = [];
    figletPkg.commands[0].run(["PIA"], {
      stdin: "",
      print: (text = "", cls: LineClass = "normal") =>
        real.push(cls === "normal" ? { text } : { text, cls }),
      error: () => {},
    } as unknown as CommandContext);
    expect(shown).toEqual(real);
    // Sanity: still the exact glyphs the render function produces.
    expect(shown.map((l) => l.text)).toEqual(figlet("PIA"));
  });

  it("the search scene prints what real find/grep print from the guest home", () => {
    // Reconstruct the reel's state at that point: a guest home with the note it
    // wrote in nano. The reel promises retyping reproduces the shown output, so
    // run the *real* commands and hold the scripted lines to their result — this
    // catches drift like `./notes/notes.md` vs find's absolute path.
    const vfs = VFS.seed();
    vfs.mkdirp("/home/guest/notes");
    vfs.writeFile("/home/guest/notes/notes.md", "# PIA\n");

    const real = (cmd: Command, args: string[]): string[] => {
      const out: string[] = [];
      const ctx = {
        vfs,
        cwd: "/home/guest",
        session: { user: "guest" },
        print: (text = "") => out.push(text),
        error: (text = "") => out.push(text),
      } as unknown as CommandContext;
      cmd.run(args, ctx);
      return out;
    };
    const scriptOf = (text: string) => {
      const s = REEL.find((x) => x.kind === "cmd" && x.text === text);
      return s?.kind === "cmd" ? (s.out ?? []).map((l) => l.text) : [];
    };

    expect(scriptOf('find . -name "*.md"')).toEqual(real(find, [".", "-name", "*.md"]));
    expect(scriptOf("grep -in pia welcome.txt")).toEqual(real(grep, ["-in", "pia", "welcome.txt"]));
  });

  it("the checklist scene follows the real todo app's add-then-list flow", () => {
    // The reel shows each item added, then one ticked off. Drive the *real* Todo
    // through exactly that keystroke sequence and confirm the end state matches —
    // so the scene can't depict a flow (e.g. the add prompt staying open) that
    // the real app never produces.
    const scene = REEL.find((s) => s.kind === "todo");
    const adds = scene?.kind === "todo" ? scene.add : [];
    const app = new Todo(
      "groceries",
      "",
      async () => {},
      () => {},
    );
    app.mount(document.createElement("div"));
    adds.forEach((text, i) => {
      if (i > 0) app.onText("+"); // an empty list already opens in add mode
      app.onText(text); // type the item
      app.onKey(new KeyboardEvent("keydown", { key: "Enter" })); // commit → back to the list
    });
    app.onText(" "); // space ticks the selected (last) row off

    const snap = app.snapshot();
    expect(snap.items.map((i) => i.text)).toEqual(adds); // every item landed
    expect(snap.mode).toBe("normal"); // not stuck in the add prompt between items
    expect(snap.sel).toBe(adds.length - 1); // the new row is selected after each commit
    expect(snap.items[snap.sel]?.done).toBe(true); // and space toggled it
  });

  it("shows ~/notes in the prompt while working inside notes/", () => {
    const cmds = REEL.filter((s) => s.kind === "cmd") as { text: string; prompt?: string }[];
    const promptOf = (startsWith: string) => cmds.find((s) => s.text.startsWith(startsWith))?.prompt;

    // Entered at home, before `cd notes` runs.
    expect(promptOf("mkdir notes")).toBeUndefined(); // defaults to guest@pia:~$
    // Entered inside notes/, after the cd.
    expect(promptOf("nano")).toBe("guest@pia:~/notes$");
    expect(promptOf("glow")).toBe("guest@pia:~/notes$");
    expect(promptOf("cd ~")).toBe("guest@pia:~/notes$");
    // Back home for publish.
    expect(promptOf("publish")).toBeUndefined();
  });

  it("writes the same note in nano that glow then renders", () => {
    const nano = REEL.find((s) => s.kind === "nano");
    expect(nano?.kind === "nano" && nano.file).toBe("notes.md");
    // The heading typed into nano is what glow shows (upper-cased, per glow).
    const heading = nano?.kind === "nano" ? nano.lines[0] : "";
    expect(heading).toBe("# PIA");
    const glow = REEL.find((s) => s.kind === "cmd" && s.text === "glow notes.md");
    expect(glow?.kind === "cmd" && glow.out?.[0]).toEqual({ text: "PIA", cls: "accent" });
  });

  it("brew-installs an optional package before demonstrating its command", () => {
    // Commands that only exist after `brew install <pkg>` must be preceded by
    // that install in the reel, so a viewer who retypes the session succeeds.
    const optional: Record<string, string> = { python: "python", cowsay: "cowsay", figlet: "figlet" };
    const cmds = REEL.filter((s) => s.kind === "cmd") as { text: string }[];
    for (const [command, pkg] of Object.entries(optional)) {
      const useAt = cmds.findIndex((s) => s.text.split(/\s+/)[0] === command);
      const installAt = cmds.findIndex((s) => s.text === `brew install ${pkg}`);
      expect(installAt, `${pkg} should be installed in the reel`).toBeGreaterThanOrEqual(0);
      expect(installAt, `brew install ${pkg} should come before \`${command}\``).toBeLessThan(useAt);
    }
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
    // Plenty of ticks to run the whole (now longer) reel more than once.
    let sawLastStep = false;
    for (let i = 0; i < 12000; i++) {
      if (reel.snapshot().stepIdx === REEL.length - 1) sawLastStep = true;
      reel.tick();
    }
    expect(sawLastStep).toBe(true);
    // Never runs off the end of the reel.
    expect(reel.snapshot().stepIdx).toBeLessThan(REEL.length);
  });

  it("types `clear` as a real command, then wipes the scrollback", () => {
    const reel = new DemoReel(() => {});
    const host = document.createElement("div");
    reel.mount(host);
    // Advance until the first `clear` step is the current step.
    for (let i = 0; i < 800; i++) {
      if (REEL[reel.snapshot().stepIdx].kind === "clear") break;
      reel.tick();
    }
    expect(REEL[reel.snapshot().stepIdx].kind).toBe("clear");
    // It should type the literal command `clear` onto a prompt line…
    let typedClear = false;
    for (let i = 0; i < 40; i++) {
      reel.tick();
      const lines = Array.from(host.querySelectorAll(".term-line"));
      if (lines.some((l) => l.textContent?.includes("clear"))) typedClear = true;
      if (reel.snapshot().lines === 0 && typedClear) break;
    }
    expect(typedClear).toBe(true); // not just an instant blank
    expect(reel.snapshot().lines).toBe(0); // …and then the screen is cleared
  });

  it("renders into a mounted container", () => {
    const reel = new DemoReel(() => {});
    const host = document.createElement("div");
    reel.mount(host);
    drive(reel, 30);
    expect(host.querySelector(".demo-screen")?.querySelectorAll(".term-line").length).toBeGreaterThan(0);
  });

  it("plays nano, the checklist, and the Python REPL as real full-screen scenes, then returns", () => {
    const reel = new DemoReel(() => {});
    const host = document.createElement("div");
    reel.mount(host);

    let sawNote = false; // the note typed into the editor body
    let sawSaved = false; // the ^O save message
    let sawTodoItem = false; // an item added in the checklist
    let sawTodoDone = false; // an item ticked off
    let sawResult = false; // a Python result in the REPL log
    let stageAfterExit = true; // the stage must be gone once we're back in scrollback

    // Longer reel now (nano → todo → figlet → python), so allow more ticks.
    for (let i = 0; i < 9000; i++) {
      reel.tick();
      const ed = host.querySelector(".ed-body");
      if (ed?.textContent?.includes("# PIA")) sawNote = true;
      if (host.querySelector(".ed-msg")?.textContent?.includes("saved notes.md")) sawSaved = true;
      if (host.querySelector(".td-text")?.textContent?.includes("buy milk")) sawTodoItem = true;
      if (host.querySelector(".td-check.done")) sawTodoDone = true;
      if (host.querySelector(".pyrepl-out")?.textContent?.includes("5050")) sawResult = true;
      // When scrollback is visible again, no stage should remain.
      if (reel.snapshot().phase !== "frames" && host.querySelector(".demo-stage")) {
        stageAfterExit = false;
      }
    }

    expect(sawNote).toBe(true);
    expect(sawSaved).toBe(true);
    expect(sawTodoItem).toBe(true);
    expect(sawTodoDone).toBe(true);
    expect(sawResult).toBe(true);
    expect(stageAfterExit).toBe(true);
  });

  it("exits on any key — including Enter, an arrow, or printable text", () => {
    for (const press of [
      (r: DemoReel) => r.onKey(new KeyboardEvent("keydown", { key: "q" })),
      (r: DemoReel) => r.onKey(new KeyboardEvent("keydown", { key: "Enter" })),
      (r: DemoReel) => r.onKey(new KeyboardEvent("keydown", { key: "ArrowDown" })),
      (r: DemoReel) => r.onText("a"),
    ]) {
      let exited = false;
      const reel = new DemoReel(() => {
        exited = true;
      });
      press(reel);
      expect(exited).toBe(true);
    }
  });

  it("ignores a lone modifier press so a chord can be reached", () => {
    let exited = false;
    const reel = new DemoReel(() => {
      exited = true;
    });
    reel.onKey(new KeyboardEvent("keydown", { key: "Shift" }));
    expect(exited).toBe(false);
  });
});
