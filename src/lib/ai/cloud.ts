/**
 * The cloud engine: this site's `/ai/plan` route, which asks a model on Groq's free tier.
 * It sends only the task's name and the request's text; the route builds the task itself
 * (ADR 025). When the route says the AI is unavailable (no key, the free quota spent, a
 * client asking too often), this tab stops asking for as long as `Retry-After` says, or
 * ten minutes, so a visitor doesn't wait on a request that will fail.
 */
import { EngineUnavailableError, type Engine } from "./engine";

/** Outside `/api/*`, which the sandbox's service worker answers: this goes to the server. */
export const AI_PLAN_PATH = "/ai/plan";

const DEFAULT_PAUSE_MS = 10 * 60_000;

export function createCloudEngine({
  fetch: send = (input, init) => fetch(input, init),
  now = Date.now,
}: { fetch?: typeof fetch; now?: () => number } = {}): Engine {
  let pausedUntilMs = 0;

  return {
    name: "cloud",
    async plan(task, request, signal) {
      if (now() < pausedUntilMs) throw new EngineUnavailableError("The cloud engine is resting.");
      const response = await send(AI_PLAN_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ task: task.name, text: request }),
        signal,
      });
      if (!response.ok) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After"));
        pausedUntilMs =
          now() +
          (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : DEFAULT_PAUSE_MS);
        throw new EngineUnavailableError(`The cloud engine answered ${String(response.status)}.`);
      }
      const body: unknown = await response.json();
      const answer = typeof body === "object" && body !== null ? (body as { answer?: unknown }).answer : undefined;
      return task.schema.parse(answer);
    },
  };
}

export const cloudEngine = createCloudEngine();
