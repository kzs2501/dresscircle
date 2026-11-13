/**
 * The orders a request to refund would cover (ADR 027): what the review dialog lists and
 * what's refunded if the organiser confirms. Only fulfilled orders can be refunded, so
 * only those are asked for; orders with a refund already on its way, or done, and
 * orders of events this account can't refund, are left out and counted, so the dialog
 * can say so.
 */
import type { OrderRowDto, OrganiserEventDto } from "@/contract/dto";
import type { OrderFilters } from "@/contract/queries";
import type { CurrencyCode } from "@/core/money";
import { formatCount, formatMoney } from "@/lib/format";
import type { RefundReason } from "@/core/statuses";
import type { OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";
import { formatPeriod, ordersFilterFor } from "./answers";

/** The most orders refunded at once: past this, narrow it down. */
export const MAX_REFUND_BATCH = 500;
/** From this many, the organiser types the number to confirm. */
export const TYPE_TO_CONFIRM_FROM = 20;
export const DEFAULT_REFUND_REASON: RefundReason = "requested_by_customer";

export interface BatchOrder {
  id: string;
  buyerName: string;
  eventName: string;
  totalMinor: number;
  currency: CurrencyCode;
}

export interface RefundBatch {
  orders: BatchOrder[];
  /** Matching orders with a refund on its way, or done. */
  alreadyRefunding: number;
  /** Matching orders of events this account may not refund. */
  notAllowed: number;
  totalMinor: number;
  currency: CurrencyCode | null;
  /** More than a batch may hold. */
  isTooMany: boolean;
}

/** The orders table's filters for a request, fulfilled orders only: the only ones a refund can start for. */
export const refundCandidatesFilter = (question: OrganiserQuestion): OrderFilters => ({
  ...ordersFilterFor(question),
  status: ["fulfilled"],
});

export function batchFrom(
  rows: readonly OrderRowDto[],
  events: readonly OrganiserEventDto[],
  { hasMore }: { hasMore: boolean },
): RefundBatch {
  const refundable = new Set(
    events.filter((event) => event.permissions.includes("orders:refund")).map((event) => event.slug),
  );
  const fulfilled = rows.filter((row) => row.status === "fulfilled");
  const alreadyRefunding = fulfilled.filter((row) => row.refundStatus !== null).length;
  const notAllowed = fulfilled.filter((row) => row.refundStatus === null && !refundable.has(row.eventSlug)).length;
  const orders = fulfilled
    .filter((row) => row.refundStatus === null && refundable.has(row.eventSlug))
    .map(({ id, buyerName, eventName, totalMinor, currency }) => ({ id, buyerName, eventName, totalMinor, currency }));
  return {
    orders,
    alreadyRefunding,
    notAllowed,
    totalMinor: orders.reduce((sum, order) => sum + order.totalMinor, 0),
    currency: orders[0]?.currency ?? null,
    isTooMany: hasMore || orders.length > MAX_REFUND_BATCH,
  };
}

export const needsTypingToConfirm = (count: number) => count >= TYPE_TO_CONFIRM_FROM;

/** What a batch would do, said before anything is done: the answer to a request to refund. */
export function describeBatch(
  batch: RefundBatch,
  question: Pick<OrganiserQuestion, "from" | "to">,
  eventName: string | undefined,
): { sentence: string; notes: string[] } {
  const scope = [
    eventName ? ` for ${eventName}` : "",
    question.from || question.to
      ? `, ${formatPeriod(question.from ?? question.to ?? "", question.to ?? question.from ?? "")}`
      : "",
  ].join("");
  const notes = [
    ...(batch.alreadyRefunding > 0
      ? [
          `${formatCount(batch.alreadyRefunding)} already refunded, or with a refund on its way, ${batch.alreadyRefunding === 1 ? "is" : "are"} left out.`,
        ]
      : []),
    ...(batch.notAllowed > 0
      ? [
          `${formatCount(batch.notAllowed)} of events your role can’t refund ${batch.notAllowed === 1 ? "is" : "are"} left out.`,
        ]
      : []),
  ];
  if (batch.isTooMany) {
    return {
      sentence: `That’s more than ${formatCount(MAX_REFUND_BATCH)} orders${scope}: too many at once. Narrow it down by event, date or payment method.`,
      notes,
    };
  }
  if (batch.orders.length === 0 || batch.currency === null) {
    return { sentence: `There are no orders${scope} that can be refunded.`, notes };
  }
  const count = batch.orders.length;
  return {
    sentence: `${formatCount(count)} ${count === 1 ? "order" : "orders"}${scope} can be refunded: ${formatMoney(batch.totalMinor, batch.currency)} in all.`,
    notes,
  };
}
