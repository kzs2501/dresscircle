// @vitest-environment node
/**
 * Properties of a refund batch over any rows the API could return, duplicates included:
 * what the November bug hunt checked, kept. A batch lists only orders a refund can start
 * for, each once, and accounts for every distinct fulfilled order.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { OrderRowDto, OrganiserEventDto } from "@/contract/dto";
import { ORDER_STATUSES } from "@/core/statuses";
import { batchFrom, describeBatch } from "./refund-batch";

const eventOf = (slug: string, canRefund: boolean): OrganiserEventDto => ({
  slug,
  name: slug,
  startsAt: "2027-02-06T20:00:00+05:30",
  timeZone: "Asia/Kolkata",
  currency: "INR",
  venue: "Venue",
  city: "Goa",
  permissions: canRefund ? ["orders:read", "orders:refund"] : ["orders:read"],
});
const EVENTS = [eventOf("mine", true), eventOf("theirs", false)];

/** Rows that share a few ids, as pages shifting under a live sale can return. */
const rows = fc
  .array(
    fc.record({
      id: fc.constantFrom("o1", "o2", "o3", "o4", "o5", "o6"),
      eventSlug: fc.constantFrom("mine", "theirs"),
      status: fc.constantFrom(...ORDER_STATUSES),
      refundStatus: fc.constantFrom(null, "pending" as const, "succeeded" as const),
      totalMinor: fc.integer({ min: 0, max: 5_000_000 }),
    }),
    { maxLength: 30 },
  )
  .map((records) =>
    records.map((record): OrderRowDto => ({
      ...record,
      eventName: record.eventSlug,
      createdAt: "2026-11-10T10:00:00+05:30",
      buyerName: "A buyer",
      buyerEmail: "buyer@example.com",
      ticketCount: 1,
      currency: "INR",
      paymentMethod: "upi",
    })),
  );

describe("a refund batch from any rows", () => {
  it("lists each order once, only ones a refund can start for, and totals exactly those", () => {
    fc.assert(
      fc.property(rows, fc.boolean(), (read, hasMore) => {
        const batch = batchFrom(read, EVENTS, { hasMore });
        const ids = batch.orders.map((order) => order.id);
        expect(new Set(ids).size).toBe(ids.length);
        // The row each order came from: the last the API returned with its id.
        const latest = new Map(read.map((row) => [row.id, row]));
        for (const id of ids) {
          expect(latest.get(id)).toMatchObject({ eventSlug: "mine", status: "fulfilled", refundStatus: null });
        }
        expect(batch.totalMinor).toBe(batch.orders.reduce((sum, order) => sum + order.totalMinor, 0));
        const fulfilled = [...latest.values()].filter((row) => row.status === "fulfilled").length;
        expect(batch.orders.length + batch.alreadyRefunding + batch.notAllowed).toBe(fulfilled);
        expect(describeBatch(batch, { from: null, to: null }, "Mine").sentence).not.toBe("");
      }),
      { numRuns: 2_000 },
    );
  });
});
