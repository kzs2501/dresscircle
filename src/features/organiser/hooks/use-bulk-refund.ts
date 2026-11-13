"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RefundReason } from "@/core/statuses";
import { NetworkError, problemOf } from "@/lib/api-client";
import { organiserApi } from "@/lib/organiser-api";
import { organiserQueries } from "@/lib/queries";

export interface RefundFailure {
  orderId: string;
  message: string;
}

export type BulkRefundState =
  | { status: "idle" }
  | { status: "running"; total: number; done: number; failed: RefundFailure[] }
  | { status: "finished"; total: number; started: number; failed: RefundFailure[]; wasStopped: boolean };

/** Refunds in flight at once: quick for a few hundred, and gentle on the payment provider. */
export const BULK_CONCURRENCY = 4;
/** The dashboard re-reads its orders and numbers after this many, as well as at the end. */
const REFRESH_EVERY = 10;

const mintIdempotencyKey = () => crypto.randomUUID();

const describeFailure = (error: unknown) =>
  error instanceof NetworkError
    ? "The connection dropped, so we can’t tell whether it started. Retrying is safe: it can’t refund twice."
    : (problemOf(error)?.detail ?? "The refund couldn’t start.");

/**
 * Refund a batch the organiser confirmed (ADR 027), one order at a time through the same
 * endpoint as a single refund, four at once. Each order keeps its idempotency key while
 * an answer may have been lost, so a retry can't refund it twice; once the server has
 * answered with a refusal, a retry is a new request with a new key, as for one refund.
 * Stop lets the refunds in flight finish and starts no more; leaving the page stops it
 * too, and while it runs, the browser asks before the tab is closed.
 */
export function useBulkRefund({ requestRefund = organiserApi.requestRefund } = {}) {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const startedCount = useRef(0);
  const isStopped = useRef(false);
  const [state, setState] = useState<BulkRefundState>({ status: "idle" });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: organiserQueries.ordersAll() });
    void queryClient.invalidateQueries({ queryKey: organiserQueries.metricsAll() });
  }, [queryClient]);

  const run = useCallback(
    async (orderIds: readonly string[], reason: RefundReason) => {
      isStopped.current = false;
      const failed: RefundFailure[] = [];
      let done = 0;
      let next = 0;
      setState({ status: "running", total: orderIds.length, done, failed });

      const worker = async () => {
        while (!isStopped.current && next < orderIds.length) {
          const orderId = orderIds[next++];
          if (orderId === undefined) break;
          const key = keys.current.get(orderId) ?? mintIdempotencyKey();
          keys.current.set(orderId, key);
          try {
            await requestRefund(orderId, reason, key);
            startedCount.current += 1;
            keys.current.delete(orderId);
          } catch (error) {
            // The server answered: a retry is a new request. A lost answer keeps its key.
            if (!(error instanceof NetworkError)) keys.current.delete(orderId);
            failed.push({ orderId, message: describeFailure(error) });
          }
          done += 1;
          setState({ status: "running", total: orderIds.length, done, failed: [...failed] });
          if (done % REFRESH_EVERY === 0) refresh();
        }
      };
      await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, orderIds.length) }, worker));
      refresh();
      setState({
        status: "finished",
        total: orderIds.length,
        started: startedCount.current,
        failed,
        wasStopped: done < orderIds.length,
      });
    },
    [refresh, requestRefund],
  );

  /** A new batch: counts start again. */
  const start = useCallback(
    (orderIds: readonly string[], reason: RefundReason) => {
      startedCount.current = 0;
      return run(orderIds, reason);
    },
    [run],
  );

  /** Only the ones that failed, adding to what has started. */
  const retryFailed = useCallback(
    (reason: RefundReason) => {
      if (state.status !== "finished") return Promise.resolve();
      return run(
        state.failed.map((failure) => failure.orderId),
        reason,
      );
    },
    [run, state],
  );

  const stop = useCallback(() => {
    isStopped.current = true;
  }, []);

  const isRunning = state.status === "running";
  useEffect(() => {
    if (!isRunning) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [isRunning]);

  useEffect(() => stop, [stop]);

  return { state, start, retryFailed, stop };
}
