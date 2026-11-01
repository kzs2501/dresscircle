import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saveTickets, type WalletTicket } from "@/lib/wallet";
import { NextEvent, nextEventOf } from "./next-event";

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

// One wallet for the whole file, so these run in order: empty, then one ticket, then two.
describe("on the home page", () => {
  it("says nothing on a device with no tickets", async () => {
    const { container } = render(<NextEvent />);
    // Give the wallet time to be read, then check it stayed empty.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("names the event, when and where, and links to its ticket", async () => {
    await saveTickets([ticket("night-market-jazz", "2027-02-06T19:00:00+05:30", { eventName: "Night Market Jazz" })]);
    render(<NextEvent />);
    expect(await screen.findByRole("heading", { name: "Your next event" })).toBeInTheDocument();
    expect(screen.getByText("Night Market Jazz")).toBeInTheDocument();
    expect(screen.getByText(/Hall, Pune/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the ticket" })).toHaveAttribute("href", "/tickets");
  });

  it("counts the tickets for that event", async () => {
    await saveTickets([
      ticket("night-market-jazz", "2027-02-06T19:00:00+05:30", { eventName: "Night Market Jazz", code: "second" }),
    ]);
    render(<NextEvent />);
    expect(await screen.findByRole("link", { name: "Open the 2 tickets" })).toHaveAttribute("href", "/tickets");
  });
});
