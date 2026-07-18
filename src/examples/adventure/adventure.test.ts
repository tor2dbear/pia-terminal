// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountAdventure } from "./adventure.js";
import type { Terminal, CoreCommandContext } from "../../engine/index.js";

let term: Terminal<CoreCommandContext> | undefined;
const flush = () => new Promise((r) => setTimeout(r, 0));

function start(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  ({ term } = mountAdventure(root));
  return root;
}
afterEach(() => {
  term?.dispose();
  term = undefined;
});

const out = (root: HTMLElement) =>
  [...root.querySelectorAll(".term-line")].map((n) => n.textContent);

async function play(root: HTMLElement, line: string): Promise<void> {
  const field = root.querySelector(".term-kbd") as HTMLInputElement;
  field.value = line;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await flush();
}

describe("text adventure — a second shell on the engine", () => {
  it("shows the opening room when mounted", () => {
    const root = start();
    expect(out(root)).toContain("Entrance Hall");
  });

  it("plays through to a win using only the engine's command loop", async () => {
    const root = start();
    await play(root, "north"); // Entrance Hall → Dusty Library
    expect(out(root)).toContain("Dusty Library");
    await play(root, "take key");
    await play(root, "go east"); // unlocked by the key → The Vault
    expect(out(root)).toContain("The Vault");
    await play(root, "take treasure");
    expect(out(root).join("\n")).toContain("You win");
  });

  it("keeps the vault locked without the key", async () => {
    const root = start();
    await play(root, "north");
    await play(root, "east"); // no key yet
    expect(out(root).join("\n")).toContain("locked");
  });

  it("aliases work through the engine (i → inventory)", async () => {
    const root = start();
    await play(root, "i");
    expect(out(root).join("\n")).toContain("carrying nothing");
  });

  it("is replayable — a second game still has its items", async () => {
    const first = start();
    await play(first, "north");
    await play(first, "take key"); // deplete items in game 1

    const second = start(); // a fresh World must not share game 1's state
    await play(second, "north");
    await play(second, "take key");
    expect(out(second).join("\n")).toContain("You take the key");
  });
});
