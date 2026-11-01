/**
 * What the box office is doing right now, for the home page: tickets held this minute,
 * the queue, today's sales, and the last few things that happened. It's public, so it
 * carries no ids (a hold's or an order's id is the key to it) and nobody's details, and
 * it's derived from the records, never read out of the log.
 *
 * The generated history stays out: it's lazy, and only the organisers' pages pay for it
 * (ADR 015). The crowd's purchases are in, marked as simulated.
 */
import { CATALOG_TIME_ZONE, findTier } from "@/core/catalog";
import type { ActivityKind } from "@/core/statuses";
import { zonedDate, zonedDayStart } from "@/core/time";
import type { BackendContext } from "./context";
import { isHoldLive } from "./inventory";

/** How many things the feed shows. */
export const RECENT_ACTIVITY_LIMIT = 10;

export interface ActivityEntry {
  kind: ActivityKind;
  eventSlug: string;
  tierName: string;
  quantity: number;
  atMs: number;
  /** Bought by the sandbox's crowd of other buyers, not by a visitor. */
  isSimulated: boolean;
}

export interface ActivityView {
  serverTimeMs: number;
  /** The zone "today" is counted in. */
  timeZone: string;
  heldNow: number;
  /** People in the waiting room, while a sale has one; null when none does. */
  queuing: number | null;
  soldToday: number;
  lastSaleAtMs: number | null;
  /** Newest first. */
  recent: ActivityEntry[];
}

const entriesFor = (
  kind: ActivityKind,
  items: readonly { tierId: string; quantity: number }[],
  atMs: number,
  isSimulated = false,
): ActivityEntry[] =>
  items.flatMap(({ tierId, quantity }) => {
    const found = findTier(tierId);
    return found ? [{ kind, eventSlug: found.event.slug, tierName: found.tier.name, quantity, atMs, isSimulated }] : [];
  });

/** The box office now, from what this backend has recorded. */
export function recentActivity(context: BackendContext): ActivityView {
  const nowMs = context.deps.now();
  const holds = Object.values(context.state.holds);
  const orders = Object.values(context.state.orders);
  const { liveSales } = context.state;

  const held = holds.flatMap((hold) => entriesFor("held", hold.items, hold.createdAtMs));
  // A hold that ran out without becoming an order gave its tickets back when it lapsed.
  const released = holds
    .filter((hold) => !hold.isConverted && hold.expiresAtMs <= nowMs)
    .flatMap((hold) => entriesFor("released", hold.items, hold.expiresAtMs));
  // Orders keep no paid-at time; the last change to a paid order is its payment settling.
  const sold = [
    ...orders
      .filter((order) => order.status === "paid" || order.status === "fulfilled")
      .flatMap((order) => entriesFor("sold", order.items, order.updatedAtMs)),
    ...liveSales.flatMap((sale) => entriesFor("sold", [sale], sale.atMs, true)),
  ];

  const todayStartsMs = zonedDayStart(zonedDate(nowMs, CATALOG_TIME_ZONE), CATALOG_TIME_ZONE);
  return {
    serverTimeMs: nowMs,
    timeZone: CATALOG_TIME_ZONE,
    heldNow: holds
      .filter((hold) => isHoldLive(hold, nowMs))
      .reduce((total, hold) => total + hold.items.reduce((sum, item) => sum + item.quantity, 0), 0),
    queuing: context.chaos().waitingRoom?.aheadAtJoin ?? null,
    soldToday: sold.filter((entry) => entry.atMs >= todayStartsMs).reduce((total, entry) => total + entry.quantity, 0),
    lastSaleAtMs: sold.reduce<number | null>((latest, entry) => Math.max(latest ?? 0, entry.atMs), null),
    recent: [...held, ...released, ...sold]
      .filter((entry) => entry.atMs <= nowMs)
      .sort((left, right) => right.atMs - left.atMs)
      .slice(0, RECENT_ACTIVITY_LIMIT),
  };
}
