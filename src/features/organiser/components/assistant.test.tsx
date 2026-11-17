import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { planWithEngines } from "@/lib/ai/plan";
import { AskedQuestionsProvider } from "@/features/organiser/hooks/use-asked-questions";
import { EVENTS } from "@/features/organiser/testing/answer-fixtures";
import { Assistant } from "./assistant";

vi.mock("@/lib/ai/plan", () => ({ planWithEngines: vi.fn() }));
const plan = vi.mocked(planWithEngines);

afterEach(() => {
  vi.restoreAllMocks();
  plan.mockReset();
});

function setup() {
  vi.spyOn(apiClient, "listEvents").mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AskedQuestionsProvider>
        <Assistant events={EVENTS} shownEvent={null} />
      </AskedQuestionsProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), box: screen.getByRole("textbox", { name: "Your question" }) };
}

describe("the assistant's question box", () => {
  it("takes a new question while one is being read, in place of it (DC-16)", async () => {
    // An engine that never answers: the first question is still being read when the second comes.
    plan.mockReturnValue(new Promise(() => undefined));
    const { user, box } = setup();

    await user.type(box, "which shows are doing well?{Enter}");
    expect(await screen.findByText("Reading “which shows are doing well?”…")).toBeVisible();

    await user.type(box, "how are the ticket sales feeling{Enter}");
    expect(await screen.findByText("Reading “how are the ticket sales feeling”…")).toBeVisible();
    expect(screen.queryByText("Reading “which shows are doing well?”…")).toBeNull();
    expect(box).toHaveValue("");
    expect(plan).toHaveBeenCalledTimes(2);
    // The first reading was given up on, so its answer can't land after the second.
    expect(plan.mock.calls[0]?.[2]?.signal.aborted).toBe(true);
  });
});
