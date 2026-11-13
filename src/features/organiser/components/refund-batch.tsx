"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { OrganiserEventDto } from "@/contract/dto";
import { writeOrderSearchParams } from "@/contract/queries";
import { REFUND_REASONS, type RefundReason } from "@/core/statuses";
import { formatCount, formatMoney } from "@/lib/format";
import { organiserQueries } from "@/lib/queries";
import { routes } from "@/lib/routes";
import type { OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Spinner } from "@/components/ui/spinner";
import { ordersFilterFor } from "@/features/organiser/domain/answers";
import {
  batchFrom,
  DEFAULT_REFUND_REASON,
  describeBatch,
  MAX_REFUND_BATCH,
  needsTypingToConfirm,
  refundCandidatesFilter,
  type BatchOrder,
  type RefundBatch,
} from "@/features/organiser/domain/refund-batch";
import { REFUND_REASON_LABELS } from "@/features/organiser/domain/refund-reasons";
import { useBulkRefund, type BulkRefundState } from "@/features/organiser/hooks/use-bulk-refund";

/** Orders listed in the dialog by name; the rest are counted. */
const LISTED = 10;

function ReviewDialog({
  orders,
  defaultReason,
  dialog,
  onConfirm,
}: {
  orders: readonly BatchOrder[];
  defaultReason: RefundReason;
  dialog: RefObject<HTMLDialogElement | null>;
  onConfirm: (reason: RefundReason) => void;
}) {
  const titleId = useId();
  const typedId = useId();
  const hintId = useId();
  const [reason, setReason] = useState<RefundReason>(defaultReason);
  const [typed, setTyped] = useState("");
  const count = orders.length;
  const currency = orders[0]?.currency ?? "INR";
  const total = formatMoney(
    orders.reduce((sum, order) => sum + order.totalMinor, 0),
    currency,
  );
  const isTypingNeeded = needsTypingToConfirm(count);
  const isTyped = !isTypingNeeded || typed.trim() === String(count);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-6 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          if (!isTyped) {
            event.preventDefault();
            return;
          }
          onConfirm(reason);
        }}
      >
        <h2 id={titleId} className="font-display text-lg font-semibold">
          Refund {formatCount(count)} {count === 1 ? "order" : "orders"}?
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          {total} goes back to {formatCount(count)} {count === 1 ? "buyer" : "buyers"}, each to the card or UPI account
          they paid with, and their tickets go back on sale. Door scanners refuse the old tickets once they’ve checked
          for refunds. Refunds can’t be undone.
        </p>
        <ul aria-label="The orders" className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
          {orders.slice(0, LISTED).map((order) => (
            <li key={order.id} className="flex justify-between gap-3 px-3 py-2">
              <span>
                {order.buyerName} <span className="text-ink-3">· {order.id}</span>
              </span>
              <span className="tabular-nums">{formatMoney(order.totalMinor, order.currency)}</span>
            </li>
          ))}
          {count > LISTED && <li className="px-3 py-2 text-ink-3">and {formatCount(count - LISTED)} more</li>}
        </ul>
        <label className="mt-4 block text-sm font-medium">
          Why?
          <select
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as RefundReason);
            }}
            className="mt-1 block min-h-10 w-full rounded-lg border border-line bg-paper px-3 font-normal"
          >
            {REFUND_REASONS.map((value) => (
              <option key={value} value={value}>
                {REFUND_REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {isTypingNeeded && (
          <div className="mt-4">
            <label htmlFor={typedId} className="block text-sm font-medium">
              Type {formatCount(count)} to confirm
            </label>
            <input
              id={typedId}
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
              aria-describedby={hintId}
              className="mt-1 block min-h-10 w-full rounded-lg border border-line bg-paper px-3"
            />
            <p id={hintId} className="mt-1 text-xs text-ink-3">
              A refund of {formatCount(count)} orders is a lot to undo by hand, so it waits for the number.
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
            Keep them
          </Button>
          <Button type="submit" isDisabled={!isTyped} aria-describedby={isTypingNeeded ? hintId : undefined}>
            Refund {formatCount(count)} {count === 1 ? "order" : "orders"} ({total})
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function Progress({ state, onStop, onRetry }: { state: BulkRefundState; onStop: () => void; onRetry: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "running") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Spinner className="size-4" />
        <span>
          Refunding: {formatCount(state.done)} of {formatCount(state.total)}.
        </span>
        <Button type="button" variant="secondary" onClick={onStop}>
          Stop
        </Button>
      </div>
    );
  }
  const { started, failed, wasStopped, total } = state;
  const notAsked = total - started - failed.length;
  return (
    <div className="space-y-3">
      <p>
        {started > 0
          ? `Refunds started for ${formatCount(started)} ${started === 1 ? "order" : "orders"}. ${started === 1 ? "It’s" : "They’re"} refunded once the payment provider confirms.`
          : "No refunds started."}
        {wasStopped && notAsked > 0
          ? ` Stopped, so the other ${formatCount(notAsked)} ${notAsked === 1 ? "wasn’t" : "weren’t"} refunded.`
          : ""}
      </p>
      {failed.length > 0 && (
        <Notice tone="bad" title={`${formatCount(failed.length)} didn’t go through`}>
          <ul className="mt-1 space-y-1">
            {failed.slice(0, LISTED).map((failure) => (
              <li key={failure.orderId}>
                {failure.orderId}: {failure.message}
              </li>
            ))}
            {failed.length > LISTED && <li>and {formatCount(failed.length - LISTED)} more</li>}
          </ul>
          <Button type="button" variant="secondary" className="mt-3" onClick={onRetry}>
            Retry the {formatCount(failed.length)} that failed
          </Button>
        </Notice>
      )}
    </div>
  );
}

/**
 * The answer to a request to refund (ADR 027): what would be refunded, said before
 * anything is, and a review the organiser must confirm. The dialog lists exactly the
 * orders that will be refunded, frozen as it opens; from 20 orders, the organiser types
 * the number first. Then the batch's progress, with Stop, and what didn't go through,
 * with Retry. Pure apart from its own dialog's state, so the catalogue can show each step.
 */
export function RefundBatchView({
  batch,
  question,
  events,
  isFailed = false,
  state,
  onConfirm,
  onStop,
  onRetry,
}: {
  batch: RefundBatch | null;
  question: OrganiserQuestion;
  events: readonly OrganiserEventDto[];
  isFailed?: boolean;
  state: BulkRefundState;
  onConfirm: (orders: readonly BatchOrder[], reason: RefundReason) => void;
  onStop: () => void;
  onRetry: (reason: RefundReason) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  // The orders the dialog lists, and so the orders refunded: a copy taken as it opens.
  const [frozen, setFrozen] = useState<{ orders: readonly BatchOrder[]; opened: number } | null>(null);
  const [reason, setReason] = useState<RefundReason>(question.refundReason ?? DEFAULT_REFUND_REASON);
  const canRefund = events.some((event) => event.permissions.includes("orders:refund"));
  const eventName = events.find((event) => event.slug === question.event)?.name;

  // Once confirmed, the dialog is gone: focus goes to the progress that replaced it.
  const isActive = state.status !== "idle";
  useEffect(() => {
    if (isActive) progress.current?.focus();
  }, [isActive]);

  if (!canRefund) {
    return <p>Your role can’t refund orders; an owner of this organisation can.</p>;
  }
  if (!batch) {
    return isFailed ? (
      <p className="text-sm text-bad">Couldn’t load the orders for this. Check your connection and ask again.</p>
    ) : (
      <Spinner label="Finding the orders" />
    );
  }

  const { sentence, notes } = describeBatch(batch, question, eventName);
  const canReview = state.status === "idle" && !batch.isTooMany && batch.orders.length > 0;

  return (
    <div className="space-y-3">
      {/* Read live, the orders that could be refunded fall as the batch's own refunds land:
          once it has started, its progress says what's happening instead. */}
      {!isActive && <p>{sentence}</p>}
      {!isActive && notes.length > 0 && (
        <ul className="text-sm text-ink-3">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {canReview && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setFrozen((previous) => ({ orders: batch.orders, opened: (previous?.opened ?? 0) + 1 }));
            requestAnimationFrame(() => dialog.current?.showModal());
          }}
        >
          Review and refund…
        </Button>
      )}
      {frozen && (
        <ReviewDialog
          key={frozen.opened}
          orders={frozen.orders}
          defaultReason={reason}
          dialog={dialog}
          onConfirm={(chosen) => {
            setReason(chosen);
            onConfirm(frozen.orders, chosen);
          }}
        />
      )}
      <div ref={progress} tabIndex={-1} role="status" className="outline-none">
        <Progress
          state={state}
          onStop={onStop}
          onRetry={() => {
            onRetry(reason);
          }}
        />
      </div>
      <Link
        href={routes.organiserOrders(writeOrderSearchParams(ordersFilterFor(question)))}
        className="inline-block text-sm underline underline-offset-4"
      >
        Open these orders in the orders table
      </Link>
    </div>
  );
}

/** A request to refund, with the orders it covers read live and refunds run here. */
export function RefundBatchAnswer({
  question,
  events,
}: {
  question: OrganiserQuestion;
  events: readonly OrganiserEventDto[];
}) {
  const candidates = useQuery(organiserQueries.refundCandidates(refundCandidatesFilter(question), MAX_REFUND_BATCH));
  const { state, start, retryFailed, stop } = useBulkRefund();
  const batch = candidates.data ? batchFrom(candidates.data.rows, events, { hasMore: candidates.data.hasMore }) : null;
  return (
    <RefundBatchView
      batch={batch}
      question={question}
      events={events}
      isFailed={candidates.isError}
      state={state}
      onConfirm={(orders, reason) => {
        void start(
          orders.map((order) => order.id),
          reason,
        );
      }}
      onStop={stop}
      onRetry={(reason) => {
        void retryFailed(reason);
      }}
    />
  );
}

/**
 * The sentence a request to refund is answered with, for the panel's live region: said
 * once, as first read, so the batch's own refunds don't change it while its progress is
 * announced. Keyed by the question, so the next one is said too.
 */
export function RefundBatchSentence({
  question,
  events,
}: {
  question: OrganiserQuestion;
  events: readonly OrganiserEventDto[];
}) {
  const candidates = useQuery(organiserQueries.refundCandidates(refundCandidatesFilter(question), MAX_REFUND_BATCH));
  const [said, setSaid] = useState<string | null>(null);
  if (said === null && candidates.data) {
    const batch = batchFrom(candidates.data.rows, events, { hasMore: candidates.data.hasMore });
    const eventName = events.find((event) => event.slug === question.event)?.name;
    setSaid(describeBatch(batch, question, eventName).sentence);
  }
  return said;
}
