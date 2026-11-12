/**
 * The tasks the cloud route can be asked to run, each built here from the catalogue and
 * the server's own clock (ADR 025). A caller names a task and sends a request's text;
 * nothing it sends changes the instructions, the examples or the schema.
 */
import { CATALOG } from "@/core/catalog";
import { filterChoices } from "@/features/events/domain/event-filters";
import { todayInIndia, type AiTask, type AiTaskName } from "@/lib/ai/engine";
import { eventSearchTask } from "@/lib/ai/tasks/event-search";

const BUILDERS: Readonly<Record<AiTaskName, (nowMs: number) => AiTask<unknown>>> = {
  "event-search": (nowMs) => eventSearchTask(filterChoices(CATALOG), todayInIndia(nowMs)),
};

export const buildTask = (name: AiTaskName, nowMs: number) => BUILDERS[name](nowMs);
