import type { RefundReason } from "@/core/statuses";

/** Why an order is refunded, as an organiser says it: one refund or a batch. */
export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  requested_by_customer: "The buyer asked for it",
  event_changed: "The event changed",
  duplicate: "It’s a duplicate order",
  other: "Another reason",
};
