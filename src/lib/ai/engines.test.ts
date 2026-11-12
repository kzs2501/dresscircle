// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "@/core/zod";
import { createCloudEngine } from "./cloud";
import { EngineUnavailableError, type AiTask, type Engine } from "./engine";
import { onDeviceEngine } from "./on-device";
import { planWithEngines } from "./plan";

const task: AiTask<{ city: string | null }> = {
  name: "event-search",
  instructions: "Fill in the city.",
  examples: [{ request: "in Goa", answer: { city: "Goa" } }],
  schema: z.strictObject({ city: z.enum(["Goa", "Pune"]).nullable() }),
  jsonSchema: { type: "object" },
};
const signal = () => new AbortController().signal;

function installModel({ availability = "available", reply = '{"city":"Pune"}' } = {}) {
  const session = { prompt: vi.fn(() => Promise.resolve(reply)), destroy: vi.fn() };
  const api = {
    availability: vi.fn(() => Promise.resolve(availability)),
    create: vi.fn(() => Promise.resolve(session)),
  };
  vi.stubGlobal("LanguageModel", api);
  return { api, session };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the on-device engine", () => {
  it("isn't there in a browser without the built-in model", async () => {
    await expect(onDeviceEngine.plan(task, "Pune", signal())).rejects.toBeInstanceOf(EngineUnavailableError);
  });

  it.each(["downloadable", "downloading", "unavailable"])("never waits for a model that's %s", async (state) => {
    const { api } = installModel({ availability: state });
    await expect(onDeviceEngine.plan(task, "Pune", signal())).rejects.toBeInstanceOf(EngineUnavailableError);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("holds the model to the task's shape, teaches it with the examples, and closes the session", async () => {
    const { api, session } = installModel();
    await expect(onDeviceEngine.plan(task, "something in Pune", signal())).resolves.toEqual({ city: "Pune" });
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompts: [
          { role: "system", content: "Fill in the city." },
          { role: "user", content: "in Goa" },
          { role: "assistant", content: '{"city":"Goa"}' },
        ],
      }),
    );
    expect(session.prompt).toHaveBeenCalledWith(
      "something in Pune",
      expect.objectContaining({ responseConstraint: { type: "object" } }),
    );
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it("rejects an answer outside the task's schema, and still closes the session", async () => {
    const { session } = installModel({ reply: '{"city":"Atlantis"}' });
    await expect(onDeviceEngine.plan(task, "Atlantis", signal())).rejects.toThrow();
    expect(session.destroy).toHaveBeenCalledOnce();
  });
});

describe("the cloud engine", () => {
  const ok = (body: unknown) => Promise.resolve(Response.json(body));

  it("sends only the task's name and the request, and checks the answer", async () => {
    const fetch = vi.fn(() => ok({ answer: { city: "Goa" } }));
    const engine = createCloudEngine({ fetch });
    await expect(engine.plan(task, "by the sea", signal())).resolves.toEqual({ city: "Goa" });
    expect(fetch).toHaveBeenCalledWith(
      "/ai/plan",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ task: "event-search", text: "by the sea" }) }),
    );
    await expect(
      createCloudEngine({ fetch: () => ok({ answer: { city: "Atlantis" } }) }).plan(task, "x", signal()),
    ).rejects.toThrow();
  });

  it("stops asking for as long as the route says, once it's unavailable", async () => {
    let nowMs = 0;
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ code: "ai_unavailable" }, { status: 503, headers: { "Retry-After": "30" } })),
    );
    const engine = createCloudEngine({ fetch, now: () => nowMs });
    await expect(engine.plan(task, "Goa", signal())).rejects.toBeInstanceOf(EngineUnavailableError);
    nowMs = 29_000;
    await expect(engine.plan(task, "Goa", signal())).rejects.toBeInstanceOf(EngineUnavailableError);
    expect(fetch).toHaveBeenCalledOnce();
    nowMs = 30_000;
    await expect(engine.plan(task, "Goa", signal())).rejects.toBeInstanceOf(EngineUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("asking the engines in order", () => {
  const engine = (name: Engine["name"], plan: Engine["plan"]): Engine => ({ name, plan });
  const answers = (city: string) => engine("cloud", () => Promise.resolve({ city } as never));
  const fails = (name: Engine["name"]) =>
    engine(name, () => Promise.reject(new EngineUnavailableError(`${name} isn't here`)));

  it("takes the first engine's answer", async () => {
    const result = await planWithEngines(task, "Goa", {
      signal: signal(),
      engines: [answers("Goa"), fails("on-device")],
    });
    expect(result).toEqual({ ok: true, answer: { city: "Goa" }, engine: "cloud" });
  });

  it("falls through to the next engine, and says why each failed when none can answer", async () => {
    expect(
      await planWithEngines(task, "Goa", { signal: signal(), engines: [fails("on-device"), answers("Pune")] }),
    ).toMatchObject({
      ok: true,
      answer: { city: "Pune" },
    });
    expect(
      await planWithEngines(task, "Goa", { signal: signal(), engines: [fails("on-device"), fails("cloud")] }),
    ).toEqual({
      ok: false,
      isAborted: false,
      failures: {
        "on-device": "EngineUnavailableError: on-device isn't here",
        cloud: "EngineUnavailableError: cloud isn't here",
      },
    });
  });

  it("gives up on a slow engine after its budget and asks the next", async () => {
    const slow = engine(
      "on-device",
      (...[, , budget]) =>
        new Promise((resolve, reject) => {
          budget.addEventListener("abort", () => {
            reject(new Error("too slow"));
          });
        }),
    );
    const result = await planWithEngines(task, "Goa", {
      signal: signal(),
      engines: [slow, answers("Goa")],
      budgetMs: 10,
    });
    expect(result).toMatchObject({ ok: true, engine: "cloud" });
  });

  it("stops when the person asks something else", async () => {
    const controller = new AbortController();
    const asked = engine(
      "on-device",
      () =>
        new Promise((resolve, reject) => {
          controller.abort();
          reject(new Error("aborted"));
        }),
    );
    const next = vi.fn(() => Promise.resolve({ city: "Goa" } as never));
    const result = await planWithEngines(task, "Goa", {
      signal: controller.signal,
      engines: [asked, engine("cloud", next)],
    });
    expect(result).toEqual({ ok: false, isAborted: true, failures: {} });
    expect(next).not.toHaveBeenCalled();
  });
});
