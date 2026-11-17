// @vitest-environment node
/**
 * Properties of the home page's search, read by the rules, over thousands of made-up
 * searches and days: what the November bug hunt checked, kept. Every filter it sets is one
 * the page offers, and an engine's answer merged in never makes the search too long.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import { eventSearchTask } from "@/lib/ai/tasks/event-search";
import { filterChoices } from "./event-filters";
import { readEventQuery, readingWithAnswer } from "./event-query";

const WORDS = [
  "comedy",
  "stand-up",
  "music",
  "theatre",
  "workshops",
  "talks",
  "in",
  "delhi",
  "goa",
  "mumbai",
  "bombay",
  "cheap",
  "next",
  "weekend",
  "tonight",
  "this",
  "month",
  "december",
  "february",
  "2027",
  "jazz",
  "night",
  "lakeside",
  "lights",
  "for",
  "the",
  "kids",
];
const search = fc
  .oneof(
    fc.array(fc.constantFrom(...WORDS), { maxLength: 10 }).map((words) => words.join(" ")),
    fc.string({ maxLength: 60 }),
    fc.string({ maxLength: 60, unit: "grapheme" }),
  )
  .map((text) => text.slice(0, 60));
const day = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2032, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));
const CHOICES = filterChoices(CATALOG);

describe("a search, read by the rules", () => {
  it("only ever sets filters the page offers, and keeps the search to 60 characters", () => {
    fc.assert(
      fc.property(search, day, (text, today) => {
        const { filters } = readEventQuery(text, CATALOG, today);
        if (filters.category !== undefined) expect(CHOICES.categories).toContain(filters.category);
        if (filters.city !== undefined) expect(CHOICES.cities).toContain(filters.city);
        if (filters.month !== undefined) expect(filters.month).toMatch(/^\d{4}-(?:0[1-9]|1[0-2])$/u);
        expect((filters.q ?? "").length).toBeLessThanOrEqual(60);
      }),
      { numRuns: 2_000 },
    );
  });

  it("with any answer the schema accepts merged in, still only sets filters the page offers", () => {
    const schema = eventSearchTask(CHOICES, "2026-11-17").schema;
    const answer = fc.record({
      category: fc.option(fc.constantFrom(...CHOICES.categories), { nil: null }),
      city: fc.option(fc.constantFrom(...CHOICES.cities), { nil: null }),
      month: fc.option(fc.constantFrom("2026-11", "2026-12", "2027-02", "2025-01", "2030-07"), { nil: null }),
      keywords: fc.option(fc.string({ maxLength: 80 }), { nil: null }),
      notApplied: fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
    });
    fc.assert(
      fc.property(search, answer, (text, engine) => {
        if (!schema.safeParse(engine).success) return;
        const { filters } = readingWithAnswer(readEventQuery(text, CATALOG, "2026-11-17"), engine, CATALOG);
        if (filters.category !== undefined) expect(CHOICES.categories).toContain(filters.category);
        if (filters.city !== undefined) expect(CHOICES.cities).toContain(filters.city);
        expect((filters.q ?? "").length).toBeLessThanOrEqual(60);
      }),
      { numRuns: 2_000 },
    );
  });
});
