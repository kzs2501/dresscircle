// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";
import { EVENTS, METRICS, questionWith } from "@/features/organiser/testing/answer-fixtures";
import { answerFor, formatPeriod, needsOf, ordersFilterFor } from "./answers";

const question = questionWith;
const answer = (fields: Partial<OrganiserQuestion>, data: Partial<Parameters<typeof answerFor>[1]> = {}) =>
  answerFor(question(fields), { events: EVENTS, metrics: METRICS, ...data });

describe("answers from the dashboard's own numbers", () => {
  it("sums up an event's sales, and links to its dashboard", () => {
    expect(answer({ event: "night-market-jazz" })).toEqual({
      sentence: "Night Market Jazz has sold 412 of 600 tickets (69%): ₹3,80,000.00 net from 380 paid orders.",
      visual: { kind: "none" },
      source: { kind: "dashboard", eventSlug: "night-market-jazz" },
      notes: [],
    });
    expect(answer({})?.sentence).toMatch(/^Across your events, you’ve sold 412 of 600/u);
  });

  it("adds up sales over a period, defaulting to the last seven days, and names the busiest day", () => {
    const week = answer({ intent: "sales-over-time" });
    expect(week?.sentence).toBe(
      "Across your events, 7 to 13 Nov 2026: 100 tickets, ₹1,00,000.00. The busiest day was 9 Nov 2026, with 52.",
    );
    expect(week?.visual).toMatchObject({ kind: "sales-chart", metrics: { salesByDay: METRICS.salesByDay } });
    const twoDays = answer({ intent: "sales-over-time", from: "2026-11-12", to: "2026-11-13" });
    expect(twoDays?.sentence).toBe(
      "Across your events, 12 to 13 Nov 2026: 13 tickets, ₹13,000.00. The busiest day was 12 Nov 2026, with 7.",
    );
    expect(answer({ intent: "sales-over-time", from: "2026-11-08", to: "2026-11-08" })?.sentence).toBe(
      "Across your events, 8 Nov 2026: no tickets sold.",
    );
  });

  it("says how far back sales by day go, when asked about before then", () => {
    expect(answer({ intent: "sales-over-time", from: "2026-10-01", to: "2026-11-13" })?.notes).toEqual([
      "Sales by day go back to 7 Nov 2026.",
    ]);
  });

  it("names the ticket type selling best by share, and says why not by speed", () => {
    expect(answer({ intent: "ticket-types" })).toMatchObject({
      sentence: "Selling best, as a share of its tickets: VIP (Night Market Jazz), 88% (88 of 100).",
      visual: { kind: "ticket-types", tiers: [{ tierName: "VIP" }, { tierName: "Standing" }] },
      notes: ["By share sold so far: sales by ticket type aren’t kept day by day."],
    });
    expect(answer({ intent: "ticket-types", event: "night-market-jazz" })?.sentence).toContain("tickets: VIP, 88%");
  });

  it("says how buyers paid, leaving out a method nobody used", () => {
    expect(answer({ intent: "payment-mix" })).toMatchObject({
      sentence: "Of 380 paid orders, 61% by card, 39% by UPI.",
      visual: { kind: "shares", items: [{ label: "by card" }, { label: "by UPI" }] },
    });
  });

  it("walks the funnel from reservation to ticket", () => {
    expect(answer({ intent: "funnel" })?.sentence).toBe(
      "Of 1,200 reservations, 500 became orders (42%), 380 were paid (32%), 360 have tickets, not refunded (30%).",
    );
  });

  it("says when what's asked can't be cut to a period", () => {
    expect(answer({ intent: "payment-mix", from: "2026-11-09" })?.notes).toEqual([
      "This can’t be split by date yet, so it’s every sale so far.",
    ]);
  });

  it("counts orders, says what they are, and links to the table filtered to them", () => {
    const refunded = question({
      intent: "find-orders",
      event: "night-market-jazz",
      statuses: ["refunded"],
      method: "upi",
      from: "2026-11-09",
      to: "2026-11-13",
    });
    expect(answerFor(refunded, { events: EVENTS, orderCount: 23 })).toEqual({
      sentence: "23 refunded orders paid by UPI for Night Market Jazz, 9 to 13 Nov 2026.",
      visual: { kind: "none" },
      source: { kind: "orders", filters: ordersFilterFor(refunded), count: 23 },
      notes: [],
    });
    expect(answer({ intent: "find-orders", statuses: ["failed", "expired"] }, { orderCount: 1 })?.sentence).toBe(
      "1 failed or expired order.",
    );
    expect(answer({ intent: "find-orders", search: "priya@example.com" }, { orderCount: 2 })?.sentence).toBe(
      "2 orders, matching “priya@example.com”.",
    );
  });

  it("asks for the numbers each question needs, and waits for them", () => {
    expect(needsOf(question({ event: "night-market-jazz" }))).toEqual({
      kind: "metrics",
      eventSlug: "night-market-jazz",
    });
    expect(needsOf(question({ intent: "find-orders", statuses: ["refunded"] }))).toMatchObject({
      kind: "orders",
      filters: { status: ["refunded"] },
    });
    expect(answerFor(question({}), { events: EVENTS })).toBeNull();
    expect(answerFor(question({ intent: "find-orders" }), { events: EVENTS })).toBeNull();
  });

  it("is honest about what it can't answer, and about nothing yet", () => {
    expect(answer({ intent: "unsupported" })?.sentence).toMatch(/^I can answer questions about your sales/u);
    const empty = { ...METRICS, paidOrders: 0, funnel: { holds: 0, orders: 0, paid: 0, fulfilled: 0 }, salesByDay: [] };
    expect(answer({ intent: "payment-mix" }, { metrics: empty })?.sentence).toBe(
      "Across your events: no paid orders yet.",
    );
    expect(answer({ intent: "funnel" }, { metrics: empty })?.sentence).toBe("Across your events: no reservations yet.");
    expect(answer({ intent: "sales-over-time" }, { metrics: empty })?.sentence).toBe("No sales are recorded yet.");
    expect(answer({ intent: "ticket-types" }, { metrics: { ...METRICS, tiers: [] } })?.sentence).toBe(
      "There are no ticket types to compare.",
    );
  });

  it("says a period plainly", () => {
    expect(formatPeriod("2026-11-13", "2026-11-13")).toBe("13 Nov 2026");
    expect(formatPeriod("2026-11-06", "2026-11-12")).toBe("6 to 12 Nov 2026");
    expect(formatPeriod("2026-10-28", "2026-11-03")).toBe("28 Oct to 3 Nov 2026");
    expect(formatPeriod("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 to 3 Jan 2027");
  });

  it("says one of everything in the singular, and an empty stretch plainly", () => {
    const one = {
      ...METRICS,
      paidOrders: 1,
      salesByDay: [{ date: "2026-11-13", tickets: 1, revenueMinor: 50_000 }],
      paymentMethods: [{ method: "upi" as const, orders: 1 }],
    };
    expect(answer({ intent: "sales-over-time" }, { metrics: one })?.sentence).toBe(
      "Across your events, 7 to 13 Nov 2026: 1 ticket, ₹500.00. The busiest day was 13 Nov 2026, with 1.",
    );
    expect(answer({}, { metrics: one })?.sentence).toMatch(/from 1 paid order\.$/u);
    expect(answer({ intent: "payment-mix" }, { metrics: one })?.sentence).toBe("Of 1 paid order, 100% by UPI.");
    expect(answer({ intent: "sales-over-time", from: "2026-01-01", to: "2026-01-31" })).toMatchObject({
      sentence: "Across your events, 1 to 31 Jan 2026: no tickets sold.",
      visual: { kind: "none" },
    });
  });

  it("counts orders from a period open at either end", () => {
    expect(answer({ intent: "find-orders", from: "2026-11-09" }, { orderCount: 4 })?.sentence).toBe(
      "4 orders, 9 Nov 2026.",
    );
    expect(answer({ intent: "find-orders", to: "2026-11-09" }, { orderCount: 4 })?.sentence).toBe(
      "4 orders, 9 Nov 2026.",
    );
  });

  it("puts a ticket type with no tickets last, and asks for every event's numbers when none is named", () => {
    const comp = {
      eventSlug: "night-market-jazz",
      eventName: "Night Market Jazz",
      tierId: "c",
      tierName: "Comp",
      sold: 0,
      capacity: 0,
    };
    const tiers = [...METRICS.tiers, comp];
    const ranked = answer({ intent: "ticket-types" }, { metrics: { ...METRICS, tiers } })?.visual;
    expect(ranked).toMatchObject({ tiers: [{ tierName: "VIP" }, { tierName: "Standing" }, { tierName: "Comp" }] });
    expect(needsOf(question({}))).toEqual({ kind: "metrics", eventSlug: undefined });
  });
});
