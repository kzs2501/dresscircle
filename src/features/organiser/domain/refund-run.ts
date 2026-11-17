/**
 * A refund batch an owner confirmed, as it runs (ADR 027): the orders the review listed,
 * frozen, and what happened to each one. Everything the page says about a batch is worked
 * out from those outcomes, so a retry, a stop, or a pass that refunds the ones not asked
 * for can't leave an order unaccounted for.
 */
import type { RefundReason } from "@/core/statuses";
import { formatCount } from "@/lib/format";
import type { BatchOrder } from "./refund-batch";

export type OrderOutcome = { status: "waiting" } | { status: "started" } | { status: "failed"; message: string };

export interface RefundRun {
  /** The asked question's id: the answer this batch belongs to. */
  id: number;
  /** What it's for, in a sentence: an event's name, or "your events". */
  label: string;
  orders: readonly BatchOrder[];
  reason: RefundReason;
  /** By order id; an order with no outcome yet is waiting. */
  outcomes: Readonly<Record<string, OrderOutcome>>;
  /** The pass under way, if any: how many it asks for, and how many have answered. */
  pass: { total: number; done: number } | null;
  wasStopped: boolean;
}

export interface RefundFailure {
  orderId: string;
  message: string;
}

export interface RunSummary {
  isRunning: boolean;
  /** The pass under way: answered so far, and asked for. */
  done: number;
  total: number;
  /** Orders whose refund has started, over every pass. */
  started: number;
  failed: RefundFailure[];
  /** Orders confirmed but never asked for, because the batch was stopped first. */
  notAsked: string[];
  wasStopped: boolean;
}

export const newRun = (id: number, label: string, orders: readonly BatchOrder[], reason: RefundReason): RefundRun => ({
  id,
  label,
  orders,
  reason,
  outcomes: {},
  pass: null,
  wasStopped: false,
});

export function summaryOf(run: RefundRun): RunSummary {
  const isRunning = run.pass !== null;
  let started = 0;
  const failed: RefundFailure[] = [];
  const notAsked: string[] = [];
  for (const { id } of run.orders) {
    const outcome = run.outcomes[id] ?? { status: "waiting" };
    if (outcome.status === "started") started += 1;
    else if (outcome.status === "failed") failed.push({ orderId: id, message: outcome.message });
    else if (!isRunning) notAsked.push(id);
  }
  return {
    isRunning,
    done: run.pass?.done ?? 0,
    total: run.pass?.total ?? 0,
    started,
    failed,
    notAsked,
    wasStopped: run.wasStopped,
  };
}

const orders = (count: number) => `${formatCount(count)} ${count === 1 ? "order" : "orders"}`;

/** What became of a finished batch, in a sentence or three. */
export function resultOf(summary: RunSummary): string {
  const parts = [
    summary.started > 0
      ? `Refunds started for ${orders(summary.started)}. ${summary.started === 1 ? "It’s" : "They’re"} refunded once the payment provider confirms.`
      : "No refunds started.",
  ];
  if (summary.failed.length > 0) parts.push(`${formatCount(summary.failed.length)} didn’t go through.`);
  if (summary.notAsked.length > 0) {
    parts.push(
      `Stopped: ${formatCount(summary.notAsked.length)} ${summary.notAsked.length === 1 ? "wasn’t" : "weren’t"} asked for.`,
    );
  }
  return parts.join(" ");
}

/**
 * What a screen reader hears about a batch: when it starts, at each quarter, and how it
 * ends; never once per order, which for 500 orders would be 500 announcements (DC-09).
 */
export function announcementOf(run: RefundRun): string {
  const summary = summaryOf(run);
  if (!summary.isRunning) return `${run.label}: ${resultOf(summary)}`;
  const quarter = summary.total === 0 ? 0 : Math.min(3, Math.floor((summary.done / summary.total) * 4));
  if (quarter === 0) return `Refunding ${orders(summary.total)} for ${run.label}.`;
  return `Refunding ${run.label}: ${formatCount(Math.ceil((summary.total * quarter) / 4))} of ${formatCount(summary.total)} done.`;
}

/** A batch with something left to see: running, or with orders that failed or weren't asked for. */
export const needsAttention = (run: RefundRun) => {
  const summary = summaryOf(run);
  return summary.isRunning || summary.failed.length > 0 || summary.notAsked.length > 0;
};
