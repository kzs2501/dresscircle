// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OrderRowDto, OrganiserEventDto } from "@/contract/dto";
import { questionWith } from "@/features/organiser/testing/answer-fixtures";
import {
  batchFrom,
  describeBatch,
  MAX_REFUND_BATCH,
  needsTypingToConfirm,
  refundCandidatesFilter,
} from "./refund-batch";

const event = (slug: string, canRefund: boolean): OrganiserEventDto => ({
  slug,
  name: slug,
  startsAt: "2027-02-06T20:00:00+05:30",
  timeZone: "Asia/Kolkata",
  currency: "INR",
  venue: "Venue",
  city: "Goa",
  permissions: canRefund ? ["orders:read", "orders:refund"] : ["orders:read"],
});
const EVENTS = [event("night-market-jazz", true), event("someone-elses", false)];

let next = 0;
const row = (fields: Partial<OrderRowDto> = {}): OrderRowDto => ({
  id: `ord_${String(++next)}`,
  eventSlug: "night-market-jazz",
  eventName: "Night Market Jazz",
  createdAt: "2026-11-10T10:00:00+05:30",
  buyerName: "Priya Shah",
  buyerEmail: "priya@example.com",
  ticketCount: 2,
  totalMinor: 800_000,
  currency: "INR",
  status: "fulfilled",
  paymentMethod: "upi",
  refundStatus: null,
  ...fields,
});

describe("the orders a refund would cover", () => {
  it("asks for fulfilled orders only, with the request's own filters", () => {
    expect(
      refundCandidatesFilter(
        questionWith({ intent: "refund-orders", event: "night-market-jazz", method: "upi", from: "2026-11-09" }),
      ),
    ).toMatchObject({ event: "night-market-jazz", method: "upi", from: "2026-11-09", status: ["fulfilled"] });
  });

  it("covers fulfilled orders not yet refunding, and says how much goes back", () => {
    const batch = batchFrom([row(), row({ totalMinor: 400_000 }), row({ status: "paid" })], EVENTS, { hasMore: false });
    expect(batch).toMatchObject({
      alreadyRefunding: 0,
      notAllowed: 0,
      totalMinor: 1_200_000,
      currency: "INR",
      isTooMany: false,
    });
    expect(batch.orders).toHaveLength(2);
    expect(batch.orders[0]).toEqual({
      id: expect.any(String) as string,
      buyerName: "Priya Shah",
      eventName: "Night Market Jazz",
      totalMinor: 800_000,
      currency: "INR",
    });
  });

  it("leaves out, and counts, orders already refunding and events this account can't refund", () => {
    const batch = batchFrom(
      [
        row(),
        row({ refundStatus: "pending" }),
        row({ refundStatus: "succeeded" }),
        row({ eventSlug: "someone-elses" }),
      ],
      EVENTS,
      { hasMore: false },
    );
    expect(batch).toMatchObject({ alreadyRefunding: 2, notAllowed: 1 });
    expect(batch.orders).toHaveLength(1);
  });

  it("is too many past the most a batch may hold, or when there were more than were read", () => {
    const many = Array.from({ length: MAX_REFUND_BATCH + 1 }, () => row());
    expect(batchFrom(many, EVENTS, { hasMore: false }).isTooMany).toBe(true);
    expect(batchFrom(many.slice(0, MAX_REFUND_BATCH), EVENTS, { hasMore: false }).isTooMany).toBe(false);
    expect(batchFrom([row()], EVENTS, { hasMore: true }).isTooMany).toBe(true);
  });

  it("is empty, with no currency, when nothing can be refunded", () => {
    expect(batchFrom([], EVENTS, { hasMore: false })).toEqual({
      orders: [],
      alreadyRefunding: 0,
      notAllowed: 0,
      totalMinor: 0,
      currency: null,
      isTooMany: false,
    });
  });

  it("asks for the number to be typed from twenty orders", () => {
    expect(needsTypingToConfirm(19)).toBe(false);
    expect(needsTypingToConfirm(20)).toBe(true);
  });

  it("says what a batch would do before anything is done, and what was left out", () => {
    const period = { from: "2026-11-09", to: "2026-11-13" };
    const two = batchFrom([row(), row({ totalMinor: 400_000 })], EVENTS, { hasMore: false });
    expect(describeBatch(two, period, "Night Market Jazz")).toEqual({
      sentence: "2 orders for Night Market Jazz, 9 to 13 Nov 2026, can be refunded: ₹12,000.00 in all.",
      notes: [],
    });
    const one = batchFrom([row(), row({ refundStatus: "pending" }), row({ eventSlug: "someone-elses" })], EVENTS, {
      hasMore: false,
    });
    expect(describeBatch(one, { from: null, to: null }, undefined)).toEqual({
      sentence: "1 order can be refunded: ₹8,000.00 in all.",
      notes: [
        "1 already refunded, or with a refund on its way, is left out.",
        "1 order for an event your role can’t refund is left out.",
      ],
    });
    const many = batchFrom(
      [
        row({ refundStatus: "pending" }),
        row({ refundStatus: "succeeded" }),
        row({ eventSlug: "someone-elses" }),
        row({ eventSlug: "someone-elses" }),
      ],
      EVENTS,
      { hasMore: false },
    );
    expect(describeBatch(many, { from: "2026-11-13", to: "2026-11-13" }, "Night Market Jazz")).toEqual({
      sentence: "There are no orders for Night Market Jazz, 13 Nov 2026, that can be refunded.",
      notes: [
        "2 already refunded, or with a refund on its way, are left out.",
        "2 orders for events your role can’t refund are left out.",
      ],
    });
    expect(
      describeBatch(batchFrom([row()], EVENTS, { hasMore: true }), { from: "2026-11-09", to: null }, undefined)
        .sentence,
    ).toBe(
      "That’s more than 500 orders, 9 Nov 2026: too many at once. Narrow it down by event, date or payment method.",
    );
  });
});
