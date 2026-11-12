// @vitest-environment node
/**
 * How well a search written in your own words is read (ADR 025): each case is a request
 * and the filters a person would expect, scored field by field. It runs the page's own
 * pipeline (the rules, then an engine for the words they can't place) with one engine:
 *
 * - `EVAL_ENGINE=none` (the default, and CI's): the rules alone, with no network. The
 *   floor below keeps a change to the rules from quietly reading worse.
 * - `EVAL_ENGINE=cloud`: the rules, then Groq's free tier for the rest, asked directly
 *   with `GROQ_API_KEY`, under its 30-requests-a-minute limit. Run by hand; its score is
 *   written down in docs/quality.md.
 *
 *   npm run eval:ai                                   # rules alone
 *   EVAL_ENGINE=cloud node --env-file=.env.local node_modules/vitest/vitest.mjs run --project evals
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import * as z from "@/core/zod";
import { askGroq, DEFAULT_GROQ_MODEL } from "@/app/ai/plan/groq";
import { filterChoices, type EventFilters } from "@/features/events/domain/event-filters";
import { readEventQuery, readingWithAnswer } from "@/features/events/domain/event-query";
import { eventSearchTask } from "@/lib/ai/tasks/event-search";

const FIELDS = ["category", "city", "month", "q"] as const;
type Field = (typeof FIELDS)[number];

const casesSchema = z.object({
  today: z.iso.date(),
  cases: z.array(
    z.object({
      request: z.string(),
      expect: z.partialRecord(z.enum(FIELDS), z.string().nullable()),
    }),
  ),
});

const { today, cases } = casesSchema.parse(
  JSON.parse(readFileSync(new URL("./event-search.cases.json", import.meta.url), "utf8")),
);
const engine = process.env["EVAL_ENGINE"] === "cloud" ? "cloud" : "none";
/** Below Groq's free tier's 30 requests a minute. */
const CLOUD_SPACING_MS = 2_100;
/** The share of cases the rules alone must read exactly right: today's score, less a margin. */
const RULES_FLOOR = 0.8;
const CLOUD_FLOOR = 0.8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether an engine was asked: not at all, and answered, or failed (and why). */
type Asked = { kind: "no" } | { kind: "answered" } | { kind: "failed"; why: string };

/** What the page would show: an engine's answer on top of the rules', or the rules' alone when the engine fails. */
async function filtersFor(request: string): Promise<{ filters: EventFilters; asked: Asked }> {
  const reading = readEventQuery(request, CATALOG, today);
  if (engine === "none" || reading.unknownWords.length === 0)
    return { filters: reading.filters, asked: { kind: "no" } };
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("EVAL_ENGINE=cloud needs GROQ_API_KEY.");
  const task = eventSearchTask(filterChoices(CATALOG), today);
  try {
    const answer = task.schema.parse(
      await askGroq({
        apiKey,
        model: process.env["AI_CLOUD_MODEL"] ?? DEFAULT_GROQ_MODEL,
        task,
        request,
        signal: AbortSignal.timeout(15_000),
      }),
    );
    return { filters: readingWithAnswer(reading, answer, CATALOG).filters, asked: { kind: "answered" } };
  } catch (error) {
    return {
      filters: reading.filters,
      asked: { kind: "failed", why: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** Whether a field came out as expected. Keywords count when every expected word is there. */
function matches(field: Field, expected: string | null, filters: EventFilters) {
  const actual = filters[field] ?? null;
  if (field !== "q" || expected === null || actual === null) return actual === expected;
  const words = new Set(actual.split(" "));
  return expected.split(" ").every((word) => words.has(word));
}

describe(`reading searches in your own words, engine: ${engine}`, () => {
  it(
    "reads enough of them exactly right",
    async () => {
      const rows: string[] = [];
      const fieldHits: Record<Field, { hit: number; total: number }> = {
        category: { hit: 0, total: 0 },
        city: { hit: 0, total: 0 },
        month: { hit: 0, total: 0 },
        q: { hit: 0, total: 0 },
      };
      let exact = 0;
      for (const { request, expect: expected } of cases) {
        const { filters, asked } = await filtersFor(request);
        const misses = FIELDS.filter((field) => {
          const want = expected[field];
          if (want === undefined) return false;
          fieldHits[field].total += 1;
          const isHit = matches(field, want, filters);
          if (isHit) fieldHits[field].hit += 1;
          return !isHit;
        });
        if (misses.length === 0) exact += 1;
        const tag = { no: "    ", answered: "[ai]", failed: "[ai failed]" }[asked.kind];
        const why = asked.kind === "failed" ? `  (${asked.why})` : "";
        rows.push(`${misses.length === 0 ? "✓" : "✗"} ${tag} ${request}  →  ${JSON.stringify(filters)}${why}`);
        if (asked.kind !== "no") await sleep(CLOUD_SPACING_MS);
      }
      const score = exact / cases.length;
      const perField = FIELDS.map(
        (field) => `${field} ${String(fieldHits[field].hit)}/${String(fieldHits[field].total)}`,
      );
      console.info(
        [
          ...rows,
          "",
          `${String(exact)}/${String(cases.length)} exactly right (${(score * 100).toFixed(0)}%)`,
          perField.join(", "),
        ].join("\n"),
      );
      expect(score).toBeGreaterThanOrEqual(engine === "cloud" ? CLOUD_FLOOR : RULES_FLOOR);
    },
    5 * 60_000,
  );
});
