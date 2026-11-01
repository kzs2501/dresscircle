// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { WalletTicket } from "@/lib/wallet";
import { nextEventOf } from "./next-event";

const ticket = (eventSlug: string, startsAt: string, extra: Partial<WalletTicket> = {}): WalletTicket => ({
  code: `${eventSlug}-${startsAt}`,
  token: "t",
  orderId: `ord_${eventSlug}`,
  eventSlug,
  eventName: eventSlug,
  startsAt,
  timeZone: "Asia/Kolkata",
  venue: "Hall",
  city: "Pune",
  attendeeName: "Asha Rao",
  tierName: "General",
  seat: null,
  ...extra,
});

describe("the next event on this device", () => {
  it("is the soonest, with how many tickets it has there", () => {
    const next = nextEventOf([
      ticket("later", "2027-05-01T19:00:00+05:30"),
      ticket("sooner", "2027-02-01T19:00:00+05:30"),
      ticket("sooner", "2027-02-01T19:00:00+05:30", { code: "second" }),
    ]);
    expect(next).toMatchObject({ ticket: { eventSlug: "sooner" }, count: 2 });
  });

  it("skips refunded tickets, and is nothing when none are left", () => {
    expect(nextEventOf([ticket("refunded", "2027-02-01T19:00:00+05:30", { isRefunded: true })])).toBeNull();
    expect(nextEventOf([])).toBeNull();
  });
});
