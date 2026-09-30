import { describe, expect, it } from "vitest";
import { toVisibleTranscriptText } from "./transcript";

describe("toVisibleTranscriptText", () => {
  it("removes square-bracketed delivery annotations", () => {
    expect(toVisibleTranscriptText("[calm] I found [smiles] three open times.")).toBe("I found three open times.");
  });

  it("does not add spaces before punctuation after removing an annotation", () => {
    expect(toVisibleTranscriptText("That time is open [brief pause].")).toBe("That time is open.");
  });
});
