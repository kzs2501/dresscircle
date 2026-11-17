"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RefundReason } from "@/core/statuses";
import { NetworkError, problemOf } from "@/lib/api-client";
import { organiserApi } from "@/lib/organiser-api";
import { organiserQueries } from "@/lib/queries";
import type { BatchOrder } from "@/features/organiser/domain/refund-batch";
import { newRun, type OrderOutcome, type RefundRun } from "@/features/organiser/domain/refund-run";

/** Refunds in flight at once: quick for a few hundred, and gentle on the payment provider. */
export const BULK_CONCURRENCY = 4;
/** The dashboard re-reads its orders and numbers after this many, as well as at the end. */
const REFRESH_EVERY = 10;

const describeFailure = (error: unknown) =>
  error instanceof NetworkError
    ? "The connection dropped, so we can’t tell whether it started. Retrying is safe: it can’t refund twice."
    : (problemOf(error)?.detail ?? "The refund couldn’t start.");

const WAITING: OrderOutcome = { status: "waiting" };

type Runs = Readonly<Record<number, RefundRun>>;

interface RefundRuns {
  runs: Runs;
  /** A batch the owner confirmed: its frozen orders, all asked for. */
  start: (id: number, label: string, orders: readonly BatchOrder[], reason: RefundReason) => void;
  /** Ask again for some of a batch's orders: the ones that failed, or the ones not asked for. */
  refund: (id: number, orderIds: readonly string[], reason: RefundReason) => void;
  /** Start no more; the refunds in flight finish. */
  stop: (id: number) => void;
  /** Forget a finished batch. */
  dismiss: (id: number) => void;
  isRunning: boolean;
}

const RefundRunsContext = createContext<RefundRuns | null>(null);

const updated = (runs: Runs, id: number, change: (run: RefundRun) => RefundRun): Runs => {
  const run = runs[id];
  return run ? { ...runs, [id]: change(run) } : runs;
};

/**
 * Refund batches the organiser confirmed (ADR 027), kept by the dashboard's shell rather
 * than the page that asked, so moving to another page of the dashboard doesn't stop one
 * (DC-03). Each order goes through the same endpoint as a single refund, four at once,
 * and keeps its idempotency key while an answer may have been lost, so a retry can't
 * refund it twice; once the server has refused, a retry is a new request with a new key.
 * Leaving the dashboard altogether stops what hasn't started, and while refunds run the
 * browser asks before the tab closes.
 */
export function RefundRunsProvider({
  children,
  requestRefund = organiserApi.requestRefund,
}: {
  children: ReactNode;
  requestRefund?: typeof organiserApi.requestRefund;
}) {
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<Runs>({});
  const keys = useRef(new Map<string, string>());
  const stopped = useRef(new Set<number>());
  // Leaving the dashboard altogether: start nothing more.
  const hasLeft = useRef(false);
  useEffect(() => {
    hasLeft.current = false;
    return () => {
      hasLeft.current = true;
    };
  }, []);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: organiserQueries.ordersAll() });
    void queryClient.invalidateQueries({ queryKey: organiserQueries.metricsAll() });
  }, [queryClient]);

  const runPass = useCallback(
    async (id: number, orderIds: readonly string[], reason: RefundReason) => {
      stopped.current.delete(id);
      const waiting: Record<string, OrderOutcome> = Object.fromEntries(orderIds.map((orderId) => [orderId, WAITING]));
      setRuns((current) =>
        updated(current, id, (run) => ({
          ...run,
          reason,
          wasStopped: false,
          pass: { total: orderIds.length, done: 0 },
          outcomes: { ...run.outcomes, ...waiting },
        })),
      );
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (!hasLeft.current && !stopped.current.has(id) && next < orderIds.length) {
          const orderId = orderIds[next++];
          if (orderId === undefined) break;
          const key = keys.current.get(orderId) ?? crypto.randomUUID();
          keys.current.set(orderId, key);
          let outcome: OrderOutcome;
          try {
            await requestRefund(orderId, reason, key);
            keys.current.delete(orderId);
            outcome = { status: "started" };
          } catch (error) {
            // The server answered: a retry is a new request. A lost answer keeps its key.
            if (!(error instanceof NetworkError)) keys.current.delete(orderId);
            outcome = { status: "failed", message: describeFailure(error) };
          }
          done += 1;
          const answered = done;
          setRuns((current) =>
            updated(current, id, (run) => ({
              ...run,
              outcomes: { ...run.outcomes, [orderId]: outcome },
              pass: run.pass && { ...run.pass, done: answered },
            })),
          );
          if (done % REFRESH_EVERY === 0) refresh();
        }
      };
      await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, orderIds.length) }, worker));
      refresh();
      const wasStopped = done < orderIds.length;
      setRuns((current) => updated(current, id, (run) => ({ ...run, pass: null, wasStopped })));
    },
    [refresh, requestRefund],
  );

  const start = useCallback(
    (id: number, label: string, orders: readonly BatchOrder[], reason: RefundReason) => {
      setRuns((current) => ({ ...current, [id]: newRun(id, label, orders, reason) }));
      void runPass(
        id,
        orders.map((order) => order.id),
        reason,
      );
    },
    [runPass],
  );

  const refund = useCallback(
    (id: number, orderIds: readonly string[], reason: RefundReason) => {
      void runPass(id, orderIds, reason);
    },
    [runPass],
  );

  const stop = useCallback((id: number) => {
    stopped.current.add(id);
  }, []);

  const dismiss = useCallback((id: number) => {
    setRuns((current) =>
      current[id]?.pass ? current : Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== id)),
    );
  }, []);

  const isRunning = Object.values(runs).some((run) => run.pass !== null);
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

  const value = useMemo(
    () => ({ runs, start, refund, stop, dismiss, isRunning }),
    [runs, start, refund, stop, dismiss, isRunning],
  );
  return <RefundRunsContext value={value}>{children}</RefundRunsContext>;
}

export function useRefundRuns(): RefundRuns {
  const context = useContext(RefundRunsContext);
  if (!context) throw new Error("useRefundRuns needs a RefundRunsProvider, which the dashboard's shell gives.");
  return context;
}
