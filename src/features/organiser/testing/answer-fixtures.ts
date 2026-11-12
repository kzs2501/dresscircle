/** A small account's numbers, for the answers' tests and the catalogue's answer stories. */
import type { OrganiserEventDto, SalesMetricsDto } from "@/contract/dto";
import type { OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";

export const EVENTS: OrganiserEventDto[] = [
  {
    slug: "night-market-jazz",
    name: "Night Market Jazz",
    startsAt: "2027-02-06T20:00:00+05:30",
    timeZone: "Asia/Kolkata",
    currency: "INR",
    venue: "Courtyard at Old Mill Lane",
    city: "Goa",
    permissions: ["orders:read"],
  },
];

export const METRICS: SalesMetricsDto = {
  currency: "INR",
  timeZone: "Asia/Kolkata",
  revenue: { grossMinor: 40_000_000, refundedMinor: 2_000_000, netMinor: 38_000_000 },
  tickets: { sold: 412, capacity: 600 },
  tiers: [
    {
      eventSlug: "night-market-jazz",
      eventName: "Night Market Jazz",
      tierId: "a",
      tierName: "Standing",
      sold: 300,
      capacity: 500,
    },
    {
      eventSlug: "night-market-jazz",
      eventName: "Night Market Jazz",
      tierId: "b",
      tierName: "VIP",
      sold: 88,
      capacity: 100,
    },
  ],
  paidOrders: 380,
  averageOrderMinor: 105_263,
  salesByDay: [
    { date: "2026-11-07", tickets: 10, revenueMinor: 1_000_000 },
    { date: "2026-11-08", tickets: 0, revenueMinor: 0 },
    { date: "2026-11-09", tickets: 52, revenueMinor: 5_200_000 },
    { date: "2026-11-10", tickets: 20, revenueMinor: 2_000_000 },
    { date: "2026-11-11", tickets: 5, revenueMinor: 500_000 },
    { date: "2026-11-12", tickets: 7, revenueMinor: 700_000 },
    { date: "2026-11-13", tickets: 6, revenueMinor: 600_000 },
  ],
  funnel: { holds: 1_200, orders: 500, paid: 380, fulfilled: 360 },
  paymentMethods: [
    { method: "card", orders: 232 },
    { method: "upi", orders: 148 },
    { method: "razorpay", orders: 0 },
  ],
  webhookLag: { p50Ms: 400, p95Ms: 1_200, samples: 380 },
};

/** A question with nothing filled in but what's given. */
export const questionWith = (fields: Partial<OrganiserQuestion>): OrganiserQuestion => ({
  intent: "summary",
  event: null,
  from: null,
  to: null,
  statuses: [],
  method: null,
  search: null,
  notApplied: [],
  ...fields,
});
