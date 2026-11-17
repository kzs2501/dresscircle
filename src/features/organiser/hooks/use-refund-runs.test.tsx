import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RefundResultDto } from "@/contract/dto";
import type { RefundReason } from "@/core/statuses";
import { ApiError, NetworkError } from "@/lib/api-client";
import type { BatchOrder } from "@/features/organiser/domain/refund-batch";
import { summaryOf } from "@/features/organiser/domain/refund-run";
import { BULK_CONCURRENCY, RefundRunsProvider, useRefundRuns } from "./use-refund-runs";

type Request = (orderId: string, reason: RefundReason, key: string) => Promise<RefundResultDto>;

const refused = new ApiError({
  type: "https://dresscircle.test/problems/refund-failed",
  title: "The refund couldn’t start",
  status: 502,
  detail: "The payment provider couldn’t start the refund.",
  code: "refund_failed",
});
const ok = () => Promise.resolve({} as RefundResultDto);
const orders = (count: number): BatchOrder[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `ord_${String(index)}`,
    buyerName: "A buyer",
    eventName: "Night Market Jazz",
    totalMinor: 100_000,
    currency: "INR",
  }));
/** A refund that waits until the test lets it finish. */
const held = () => {
  const pending: (() => void)[] = [];
  const request = vi.fn<Request>(
    () =>
      new Promise((resolve) => {
        pending.push(() => {
          resolve({} as RefundResultDto);
        });
      }),
  );
  return { request, finishAll: () => pending.splice(0).forEach((finish) => finish()) };
};

function setup(requestRefund: Request) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RefundRunsProvider requestRefund={requestRefund}>{children}</RefundRunsProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useRefundRuns(), { wrapper });
  const summary = () => {
    const run = hook.result.current.runs[1];
    if (!run) throw new Error("no run");
    return summaryOf(run);
  };
  return { ...hook, invalidate, summary };
}

describe("refund batches the organiser confirmed", () => {
  it("refunds every order, never more than four at once, and refreshes the dashboard", async () => {
    let inFlight = 0;
    let mostAtOnce = 0;
    const request = vi.fn<Request>(async () => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return ok();
    });
    const { result, invalidate, summary } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(23), "event_changed");
    });
    await waitFor(() => {
      expect(summary().isRunning).toBe(false);
    });
    expect(request).toHaveBeenCalledTimes(23);
    expect(request).toHaveBeenCalledWith("ord_0", "event_changed", expect.any(String));
    expect(mostAtOnce).toBe(BULK_CONCURRENCY);
    expect(summary()).toMatchObject({ started: 23, failed: [], notAsked: [], wasStopped: false });
    // After 10 and 20, and at the end: orders and numbers each time.
    expect(invalidate).toHaveBeenCalledTimes(6);
  });

  it("says which failed and why, and retries only those, a lost answer with its key", async () => {
    const request = vi
      .fn<Request>(ok)
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(new NetworkError("Couldn’t reach the server."));
    const { result, summary } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(5), "requested_by_customer");
    });
    await waitFor(() => {
      expect(summary().isRunning).toBe(false);
    });
    expect(summary()).toMatchObject({
      started: 3,
      failed: [
        { orderId: "ord_0", message: "The payment provider couldn’t start the refund." },
        { orderId: "ord_1", message: expect.stringContaining("Retrying is safe") as string },
      ],
    });

    const keyOf = (orderId: string) => request.mock.calls.find(([id]) => id === orderId)?.[2];
    const firstKeys = { refused: keyOf("ord_0"), lost: keyOf("ord_1") };
    request.mockClear();
    act(() => {
      result.current.refund(1, ["ord_0", "ord_1"], "requested_by_customer");
    });
    await waitFor(() => {
      expect(summary()).toMatchObject({ isRunning: false, started: 5, failed: [] });
    });
    expect(request.mock.calls.map(([id]) => id)).toEqual(["ord_0", "ord_1"]);
    // A lost answer is retried with its key, so it can't refund twice; a refusal is a new request.
    expect(keyOf("ord_1")).toBe(firstKeys.lost);
    expect(keyOf("ord_0")).not.toBe(firstKeys.refused);
  });

  it("stops starting refunds when asked, letting those in flight finish, and says which weren't asked for", async () => {
    const { request, finishAll } = held();
    const { result, summary } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(12), "other");
    });
    expect(request).toHaveBeenCalledTimes(BULK_CONCURRENCY);
    expect(summary()).toMatchObject({ isRunning: true, total: 12, done: 0 });
    act(() => {
      result.current.stop(1);
    });
    await act(async () => {
      finishAll();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(summary().isRunning).toBe(false);
    });
    expect(request).toHaveBeenCalledTimes(BULK_CONCURRENCY);
    expect(summary()).toMatchObject({ started: BULK_CONCURRENCY, failed: [], wasStopped: true });
    expect(summary().notAsked).toEqual(
      orders(12)
        .slice(BULK_CONCURRENCY)
        .map((order) => order.id),
    );
  });

  it("accounts for every order when a retry is stopped part-way (DC-04)", async () => {
    let isFirstPass = true;
    const { request: slow, finishAll } = held();
    const request = vi.fn<Request>((orderId, ...rest) =>
      isFirstPass ? (orderId === "ord_0" ? ok() : Promise.reject(refused)) : slow(orderId, ...rest),
    );
    const { result, summary } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(6), "event_changed");
    });
    await waitFor(() => {
      expect(summary()).toMatchObject({ isRunning: false, started: 1 });
    });
    expect(summary().failed).toHaveLength(5);

    isFirstPass = false;
    act(() => {
      result.current.refund(
        1,
        summary().failed.map((failure) => failure.orderId),
        "event_changed",
      );
    });
    act(() => {
      result.current.stop(1);
    });
    await act(async () => {
      finishAll();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(summary().isRunning).toBe(false);
    });
    // One started first, four on the retry; the sixth was never asked for, and says so.
    expect(summary()).toMatchObject({ started: 5, failed: [], notAsked: ["ord_5"], wasStopped: true });

    act(() => {
      result.current.refund(1, summary().notAsked, "event_changed");
    });
    await act(async () => {
      finishAll();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(summary()).toMatchObject({ isRunning: false, started: 6, notAsked: [] });
    });
  });

  it("asks before the tab closes while refunds are running", async () => {
    const { request, finishAll } = held();
    const { result, summary } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(1), "other");
    });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      finishAll();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(summary().isRunning).toBe(false);
    });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("starts no more once the dashboard is left", async () => {
    const { request, finishAll } = held();
    const { result, unmount } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(9), "other");
    });
    expect(request).toHaveBeenCalledTimes(BULK_CONCURRENCY);
    unmount();
    await act(async () => {
      finishAll();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledTimes(BULK_CONCURRENCY);
  });

  it("forgets a finished batch when dismissed, but never one that's running", async () => {
    const { request, finishAll } = held();
    const { result, summary } = setup(request);
    act(() => {
      result.current.start(1, "Night Market Jazz", orders(2), "other");
    });
    act(() => {
      result.current.dismiss(1);
    });
    expect(result.current.runs[1]).toBeDefined();
    await act(async () => {
      finishAll();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(summary().isRunning).toBe(false);
    });
    act(() => {
      result.current.dismiss(1);
    });
    expect(result.current.runs[1]).toBeUndefined();
  });
});
