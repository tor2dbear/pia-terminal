import { describe, expect, it } from "vitest";
import { slugForName } from "./slug.js";

describe("slugForName", () => {
  it("lowercases, strips the .md extension, and hyphenates", () => {
    expect(slugForName("Trip Notes.md")).toBe("trip-notes");
    expect(slugForName("about.md")).toBe("about");
    expect(slugForName("about")).toBe("about");
  });

  it("strips diacritics", () => {
    expect(slugForName("Åre Höst.md")).toBe("are-host");
  });

  it("collapses punctuation (incl. PostgREST-reserved) to single hyphens", () => {
    expect(slugForName("Smith,John.md")).toBe("smith-john");
    expect(slugForName("a (b) c!.md")).toBe("a-b-c");
  });

  it("normalises index and doubled extensions", () => {
    expect(slugForName("Index.MD")).toBe("index");
    expect(slugForName("notes.md.md")).toBe("notes-md");
  });

  it("returns empty for input with nothing usable", () => {
    expect(slugForName("！！！.md")).toBe("");
  });
});
