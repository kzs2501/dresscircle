// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CHAOS } from "@/backend/chaos/presets";
import { createTestBackend, purchase, START_MS, valueOf } from "@/backend/testing/fixtures";
import { RECENT_ACTIVITY_LIMIT } from "./activity";

const jazz = (quantity: number) => ({ eventSlug: "night-market-jazz", items: [{ tierId: "nmj-student", quantity }] });

describe("the box office's activity", () => {
  it("starts quiet: nothing held, nothing sold, no queue", () => {
    const { backend } = createTestBackend();
    expect(backend.getRecentActivity()).toMatchObject({
      serverTimeMs: START_MS,
      timeZone: "Asia/Kolkata",
      heldNow: 0,
      queuing: null,
      soldToday: 0,
      lastSaleAtMs: null,
      recent: [],
    });
  });

  it("counts a hold while it's live, and says it was released once it lapses", () => {
    const { backend, clock } = createTestBackend();
    const { hold } = valueOf(backend.createHold(jazz(2)));
    expect(backend.getRecentActivity()).toMatchObject({
      heldNow: 2,
      recent: [
        { kind: "held", eventSlug: "night-market-jazz", tierName: "Student standing", quantity: 2, isSimulated: false },
      ],
    });

    clock.advance(hold.expiresAtMs - START_MS);
    const lapsed = backend.getRecentActivity();
    expect(lapsed.heldNow).toBe(0);
    expect(lapsed.recent[0]).toMatchObject({ kind: "released", quantity: 2, atMs: hold.expiresAtMs });
  });

  it("counts a sale once its payment settles, today, in the box office's zone", () => {
    const { backend, clock } = createTestBackend();
    purchase(backend, { quantity: 2 });
    clock.advance(DEFAULT_CHAOS.webhookDelayMs);
    backend.deliverDue();
    const activity = backend.getRecentActivity();
    expect(activity.soldToday).toBe(2);
    expect(activity.lastSaleAtMs).toBe(START_MS + DEFAULT_CHAOS.webhookDelayMs);
    expect(activity.recent[0]).toMatchObject({ kind: "sold", eventSlug: "open-studio-ceramics", quantity: 2 });
  });

  it("starts a new day at midnight in Kolkata, not in UTC", () => {
    const { backend, clock } = createTestBackend();
    // START_MS is 15:30 in Kolkata; midnight there is 18:30 UTC.
    clock.advance(8 * 60 * 60_000 + 29 * 60_000);
    purchase(backend, { quantity: 1 });
    clock.advance(DEFAULT_CHAOS.webhookDelayMs);
    backend.deliverDue();
    expect(backend.getRecentActivity().soldToday).toBe(1);
    clock.advance(60_000);
    const tomorrow = backend.getRecentActivity();
    expect(tomorrow.soldToday).toBe(0);
    expect(tomorrow.lastSaleAtMs).not.toBeNull();
  });

  it("marks the crowd's purchases as simulated", () => {
    const { backend } = createTestBackend("busy-on-sale");
    expect(backend.runCrowdTick()).toBe(true);
    const activity = backend.getRecentActivity();
    expect(activity.soldToday).toBe(1);
    expect(activity.recent).toEqual([expect.objectContaining({ kind: "sold", quantity: 1, isSimulated: true })]);
  });

  it("counts the waiting room while a sale has one", () => {
    const { backend } = createTestBackend("flash-sale");
    expect(backend.getRecentActivity().queuing).toBe(backend.chaos().waitingRoom?.aheadAtJoin);
    expect(backend.getRecentActivity().queuing).toBeGreaterThan(0);
  });

  it("keeps only the newest few, newest first", () => {
    const { backend, clock } = createTestBackend("busy-on-sale");
    for (let i = 0; i < RECENT_ACTIVITY_LIMIT + 5; i++) {
      backend.runCrowdTick();
      clock.advance(1_000);
    }
    const { recent } = backend.getRecentActivity();
    expect(recent).toHaveLength(RECENT_ACTIVITY_LIMIT);
    expect(recent.map((entry) => entry.atMs)).toEqual([...recent.map((entry) => entry.atMs)].sort((a, b) => b - a));
  });
});
