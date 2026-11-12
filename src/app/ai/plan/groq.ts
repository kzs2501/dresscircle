/**
 * The cloud engine's model: one of OpenAI's open-weight gpt-oss models on Groq's free
 * tier (about a thousand requests a day, no card). Called with `fetch`, no SDK: one
 * request, its answer held to the task's JSON Schema by Groq's strict structured output,
 * then checked again by the route. The key stays on the server.
 */
import { exampleTurns, type AiTask } from "@/lib/ai/engine";

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Groq's smaller gpt-oss: strict structured output, and quick enough for a search. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

export class GroqError extends Error {
  override name = "GroqError";
  constructor(
    message: string,
    /** Groq's HTTP status, when it answered. */
    readonly status: number | null,
    readonly retryAfterSeconds: number | null,
    /** Groq's error code, such as `json_validate_failed` when the model's output broke the schema. */
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

export async function askGroq<Answer>({
  apiKey,
  model,
  task,
  request,
  signal,
  fetch: send = (input, init) => fetch(input, init),
}: {
  apiKey: string;
  model: string;
  task: AiTask<Answer>;
  request: string;
  signal: AbortSignal;
  fetch?: typeof fetch;
}): Promise<unknown> {
  const response = await send(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: task.instructions },
        ...exampleTurns(task),
        { role: "user", content: request },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: task.name.replaceAll("-", "_"), strict: true, schema: task.jsonSchema },
      },
      temperature: 0,
      // A small form needs little thought, and thinking counts against the free tier's tokens.
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: 512,
    }),
    signal,
  });
  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const failure = (await response.json().catch(() => null)) as { error?: { code?: unknown } } | null;
    const code = typeof failure?.error?.code === "string" ? failure.error.code : null;
    throw new GroqError(
      `Groq answered ${String(response.status)}${code ? ` (${code})` : ""}.`,
      response.status,
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : null,
      code,
    );
  }
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new GroqError("Groq's answer had no content.", response.status, null);
  return JSON.parse(content);
}
