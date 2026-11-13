// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import { readingWithAnswer, readQuestion } from "./question";

/** A Friday: this week began on Monday the 9th. */
const TODAY = "2026-11-13";
const read = (text: string, today = TODAY) => readQuestion(text, CATALOG, today);
const asked = (text: string) => read(text).question;

describe("reading an organiser's question", () => {
  it.each([
    ["how much have we made?", "summary"],
    ["total revenue", "summary"],
    ["how many tickets have we sold", "summary"],
    ["how are we doing", "summary"],
    ["sales per day", "sales-over-time"],
    ["what was our busiest day", "sales-over-time"],
    ["sales this week", "sales-over-time"],
    ["which ticket type is selling best?", "ticket-types"],
    ["which tier sold fastest", "ticket-types"],
    ["how is VIP doing", "ticket-types"],
    ["how did buyers pay", "payment-mix"],
    ["how buyers paid", "payment-mix"],
    ["UPI or card?", "payment-mix"],
    ["payment methods", "payment-mix"],
    ["conversion from reservations", "funnel"],
    ["how many people dropped off", "funnel"],
    ["refunded orders", "find-orders"],
    ["any failed payments?", "find-orders"],
    ["orders from priya@example.com", "find-orders"],
    ["write a poem", "unsupported"],
  ] as const)("reads %j as %s", (text, intent) => {
    expect(asked(text).intent).toBe(intent);
  });

  it.each([
    ["sales today", "2026-11-13", "2026-11-13"],
    ["sales yesterday", "2026-11-12", "2026-11-12"],
    ["sales this week", "2026-11-09", "2026-11-13"],
    ["sales last week", "2026-11-02", "2026-11-08"],
    ["sales in the last 7 days", "2026-11-07", "2026-11-13"],
    ["sales over the past 30 days", "2026-10-15", "2026-11-13"],
    ["sales this month", "2026-11-01", "2026-11-13"],
    ["sales last month", "2026-10-01", "2026-10-31"],
    ["sales in October", "2026-10-01", "2026-10-31"],
    ["sales in december", "2025-12-01", "2025-12-31"],
    ["sales in March 2026", "2026-03-01", "2026-03-31"],
  ])("reads the period in %j", (text, from, to) => {
    expect(asked(text)).toMatchObject({ from, to });
  });

  it("ends a period that runs past today today, and crosses a new year", () => {
    expect(asked("refunds in November")).toMatchObject({ from: "2026-11-01", to: "2026-11-13" });
    expect(read("sales last month", "2027-01-04").question).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(read("sales last week", "2027-01-04").question).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("reads statuses and payment methods as the orders' filters", () => {
    expect(asked("refunded UPI orders last week")).toMatchObject({
      intent: "find-orders",
      statuses: ["refunded"],
      method: "upi",
      from: "2026-11-02",
      to: "2026-11-08",
    });
    expect(asked("failed or expired orders")).toMatchObject({ statuses: ["failed", "expired"] });
    expect(asked("paid orders by card")).toMatchObject({ statuses: ["paid", "fulfilled"], method: "card" });
  });

  it("finds an event by the words of its name", () => {
    expect(asked("refunds for Night Market Jazz")).toMatchObject({ event: "night-market-jazz" });
    expect(asked("how is the summit selling?")).toMatchObject({ event: "frontend-systems-summit" });
    expect(asked("ceramics ticket types")).toMatchObject({ event: "open-studio-ceramics", intent: "ticket-types" });
    // Just an event: how it's doing.
    expect(asked("Monsoon Strings")).toMatchObject({ event: "monsoon-strings", intent: "summary" });
  });

  it("doesn't guess between events, or from words every name shares", () => {
    expect(asked("sales for the night")).toMatchObject({ event: null });
    expect(asked("sales for the festival")).toMatchObject({ event: null });
  });

  it("names a buyer or an order to look for", () => {
    expect(asked("orders from priya@example.com")).toMatchObject({ search: "priya@example.com" });
    expect(asked("what happened to ord_a1b2c3")).toMatchObject({ intent: "find-orders", search: "ord_a1b2c3" });
  });

  it("hands back the words it can't place, for an engine to read the whole question", () => {
    expect(read("which shows are doing well?")).toMatchObject({ hasIntent: true, unknownWords: ["shows", "well"] });
    expect(read("write a poem")).toMatchObject({ hasIntent: false, unknownWords: ["write", "poem"] });
    expect(read("refunded orders for Night Market Jazz this week")).toMatchObject({
      hasIntent: true,
      unknownWords: [],
    });
  });
});

describe("an engine's reading with the rules' on top", () => {
  const engine = {
    intent: "find-orders" as const,
    event: "night-market-jazz",
    from: "2026-11-07",
    to: "2026-11-13",
    statuses: ["refunded" as const],
    method: null,
    search: null,
    refundReason: null,
    notApplied: [],
  };

  it("keeps the rules' exact period, statuses, method and buyer, and the engine's kind and event", () => {
    expect(readingWithAnswer(read("did anyone ask for their money back this week by UPI?"), engine)).toEqual({
      ...engine,
      from: "2026-11-09",
      to: "2026-11-13",
      method: "upi",
    });
  });

  it("takes the engine's where the rules found nothing", () => {
    expect(readingWithAnswer(read("money back for the jazz night"), engine)).toEqual(engine);
  });

  it("keeps the rules' event when the engine names none, and the engine's statuses when the rules found none", () => {
    expect(
      readingWithAnswer(read("how is the summit going?"), { ...engine, event: null, statuses: ["failed"] }),
    ).toMatchObject({ event: "frontend-systems-summit", statuses: ["failed"] });
  });
});

describe("a request to refund, told from a question about refunds", () => {
  it.each([
    ["refund every order for Night Market Jazz", "night-market-jazz"],
    ["Refund all orders for Lakeside Lights from yesterday", "lakeside-lights"],
    ["please refund the orders for the summit", "frontend-systems-summit"],
    ["can you refund the jazz night orders, the show was cancelled", "night-market-jazz"],
    ["issue refunds for Monsoon Strings", "monsoon-strings"],
    ["go ahead and refund the UPI orders from last week", null],
  ])("reads %j as a request to refund", (text, event) => {
    expect(asked(text)).toMatchObject({ intent: "refund-orders", event, statuses: [] });
  });

  it.each([
    "how many refunds?",
    "refunded orders",
    "refunds this week",
    "who asked for a refund",
    "show refunded UPI orders",
  ])("reads %j as a question, not a request", (text) => {
    expect(asked(text)).toMatchObject({ intent: "find-orders" });
  });

  it("reads the period, method and buyer of a request like any other", () => {
    expect(asked("refund the UPI orders from last week")).toMatchObject({
      intent: "refund-orders",
      method: "upi",
      from: "2026-11-02",
      to: "2026-11-08",
    });
    expect(asked("refund the orders from priya@example.com")).toMatchObject({
      intent: "refund-orders",
      search: "priya@example.com",
    });
  });

  it.each([
    ["refund every order for the jazz night, the show was cancelled", "event_changed"],
    ["refund Monsoon Strings, it's been postponed", "event_changed"],
    ["refund the duplicate orders from priya@example.com", "duplicate"],
    ["refund the orders from priya@example.com, she asked", "requested_by_customer"],
    ["refund the orders from priya@example.com", null],
  ])("reads why from %j", (text, reason) => {
    expect(asked(text).refundReason).toBe(reason);
  });

  it("keeps a request to refund, and its reason, whatever an engine made of them", () => {
    const engineRead = {
      intent: "find-orders" as const,
      event: "night-market-jazz",
      from: null,
      to: null,
      statuses: [],
      method: null,
      search: null,
      refundReason: null,
      notApplied: [],
    };
    expect(readingWithAnswer(read("refund the jazz night orders, cancelled sadly"), engineRead)).toMatchObject({
      intent: "refund-orders",
      refundReason: "event_changed",
    });
  });
});
