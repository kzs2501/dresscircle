// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getEvent } from "@/core/catalog";
import {
  describeItems,
  describePayment,
  formatAgo,
  formatCount,
  formatMonth,
  spellCount,
  formatEventDate,
  formatEventTime,
  formatMoney,
  formatSeat,
  formatSeats,
  formatWait,
} from "./format";

describe("formatting", () => {
  it("formats money from minor units, in its own currency", () => {
    expect(formatMoney(257500, "INR")).toBe("₹2,575.00");
    expect(formatMoney(112249400, "INR")).toBe("₹11,22,494.00"); // Indian digit grouping
    expect(formatMoney(34402, "USD")).toBe("$344.02");
  });

  it("shows event times in the venue's time zone", () => {
    const startsAt = "2026-12-05T11:00:00+05:30";
    expect(formatEventDate(startsAt, "Asia/Kolkata")).toBe("Sat, 5 Dec, 2026");
    expect(formatEventTime(startsAt, "Asia/Kolkata")).toBe("11:00\u00a0am");
    expect(formatEventTime(startsAt, "Europe/London")).toBe("5:30\u00a0am");
  });

  it("describes line items with their tier names", () => {
    const { tiers } = getEvent("frontend-systems-summit");
    expect(
      describeItems(tiers, [
        { tierId: "fss-general", quantity: 2 },
        { tierId: "fss-workshop", quantity: 1 },
      ]),
    ).toBe("2 × General, 1 × Workshop + General");
  });

  it("names seats from the API the way a ticket prints them", () => {
    const seat = (row: string, number: number) => ({
      id: `stalls-${row}-${number}`,
      sectionName: "Stalls",
      row,
      number,
      tierId: "ms-premium",
    });
    expect(formatSeat(seat("F", 12))).toBe("Stalls, row F, seat 12");
    expect(formatSeats([seat("F", 13), seat("F", 12)])).toBe("Stalls F12–F13");
  });

  it("counts people with Indian digit grouping", () => {
    expect(formatCount(40_000)).toBe("40,000");
    expect(formatCount(120_000)).toBe("1,20,000");
  });

  it("says how long ago the way a live feed does", () => {
    expect(formatAgo(4_000)).toBe("just now");
    expect(formatAgo(40_000)).toBe("40 s ago");
    expect(formatAgo(3 * 60_000 + 20_000)).toBe("3 min ago");
    expect(formatAgo(2 * 3_600_000)).toBe("2 h ago");
    expect(formatAgo(30 * 3_600_000)).toBe("yesterday");
    expect(formatAgo(-5_000)).toBe("just now"); // a clock a little ahead of the server's
  });

  it("names a month", () => {
    expect(formatMonth("2027-03")).toBe("March 2027");
  });

  it("spells small counts in words, as prose does, and larger ones in digits", () => {
    expect(spellCount(1)).toBe("one");
    expect(spellCount(10)).toBe("ten");
    expect(spellCount(12)).toBe("twelve");
    expect(spellCount(13)).toBe("13");
    expect(spellCount(1_500)).toBe("1,500");
  });

  it("says a wait coarsely, the way an estimate should be said", () => {
    expect(formatWait(10_000)).toBe("less than a minute");
    expect(formatWait(80_000)).toBe("about a minute");
    expect(formatWait(3 * 60_000)).toBe("about 3 minutes");
    expect(formatWait(58 * 60_000)).toBe("about an hour");
    expect(formatWait(150 * 60_000)).toBe("about 3 hours");
  });

  it("says how an order was paid", () => {
    expect(describePayment({ method: "card", last4: "4242" })).toBe("with a card ending 4242");
    expect(describePayment({ method: "card", last4: null })).toBe("by card");
    expect(describePayment({ method: "upi", last4: null })).toBe("by UPI");
  });
});
