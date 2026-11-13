import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RefundResultDto } from "@/contract/dto";
import type { RefundReason } from "@/core/statuses";
import { ApiError, NetworkError } from "@/lib/api-client";
import { BULK_CONCURRENCY, useBulkRefund } from "./use-bulk-refund";

type Request = (orderId: string, reason: RefundReason, key: string) => Promise<RefundResultDto>;

const refused = new ApiError({
  type: "https://dresscircle.test/problems/refund-failed",
  title: "The refund couldn’t start",
  status: 502,
  detail: "The payment provider couldn’t start the refund.",
  code: "refund_failed",
});
const ok = () => Promise.resolve({} as RefundResultDto);
const ids = (count: number) => Array.from({ length: count }, (_, index) => `ord_${String(index)}`);

function setup(requestRefund: Request) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useBulkRefund({ requestRefund }), { wrapper });
  return { ...hook, invalidate };
}

describe("refunding a confirmed batch", () => {
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
    const { result, invalidate } = setup(request);
    await act(() => result.current.start(ids(23), "event_changed"));
    expect(request).toHaveBeenCalledTimes(23);
    expect(request).toHaveBeenCalledWith("ord_0", "event_changed", expect.any(String));
    expect(mostAtOnce).toBe(BULK_CONCURRENCY);
    expect(result.current.state).toEqual({ status: "finished", total: 23, started: 23, failed: [], wasStopped: false });
    // After 10 and 20, and at the end: orders and numbers each time.
    expect(invalidate).toHaveBeenCalledTimes(6);
  });

  it("says which failed and why, and retries only those, adding to what started", async () => {
    const request = vi
      .fn<Request>(ok)
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(new NetworkError("Couldn’t reach the server."));
    const { result } = setup(request);
    await act(() => result.current.start(ids(5), "requested_by_customer"));
    expect(result.current.state).toMatchObject({
      status: "finished",
      started: 3,
      failed: [
        { orderId: "ord_0", message: "The payment provider couldn’t start the refund." },
        { orderId: "ord_1", message: expect.stringContaining("Retrying is safe") as string },
      ],
    });

    const keyOf = (orderId: string) => request.mock.calls.find(([id]) => id === orderId)?.[2];
    const firstKeys = { refused: keyOf("ord_0"), lost: keyOf("ord_1") };
    request.mockClear();
    await act(() => result.current.retryFailed("requested_by_customer"));
    expect(request.mock.calls.map(([id]) => id)).toEqual(["ord_0", "ord_1"]);
    // A lost answer is retried with its key, so it can't refund twice; a refusal is a new request.
    expect(keyOf("ord_1")).toBe(firstKeys.lost);
    expect(keyOf("ord_0")).not.toBe(firstKeys.refused);
    expect(result.current.state).toMatchObject({ status: "finished", started: 5, failed: [] });
  });

  it("stops starting refunds when asked, letting those in flight finish", async () => {
    const pending: (() => void)[] = [];
    const request = vi.fn<Request>(
      () =>
        new Promise((resolve) => {
          pending.push(() => {
            resolve({} as RefundResultDto);
          });
        }),
    );
    const { result } = setup(request);
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(ids(12), "other");
    });
    expect(request).toHaveBeenCalledTimes(BULK_CONCURRENCY);
    expect(result.current.state).toMatchObject({ status: "running", total: 12, done: 0 });
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      for (const finish of pending.splice(0)) finish();
      await running;
    });
    expect(request).toHaveBeenCalledTimes(BULK_CONCURRENCY);
    expect(result.current.state).toEqual({
      status: "finished",
      total: 12,
      started: BULK_CONCURRENCY,
      failed: [],
      wasStopped: true,
    });
  });

  it("asks before the tab closes while refunds are running", async () => {
    const pending: (() => void)[] = [];
    const request = vi.fn<Request>(
      () =>
        new Promise((resolve) => {
          pending.push(() => {
            resolve({} as RefundResultDto);
          });
        }),
    );
    const { result } = setup(request);
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(ids(1), "other");
    });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      pending[0]?.();
      await running;
    });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
