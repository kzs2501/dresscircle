/**
 * AI that fills in a form (ADR 025). A task says what the form is: its instructions, a
 * few worked examples, a Zod schema the answer must pass, and a JSON Schema that holds
 * the model to that shape while it writes. An engine runs a task on a request and hands
 * back an answer that has passed the schema, or throws. What the answer means, and what
 * it does, is the caller's code, never the model's.
 */
import { zonedDate } from "@/core/time";
import type * as z from "@/core/zod";

/** The longest request an engine is asked about: a question, not a document. */
export const MAX_AI_REQUEST_LENGTH = 200;

/** Every venue and organisation is in India, so "today", "this week" and "next month" are India's. */
export const AI_TIME_ZONE = "Asia/Kolkata";
export const todayInIndia = (nowMs: number) => zonedDate(nowMs, AI_TIME_ZONE);

/** The tasks the cloud route knows. It builds each from its name, so a caller can't send a prompt of its own. */
export const AI_TASKS = ["event-search", "organiser-question"] as const;
export type AiTaskName = (typeof AI_TASKS)[number];

export interface AiTask<Answer> {
  name: AiTaskName;
  /** What the model is told before the request: the form, and that the request is data, not instructions. */
  instructions: string;
  examples: readonly { request: string; answer: Answer }[];
  /** The answer must pass this, whichever engine wrote it. */
  schema: z.ZodType<Answer>;
  /** The same shape, as the JSON Schema an engine constrains its output to. */
  jsonSchema: Readonly<Record<string, unknown>>;
}

export type EngineName = "on-device" | "cloud";

export interface Engine {
  name: EngineName;
  /** The answer, checked against the task's schema; throws if the engine can't give one. */
  plan: <Answer>(task: AiTask<Answer>, request: string, signal: AbortSignal) => Promise<Answer>;
}

/** An engine that isn't there to ask (no model in this browser, no key, no quota left): try the next. */
export class EngineUnavailableError extends Error {
  override name = "EngineUnavailableError";
}

/** The request as the model sees it, after the examples: the same few lines every engine sends. */
export const exampleTurns = <Answer>(task: AiTask<Answer>) =>
  task.examples.flatMap(({ request, answer }) => [
    { role: "user" as const, content: request },
    { role: "assistant" as const, content: JSON.stringify(answer) },
  ]);
