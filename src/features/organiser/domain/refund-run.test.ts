// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BatchOrder } from "./refund-batch";
import { announcementOf, needsAttention, newRun, resultOf, summaryOf, type RefundRun } from "./refund-run";

const orders = (count: number): BatchOrder[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `o${String(index)}`,
    buyerName: "B",
    eventName: "Night Market Jazz",
    totalMinor: 1,
    currency: "INR",
  }));
const run = (count: number, fields: Partial<RefundRun> = {}): RefundRun => ({
  ...newRun(1, "Night Market Jazz", orders(count), "event_changed"),
  ...fields,
});

describe("a refund batch's outcomes", () => {
  it("counts started and failed over every pass, and orders never asked for once it's stopped", () => {
    const finished = run(6, {
      outcomes: {
        o0: { status: "started" },
        o1: { status: "started" },
        o2: { status: "failed", message: "No." },
        o3: { status: "waiting" },
      },
      wasStopped: true,
    });
    expect(summaryOf(finished)).toEqual({
      isRunning: false,
      done: 0,
      total: 0,
      started: 2,
      failed: [{ orderId: "o2", message: "No." }],
      notAsked: ["o3", "o4", "o5"],
      wasStopped: true,
    });
    expect(resultOf(summaryOf(finished))).toBe(
      "Refunds started for 2 orders. They’re refunded once the payment provider confirms. 1 didn’t go through. Stopped: 3 weren’t asked for.",
    );
    expect(needsAttention(finished)).toBe(true);
  });

  it("says nothing is unasked while a pass is still under way", () => {
    expect(summaryOf(run(4, { pass: { total: 4, done: 1 } })).notAsked).toEqual([]);
  });

  it("needs no attention once every order has started", () => {
    const done = run(2, { outcomes: { o0: { status: "started" }, o1: { status: "started" } } });
    expect(needsAttention(done)).toBe(false);
    expect(resultOf(summaryOf(done))).toBe(
      "Refunds started for 2 orders. They’re refunded once the payment provider confirms.",
    );
    expect(resultOf(summaryOf(run(1, { outcomes: { o0: { status: "started" } } })))).toBe(
      "Refunds started for 1 order. It’s refunded once the payment provider confirms.",
    );
    expect(resultOf(summaryOf(run(1, { outcomes: { o0: { status: "failed", message: "No." } } })))).toBe(
      "No refunds started. 1 didn’t go through.",
    );
  });
});

describe("what a screen reader hears (DC-09)", () => {
  it("speaks at the start, at each quarter and at the end, not at every order", () => {
    const said = new Set<string>();
    for (let done = 0; done < 28; done++) said.add(announcementOf(run(28, { pass: { total: 28, done } })));
    expect([...said]).toEqual([
      "Refunding 28 orders for Night Market Jazz.",
      "Refunding Night Market Jazz: 7 of 28 done.",
      "Refunding Night Market Jazz: 14 of 28 done.",
      "Refunding Night Market Jazz: 21 of 28 done.",
    ]);
    const ended = run(28, {
      outcomes: Object.fromEntries(orders(28).map((order) => [order.id, { status: "started" }])),
    });
    expect(announcementOf(ended)).toBe(
      "Night Market Jazz: Refunds started for 28 orders. They’re refunded once the payment provider confirms.",
    );
    expect(announcementOf(run(1, { pass: { total: 1, done: 0 } }))).toBe("Refunding 1 order for Night Market Jazz.");
  });
});
