// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import { posterFor } from "./poster";

describe("an event's poster", () => {
  it("shows its kind of night out", () => {
    expect(posterFor({ slug: "x", category: "music" }).motif).toBe("sunburst");
    expect(posterFor({ slug: "x", category: "theatre" }).motif).toBe("proscenium");
    expect(posterFor({ slug: "x", category: "festivals" }).motif).toBe("fans");
  });

  it("is the same every time, in two different colours", () => {
    for (const event of CATALOG) {
      const poster = posterFor(event);
      expect(posterFor(event)).toEqual(poster);
      expect(poster.ground).not.toBe(poster.figure);
    }
  });

  it("varies across the catalogue", () => {
    const pairs = new Set(
      CATALOG.map((event) => `${String(posterFor(event).ground)}-${String(posterFor(event).figure)}`),
    );
    expect(pairs.size).toBeGreaterThan(2);
  });
});
