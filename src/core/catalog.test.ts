// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG, findEvent, getEvent } from "./catalog";
import { ORGANISATIONS } from "./organisations";

describe("catalogue", () => {
  it("has unique ids, and baselines within capacity", () => {
    const tiers = CATALOG.flatMap((event) => event.tiers);
    expect(new Set(tiers.map((tier) => tier.id)).size).toBe(tiers.length);
    for (const tier of tiers) expect(tier.baselineSold).toBeLessThan(tier.capacity);
  });

  it("gives every event an organiser that exists", () => {
    const organisationIds: string[] = ORGANISATIONS.map((organisation) => organisation.id);
    for (const event of CATALOG) expect(organisationIds).toContain(event.organiserId);
  });

  it("sells every event in its organiser's currency, so the organiser's revenue is one sum", () => {
    for (const event of CATALOG) {
      expect(ORGANISATIONS.find((organisation) => organisation.id === event.organiserId)?.currency).toBe(
        event.currency,
      );
    }
  });

  // The sandbox remembers sold seats by seat id alone, so two halls sharing an id would
  // share a seat: selling it at one event would sell it at the other.
  it("gives every seat in every hall an id no other hall uses", () => {
    const seatIds = CATALOG.flatMap((event) =>
      event.seating.kind === "reserved" ? event.seating.plan.seats.map((seat) => seat.id) : [],
    );
    expect(CATALOG.filter((event) => event.seating.kind === "reserved").length).toBeGreaterThan(1);
    expect(new Set(seatIds).size).toBe(seatIds.length);
  });

  it("seats every reserved tier in its own hall", () => {
    for (const event of CATALOG) {
      if (event.seating.kind !== "reserved") continue;
      const tierIds = new Set(event.tiers.map((tier) => tier.id));
      for (const seat of event.seating.plan.seats) expect(tierIds, event.slug).toContain(seat.tierId);
    }
  });

  // "Sold today" and the box office's day are counted in one zone.
  it("holds every event in one time zone", () => {
    expect(new Set(CATALOG.map((event) => event.timeZone))).toEqual(new Set(["Asia/Kolkata"]));
  });

  it("finds events by slug, and throws only from getEvent", () => {
    expect(findEvent("night-market-jazz")?.name).toBe("Night Market Jazz");
    expect(findEvent("nope")).toBeUndefined();
    expect(() => getEvent("nope")).toThrow();
  });
});
