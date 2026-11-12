/**
 * Ask the engines in order (on the device, then the cloud) and take the first answer
 * that passes the task's schema. Each gets a time budget, so a slow engine hands over
 * to the next instead of keeping a person waiting; whatever happens, the caller always
 * has its own way to answer without AI.
 */
import { cloudEngine } from "./cloud";
import type { AiTask, Engine, EngineName } from "./engine";
import { onDeviceEngine } from "./on-device";

export type PlanResult<Answer> =
  | { ok: true; answer: Answer; engine: EngineName }
  | { ok: false; isAborted: boolean; failures: Partial<Record<EngineName, string>> };

/** Long enough for a small model to fill in a small form; two of them still under eight seconds. */
export const ENGINE_BUDGET_MS = 4_000;

export async function planWithEngines<Answer>(
  task: AiTask<Answer>,
  request: string,
  {
    signal,
    engines = [onDeviceEngine, cloudEngine],
    budgetMs = ENGINE_BUDGET_MS,
  }: { signal: AbortSignal; engines?: readonly Engine[]; budgetMs?: number },
): Promise<PlanResult<Answer>> {
  const failures: Partial<Record<EngineName, string>> = {};
  // Read fresh each time: the person can ask something else while an engine works.
  const isAborted = () => signal.aborted;
  for (const engine of engines) {
    if (isAborted()) return { ok: false, isAborted: true, failures };
    try {
      const answer = await engine.plan(task, request, AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]));
      return { ok: true, answer, engine: engine.name };
    } catch (error) {
      if (isAborted()) return { ok: false, isAborted: true, failures };
      failures[engine.name] = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  }
  return { ok: false, isAborted: false, failures };
}
