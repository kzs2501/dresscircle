/**
 * The on-device engine: Chrome's built-in model (Gemini Nano), through the Prompt API.
 * Free and private (nothing leaves the device), but only on desktop Chrome where the
 * model is already installed. It's used only then: a search never starts the model's
 * download, which is gigabytes. Its answers are held to the task's JSON Schema
 * (`responseConstraint`) and then checked against the task's Zod schema like any other.
 */
import { EngineUnavailableError, exampleTurns, type Engine } from "./engine";

/** The part of the Prompt API this uses. TypeScript's DOM types don't have it yet. */
interface LanguageModelSession {
  prompt: (input: string, options: { responseConstraint: unknown; signal: AbortSignal }) => Promise<string>;
  destroy: () => void;
}

interface LanguageModelApi {
  availability: (options: typeof MODEL_OPTIONS) => Promise<string>;
  create: (
    options: typeof MODEL_OPTIONS & {
      initialPrompts: { role: "system" | "user" | "assistant"; content: string }[];
      signal: AbortSignal;
    },
  ) => Promise<LanguageModelSession>;
}

/** The same options for `availability()` as for the session, as the API asks. */
const MODEL_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

function languageModel(): LanguageModelApi | null {
  const api: unknown = Reflect.get(globalThis, "LanguageModel");
  const isApi =
    typeof api === "function" || (typeof api === "object" && api !== null)
      ? typeof (api as Partial<LanguageModelApi>).availability === "function" &&
        typeof (api as Partial<LanguageModelApi>).create === "function"
      : false;
  return isApi ? (api as LanguageModelApi) : null;
}

export const onDeviceEngine: Engine = {
  name: "on-device",
  async plan(task, request, signal) {
    const api = languageModel();
    if (!api) throw new EngineUnavailableError("This browser has no built-in model.");
    // "downloadable" and "downloading" would mean waiting for gigabytes: not for a search.
    if ((await api.availability(MODEL_OPTIONS)) !== "available") {
      throw new EngineUnavailableError("The built-in model isn't installed.");
    }
    const session = await api.create({
      ...MODEL_OPTIONS,
      signal,
      initialPrompts: [{ role: "system", content: task.instructions }, ...exampleTurns(task)],
    });
    try {
      const reply = await session.prompt(request, { responseConstraint: task.jsonSchema, signal });
      return task.schema.parse(JSON.parse(reply));
    } finally {
      session.destroy();
    }
  },
};
