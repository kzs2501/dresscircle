// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSlidingWindowStore } from "./sliding-window";

const PER_MINUTE = { limit: 10, windowMs: 60_000 };

describe("a sliding-window store of many clients (DC-08)", () => {
  it("keeps holding back a busy client however many new clients arrive", () => {
    let now = 0;
    const store = createSlidingWindowStore(() => now);
    for (let i = 0; i < 10; i++) expect(store.take("busy", PER_MINUTE).isAllowed).toBe(true);
    expect(store.take("busy", PER_MINUTE).isAllowed).toBe(false);
    now += 1_000;
    // A crowd of new clients, each asking once: more than the store remembers.
    for (let i = 0; i < 1_500; i++) store.take(`crowd-${String(i)}`, PER_MINUTE);
    expect(store.take("busy", PER_MINUTE).isAllowed).toBe(false);
  });

  it("forgets first a client whose requests have all aged out", () => {
    let now = 0;
    const store = createSlidingWindowStore(() => now);
    for (let i = 0; i < 10; i++) store.take("long-ago", PER_MINUTE);
    now += 120_000;
    for (let i = 0; i < 10; i++) store.take("busy", PER_MINUTE);
    for (let i = 0; i < 1_000; i++) store.take(`crowd-${String(i)}`, PER_MINUTE);
    // "busy" is still held back; "long-ago" had nothing left to remember.
    expect(store.take("busy", PER_MINUTE).isAllowed).toBe(false);
  });
});
