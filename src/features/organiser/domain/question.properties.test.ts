// @vitest-environment node
/**
 * Properties of the rules' reading, over thousands of made-up questions and days: what the
 * November bug hunt checked, kept. A reading always fits the form an engine's must, and
 * its period is real and in order.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import { ORDER_STATUSES, PAYMENT_METHODS, REFUND_REASONS } from "@/core/statuses";
import { organiserQuestionTask, QUESTION_INTENTS, type OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";
import { formatPeriod } from "./answers";
import { readingWithAnswer, readQuestion } from "./question";

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

/** Any answer an engine could give, before the task's schema has had its say. */
const answer = fc.record<OrganiserQuestion>({
  intent: fc.constantFrom(...QUESTION_INTENTS),
  event: fc.option(fc.constantFrom(...CATALOG.map((event) => event.slug)), { nil: null }),
  from: fc.option(day, { nil: null }),
  to: fc.option(day, { nil: null }),
  statuses: fc.uniqueArray(fc.constantFrom(...ORDER_STATUSES), { maxLength: 3 }),
  method: fc.option(fc.constantFrom(...PAYMENT_METHODS), { nil: null }),
  search: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: null }),
  refundReason: fc.option(fc.constantFrom(...REFUND_REASONS), { nil: null }),
  notApplied: fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
});

describe("an engine's reading with the rules' on top, for any question and answer", () => {
  const TODAY = "2026-11-17";
  const schema = organiserQuestionTask(CATALOG, TODAY).schema;

  it("still fits the form, keeps the rules' period, and never runs backwards", () => {
    fc.assert(
      fc.property(question, answer, (text, engine) => {
        if (!schema.safeParse(engine).success) return;
        const rules = readQuestion(text, CATALOG, TODAY);
        const merged = readingWithAnswer(rules, engine);
        expect(schema.safeParse(merged).success).toBe(true);
        if (rules.question.from !== null) expect(merged.from).toBe(rules.question.from);
        if (merged.from !== null && merged.to !== null) expect(merged.from <= merged.to).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });
});

describe("periods read on the days most likely to trip them", () => {
  const HARD_DAYS = [
    "2026-01-01",
    "2025-12-31",
    "2028-02-29",
    "2027-03-01",
    "2026-11-16",
    "2026-11-22",
    "2026-03-31",
    "2026-05-31",
    "2026-12-01",
    "2026-01-05",
  ];
  const PHRASES = [
    "sales this week",
    "sales last week",
    "sales this month",
    "sales last month",
    "sales yesterday",
    "sales today",
    "sales in December",
    "sales in January",
    "sales in February 2028",
    "sales in the past 30 days",
    "sales in the last 7 days",
    "sales in December 2025",
  ];

  it.each(HARD_DAYS)("on %s, every period is real and in order, and one begun by then ends by then", (today) => {
    for (const phrase of PHRASES) {
      const { from, to } = readQuestion(phrase, CATALOG, today).question;
      expect({ phrase, from: from && isRealDay(from), to: to && isRealDay(to) }).toEqual({
        phrase,
        from: true,
        to: true,
      });
      if (from === null || to === null) continue;
      expect(from <= to).toBe(true);
      if (from <= today) expect(to <= today).toBe(true);
      // Its sentence reads.
      expect(formatPeriod(from, to)).not.toBe("");
    }
    // A week starts on a Monday.
    const { from: monday } = readQuestion("sales this week", CATALOG, today).question;
    expect(new Date(`${monday ?? ""}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});

describe("reading is quick whatever is typed", () => {
  it("reads 200 characters of the worst repetitions, and of anything, in well under 50 ms", () => {
    const worst = [
      "please ".repeat(28),
      "can you ".repeat(25),
      "refund ".repeat(28),
      "a".repeat(200),
      "in ".repeat(66),
      "last week ".repeat(20),
      `${" ".repeat(199)}!`,
      "refund the the the the ".repeat(8),
    ];
    let slowest = 0;
    for (const sample of [...worst, ...fc.sample(question, 300)]) {
      const started = performance.now();
      readQuestion(sample, CATALOG, "2026-11-17");
      slowest = Math.max(slowest, performance.now() - started);
    }
    expect(slowest).toBeLessThan(50);
  });
});
