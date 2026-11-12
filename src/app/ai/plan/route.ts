/**
 * The cloud engine (ADR 025): `POST /ai/plan` with a task's name and a request's text,
 * answered with the task's form filled in. Outside `/api/*`, so in the sandbox build the
 * service worker lets it through to here.
 *
 * It isn't a way to reach a model for free: the server builds the task itself, from the
 * catalogue and its own clock, so a caller can send nothing but the text, and gets back
 * nothing but an answer that passed the task's schema. Each client may ask 10 times a
 * minute and 60 an hour, counted in this instance's memory; Groq's daily quota is the
 * real ceiling. Whatever goes wrong is one problem, `ai_unavailable`, and the page
 * answers without AI.
 */
import { clientIpHeaderFrom, clientKeyOf } from "@/core/client-key";
import { createSlidingWindowStore, type RateLimit } from "@/core/sliding-window";
import * as z from "@/core/zod";
import { PROBLEM_CATALOG, PROBLEM_CONTENT_TYPE, problemTypeFor, type ProblemCode } from "@/contract/problems";
import { AI_TASKS, MAX_AI_REQUEST_LENGTH } from "@/lib/ai/engine";
import { askGroq, DEFAULT_GROQ_MODEL, GroqError } from "./groq";
import { buildTask } from "./tasks";

export const dynamic = "force-dynamic";

/** Shorter than the browser's budget for this engine, so the page hears why, not just a timeout. */
const UPSTREAM_TIMEOUT_MS = 3_500;
/** Far more than a task's name and two hundred characters of text. */
const MAX_BODY_BYTES = 2_048;
const PER_MINUTE: RateLimit = { limit: 10, windowMs: 60_000 };
const PER_HOUR: RateLimit = { limit: 60, windowMs: 60 * 60_000 };
/** How long to wait after a failure that says nothing more. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const perMinute = createSlidingWindowStore(Date.now);
const perHour = createSlidingWindowStore(Date.now);

const bodySchema = z.strictObject({
  task: z.enum(AI_TASKS),
  text: z.string().trim().min(1).max(MAX_AI_REQUEST_LENGTH),
});

function problem(
  request: Request,
  code: Extract<ProblemCode, "ai_unavailable" | "invalid_request">,
  detail: string,
  retryAfterSeconds?: number,
) {
  const { status, title } = PROBLEM_CATALOG[code];
  return Response.json(
    { type: problemTypeFor(code, request.url), title, status, detail, instance: request.url, code },
    {
      status,
      headers: {
        "Content-Type": PROBLEM_CONTENT_TYPE,
        "Cache-Control": "no-store",
        ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }),
      },
    },
  );
}

/** Why a request failed, for the log: never the request's text, nor anything the model wrote. */
const describeFailure = (error: unknown) =>
  error instanceof GroqError
    ? [error.name, error.status, error.code].filter((part) => part !== null).join(" ")
    : error instanceof Error
      ? error.name
      : "unknown";

/** `AI_CLOUD_MODEL` names another of Groq's models with strict structured output; unset, the default. */
function cloudModel() {
  const configured = process.env["AI_CLOUD_MODEL"]?.trim() ?? "";
  return configured === "" ? DEFAULT_GROQ_MODEL : configured;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return problem(request, "ai_unavailable", "No AI key is set up here.", 3_600);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return problem(request, "invalid_request", "The request is too long.");
  let parsed: z.ZodSafeParseResult<z.infer<typeof bodySchema>>;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return problem(request, "invalid_request", "The body isn’t JSON.");
  }
  if (!parsed.success) {
    return problem(request, "invalid_request", `Send a task (${AI_TASKS.join(", ")}) and the text of a request.`);
  }

  const clientKey = clientKeyOf(request, clientIpHeaderFrom(process.env)) ?? "unknown";
  for (const [store, limit] of [
    [perMinute, PER_MINUTE],
    [perHour, PER_HOUR],
  ] as const) {
    const decision = store.take(clientKey, limit);
    if (!decision.isAllowed) {
      return problem(
        request,
        "ai_unavailable",
        "This client has asked the AI often in a short time.",
        Math.ceil(decision.retryAfterMs / 1000),
      );
    }
  }

  const task = buildTask(parsed.data.task, Date.now());
  try {
    const answer = task.schema.parse(
      await askGroq({
        apiKey,
        model: cloudModel(),
        task,
        request: parsed.data.text,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      }),
    );
    return Response.json({ answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn(`[ai] ${task.name} wasn't answered: ${describeFailure(error)}`);
    const retryAfterSeconds =
      error instanceof GroqError && error.retryAfterSeconds !== null
        ? error.retryAfterSeconds
        : DEFAULT_RETRY_AFTER_SECONDS;
    return problem(request, "ai_unavailable", "The AI model couldn’t answer just now.", retryAfterSeconds);
  }
}
