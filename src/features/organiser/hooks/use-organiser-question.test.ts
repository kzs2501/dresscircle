import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planWithEngines } from "@/lib/ai/plan";
import { EVENTS, questionWith } from "@/features/organiser/testing/answer-fixtures";
import { AskedQuestionsProvider } from "./use-asked-questions";
import { MAX_ASKED, useOrganiserQuestion } from "./use-organiser-question";

vi.mock("@/lib/ai/plan", () => ({ planWithEngines: vi.fn() }));
const plan = vi.mocked(planWithEngines);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T12:00:00+05:30"));
});

afterEach(() => {
  vi.useRealTimers();
  plan.mockReset();
});

/** The public catalogue: the account's events and another organiser's. */
const CATALOGUE = [
  ...EVENTS,
  { slug: "monsoon-strings", name: "Monsoon Strings", city: "Mumbai", startsAt: "2027-01-16T19:00:00+05:30" },
];
const loadCatalogue = () => Promise.resolve(CATALOGUE);
const setup = (shownEvent: string | null = null, load: () => Promise<typeof CATALOGUE> = loadCatalogue) =>
  renderHook(() => useOrganiserQuestion(EVENTS, shownEvent, load), { wrapper: AskedQuestionsProvider });

describe("asking about your sales", () => {
  it("reads what the rules can place without an engine", async () => {
    const { result } = setup();
    await act(() => result.current.ask("refunded orders last week"));
    expect(plan).not.toHaveBeenCalled();
    expect(result.current.asked[0]).toMatchObject({
      text: "refunded orders last week",
      engine: null,
      question: { intent: "find-orders", statuses: ["refunded"], from: "2026-11-02", to: "2026-11-08" },
    });
  });

  it("asks an engine about the rest, offering only the account's own events", async () => {
    plan.mockResolvedValue({
      ok: true,
      engine: "cloud",
      answer: questionWith({ intent: "ticket-types", event: "night-market-jazz" }),
    });
    const { result } = setup();
    await act(() => result.current.ask("which shows are doing well?"));
    const [task] = plan.mock.calls[0] ?? [];
    expect(task?.name).toBe("organiser-question");
    expect(task?.jsonSchema).toMatchObject({ properties: { event: { anyOf: [{ enum: ["night-market-jazz"] }, {}] } } });
    expect(result.current.asked[0]).toMatchObject({ engine: "cloud", question: { intent: "ticket-types" } });
  });

  it("keeps the rules' reading, and says what it didn't use, when no engine answers", async () => {
    plan.mockResolvedValue({ ok: false, isAborted: false, failures: {} });
    const { result } = setup();
    await act(() => result.current.ask("which shows are doing well?"));
    expect(result.current.asked[0]).toMatchObject({
      engine: null,
      question: { intent: "summary" },
      unused: ["shows", "well"],
    });
  });

  it("takes a question that names no event to be about the one the overview shows", async () => {
    const { result } = setup("night-market-jazz");
    await act(() => result.current.ask("refunded orders"));
    expect(result.current.asked[0]?.question.event).toBe("night-market-jazz");
  });

  it("drops an engine's answer to a question asked over", async () => {
    let finish: (value: Awaited<ReturnType<typeof planWithEngines>>) => void = () => undefined;
    plan.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = setup();
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.ask("which shows are doing well?");
    });
    expect(result.current.pending).toBe("which shows are doing well?");
    await act(() => result.current.ask("refunded orders"));
    finish({ ok: true, engine: "cloud", answer: questionWith({ intent: "funnel" }) });
    await act(() => first);
    expect(result.current.asked.map((entry) => entry.question.intent)).toEqual(["find-orders"]);
    expect(result.current.pending).toBeNull();
  });

  it("keeps the last few, newest first", () => {
    const { result } = setup();
    for (let index = 0; index < MAX_ASKED + 2; index += 1) {
      act(() => {
        result.current.askReady(`suggestion ${String(index)}`, questionWith({ intent: "funnel" }));
      });
    }
    expect(result.current.asked.map((entry) => entry.text)).toEqual([
      "suggestion 6",
      "suggestion 5",
      "suggestion 4",
      "suggestion 3",
      "suggestion 2",
    ]);
  });

  it("says another organiser's event isn't yours, without asking an engine (DC-12)", async () => {
    const { result } = setup();
    await act(() => result.current.ask("issue refunds for Monsoon Strings"));
    expect(plan).not.toHaveBeenCalled();
    expect(result.current.asked[0]).toMatchObject({ engine: null, notYours: "Monsoon Strings" });
  });

  it("waits for the public events if a question comes before they've loaded", async () => {
    let arrive: (events: typeof CATALOGUE) => void = () => undefined;
    const { result } = setup(null, () => new Promise((resolve) => (arrive = resolve)));
    let asking: Promise<void> = Promise.resolve();
    act(() => {
      asking = result.current.ask("issue refunds for Monsoon Strings");
    });
    expect(result.current.pending).toBe("issue refunds for Monsoon Strings");
    arrive(CATALOGUE);
    await act(() => asking);
    expect(plan).not.toHaveBeenCalled();
    expect(result.current.asked[0]).toMatchObject({ notYours: "Monsoon Strings" });
  });

  it("goes on without the public events if they fail", async () => {
    plan.mockResolvedValue({ ok: false, isAborted: false, failures: {} });
    const { result } = setup(null, () => Promise.reject(new Error("offline")));
    await act(() => result.current.ask("issue refunds for Monsoon Strings"));
    expect(plan).toHaveBeenCalledTimes(1);
    expect(result.current.asked[0]).toMatchObject({ unused: ["monsoon", "strings"] });
    expect(result.current.asked[0]?.notYours).toBeUndefined();
  });
});
