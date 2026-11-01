/**
 * The box office now, from the database: the server's side of `recentActivity`
 * (`domain/activity.ts`), with the same rules. Each read is small and indexed, and the
 * answer is cached at the edge for a few seconds, so however many home pages poll it,
 * the database sees about one read every five seconds.
 */
import { and, desc, inArray, lte, ne, sql } from "drizzle-orm";
import { CATALOG_TIME_ZONE, findTier } from "@/core/catalog";
import type { LineItem } from "@/core/ticketing";
import { zonedDate, zonedDayStart } from "@/core/time";
import { RECENT_ACTIVITY_LIMIT, type ActivityEntry, type ActivityView } from "@/backend/domain/activity";
import type { ActivityKind } from "@/core/statuses";
import type { Database } from "./db";
import { holds, orders } from "./schema";

const SOLD_STATUSES = ["paid", "fulfilled"] as const;

const entriesFor = (kind: ActivityKind, items: readonly LineItem[], at: Date): ActivityEntry[] =>
  items.flatMap(({ tierId, quantity }) => {
    const found = findTier(tierId);
    return found
      ? [
          {
            kind,
            eventSlug: found.event.slug,
            tierName: found.tier.name,
            quantity,
            atMs: at.getTime(),
            isSimulated: false,
          },
        ]
      : [];
  });

export async function recentActivity(db: Database, nowMs: number): Promise<ActivityView> {
  const now = new Date(nowMs);
  const todayStarts = new Date(zonedDayStart(zonedDate(nowMs, CATALOG_TIME_ZONE), CATALOG_TIME_ZONE));
  const sold = and(inArray(orders.status, SOLD_STATUSES), lte(orders.updatedAt, now));

  const [heldNow, soldToday, lastSale, recentHolds, lapsedHolds, recentSales] = await Promise.all([
    // `sum` is a bigint, which the driver returns as a string.
    db.execute<{ quantity: string | null }>(sql`
      SELECT sum((item->>'quantity')::int) AS quantity
      FROM ${holds}, jsonb_array_elements(${holds.items}) AS item
      WHERE ${holds.status} = 'active' AND ${holds.expiresAt} > ${now.toISOString()}::timestamptz`),
    db.execute<{ quantity: string | null }>(sql`
      SELECT sum((item->>'quantity')::int) AS quantity
      FROM ${orders}, jsonb_array_elements(${orders.items}) AS item
      WHERE ${orders.status} IN ('paid', 'fulfilled')
        AND ${orders.updatedAt} >= ${todayStarts.toISOString()}::timestamptz
        AND ${orders.updatedAt} <= ${now.toISOString()}::timestamptz`),
    db.select({ at: orders.updatedAt }).from(orders).where(sold).orderBy(desc(orders.updatedAt)).limit(1),
    db
      .select({ items: holds.items, at: holds.createdAt })
      .from(holds)
      .where(lte(holds.createdAt, now))
      .orderBy(desc(holds.createdAt))
      .limit(RECENT_ACTIVITY_LIMIT),
    // A hold that ran out without becoming an order gave its tickets back when it lapsed.
    db
      .select({ items: holds.items, at: holds.expiresAt })
      .from(holds)
      .where(and(ne(holds.status, "converted"), lte(holds.expiresAt, now)))
      .orderBy(desc(holds.expiresAt))
      .limit(RECENT_ACTIVITY_LIMIT),
    db
      .select({ items: orders.items, at: orders.updatedAt })
      .from(orders)
      .where(sold)
      .orderBy(desc(orders.updatedAt))
      .limit(RECENT_ACTIVITY_LIMIT),
  ]);

  return {
    serverTimeMs: nowMs,
    timeZone: CATALOG_TIME_ZONE,
    heldNow: Number(heldNow[0]?.quantity ?? 0),
    // The server has no waiting room.
    queuing: null,
    soldToday: Number(soldToday[0]?.quantity ?? 0),
    lastSaleAtMs: lastSale[0]?.at.getTime() ?? null,
    recent: [
      ...recentHolds.flatMap((row) => entriesFor("held", row.items, row.at)),
      ...lapsedHolds.flatMap((row) => entriesFor("released", row.items, row.at)),
      ...recentSales.flatMap((row) => entriesFor("sold", row.items, row.at)),
    ]
      .sort((left, right) => right.atMs - left.atMs)
      .slice(0, RECENT_ACTIVITY_LIMIT),
  };
}
