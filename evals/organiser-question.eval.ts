// @vitest-environment node
/**
 * How well organisers' questions are read (ADR 026): each case is a question and what a
 * person would expect it to ask for, scored field by field through the dashboard's own
 * pipeline (the rules, then an engine when they can't place every word), like the search's
 * evals. `EVAL_ENGINE=none` (CI) uses the rules alone; `EVAL_ENGINE=cloud` asks Groq's free
 * tier too, by hand, with `GROQ_API_KEY`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import * as z from "@/core/zod";
import { askGroq, DEFAULT_GROQ_MODEL, GroqError } from "@/app/ai/plan/groq";
import { readingWithAnswer, readQuestion } from "@/features/organiser/domain/question";
import { organiserQuestionTask, type OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";

const FIELDS = ["intent", "event", "from", "to", "statuses", "method", "search", "refundReason"] as const;
type Field = (typeof FIELDS)[number];

const { today, cases } = z
  .object({
    today: z.iso.date(),
    cases: z.array(z.object({ question: z.string(), expect: z.partialRecord(z.enum(FIELDS), z.string().nullable()) })),
  })
  .parse(JSON.parse(readFileSync(new URL("./organiser-question.cases.json", import.meta.url), "utf8")));

const engine = process.env["EVAL_ENGINE"] === "cloud" ? "cloud" : "none";
const CLOUD_SPACING_MS = 2_100;
/** The share of cases the rules alone must read exactly right: today's score, less a margin. */
const RULES_FLOOR = 0.85;
const CLOUD_FLOOR = 0.8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Asked = { kind: "no" } | { kind: "answered" } | { kind: "failed"; why: string };

/** What the dashboard would understand: the rules' reading, or an engine's when the rules can't place it all. */
async function understand(question: string): Promise<{ read: OrganiserQuestion; asked: Asked }> {
  const reading = readQuestion(question, CATALOG, today);
  if (engine === "none" || (reading.hasIntent && reading.unknownWords.length === 0)) {
    return { read: reading.question, asked: { kind: "no" } };
  }
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("EVAL_ENGINE=cloud needs GROQ_API_KEY.");
  const task = organiserQuestionTask(CATALOG, today);
  const ask = () =>
    askGroq({
      apiKey,
      model: process.env["AI_CLOUD_MODEL"] ?? DEFAULT_GROQ_MODEL,
      task,
      request: question,
      signal: AbortSignal.timeout(15_000),
    });
  try {
    // The free tier counts tokens a minute: when it says wait, wait as long as it says, once.
    const raw = await ask().catch(async (error: unknown) => {
      if (!(error instanceof GroqError) || error.status !== 429) throw error;
      await sleep((error.retryAfterSeconds ?? 20) * 1000);
      return ask();
    });
    return { read: readingWithAnswer(reading, task.schema.parse(raw)), asked: { kind: "answered" } };
  } catch (error) {
    return {
      read: reading.question,
      asked: { kind: "failed", why: error instanceof Error ? error.message : String(error) },
    };
  }
}

const valueOf = (field: Field, read: OrganiserQuestion) =>
  field === "statuses" ? [...read.statuses].sort().join(" ") || null : read[field];

describe(`reading organisers' questions, engine: ${engine}`, () => {
  it(
    "reads enough of them exactly right",
    async () => {
      const rows: string[] = [];
      const hits = Object.fromEntries(FIELDS.map((field) => [field, { hit: 0, total: 0 }])) as Record<
        Field,
        { hit: number; total: number }
      >;
      let exact = 0;
      for (const { question, expect: expected } of cases) {
        const { read, asked } = await understand(question);
        const misses = FIELDS.filter((field) => {
          const want = expected[field];
          if (want === undefined) return false;
          hits[field].total += 1;
          const isHit = valueOf(field, read) === want;
          if (isHit) hits[field].hit += 1;
          return !isHit;
        });
        if (misses.length === 0) exact += 1;
        const tag = { no: "    ", answered: "[ai]", failed: "[ai failed]" }[asked.kind];
        const why = asked.kind === "failed" ? `  (${asked.why})` : "";
        const got = FIELDS.map((field) => `${field}=${String(valueOf(field, read))}`).join(" ");
        rows.push(`${misses.length === 0 ? "✓" : "✗"} ${tag} ${question}  →  ${got}${why}`);
        if (asked.kind !== "no") await sleep(CLOUD_SPACING_MS);
      }
      const score = exact / cases.length;
      const perField = FIELDS.filter((field) => hits[field].total > 0).map(
        (field) => `${field} ${String(hits[field].hit)}/${String(hits[field].total)}`,
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
