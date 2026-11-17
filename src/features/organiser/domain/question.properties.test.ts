// @vitest-environment node
/**
 * Properties of the rules' reading, over thousands of made-up questions and days: what the
 * November bug hunt checked, kept. A reading always fits the form an engine's must, and
 * its period is real and in order.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import { organiserQuestionTask } from "@/lib/ai/tasks/organiser-question";
import { readQuestion } from "./question";

const WORDS = [
  "refund",
  "refunds",
  "refunded",
  "every",
  "orders",
  "for",
  "the",
  "jazz",
  "night",
  "summit",
  "this",
  "last",
  "week",
  "month",
  "yesterday",
  "today",
  "in",
  "october",
  "december",
  "january",
  "february",
  "2025",
  "2026",
  "2027",
  "2030",
  "upi",
  "card",
  "failed",
  "paid",
  "please",
  "should",
  "i",
  "cancelled",
  "duplicate",
  "sales",
  "how",
  "many",
  "tickets",
  "past",
  "30",
  "days",
  "7",
  "monsoon",
  "lakeside",
  "priya@example.com",
  "ord_a1b2c3",
];
const question = fc.oneof(
  fc.array(fc.constantFrom(...WORDS), { maxLength: 12 }).map((words) => words.join(" ")),
  fc.string({ maxLength: 200 }),
);
const day = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2032, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));
const isRealDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/u.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

describe("the rules' reading of any question, on any day", () => {
  it("fits the form, with a real period that runs forwards", () => {
    fc.assert(
      fc.property(question, day, (text, today) => {
        const { question: read } = readQuestion(text, CATALOG, today);
        expect(organiserQuestionTask(CATALOG, today).schema.safeParse(read).success).toBe(true);
        for (const date of [read.from, read.to]) if (date !== null) expect(isRealDay(date)).toBe(true);
        if (read.from !== null && read.to !== null) expect(read.from <= read.to).toBe(true);
        // A period that began by today ends by today.
        if (read.from !== null && read.to !== null && read.from <= today) expect(read.to <= today).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });
});
