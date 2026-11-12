/**
 * Answers to an organiser's question, from the dashboard's own numbers (ADR 026). Pure:
 * given the question and what the API returned, the sentence, the picture and the link
 * to where the numbers came from. Every number here is the API's; the model that may
 * have read the question never sees any of them.
 */
import type { OrganiserEventDto, SalesMetricsDto } from "@/contract/dto";
import { DEFAULT_ORDER_BY, type OrderFilters } from "@/contract/queries";
import type { OrderStatus, PaymentMethod } from "@/core/statuses";
import { formatCount, formatMoney, formatPercent } from "@/lib/format";
import type { OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";

export type AnswerVisual =
  | { kind: "none" }
  | { kind: "sales-chart"; metrics: SalesMetricsDto }
  | { kind: "ticket-types"; tiers: SalesMetricsDto["tiers"] }
  | { kind: "shares"; title: string; items: { label: string; count: number; whole: number }[] };

export type AnswerSource =
  { kind: "dashboard"; eventSlug: string | null } | { kind: "orders"; filters: OrderFilters; count: number } | null;

export interface Answer {
  sentence: string;
  visual: AnswerVisual;
  source: AnswerSource;
  notes: string[];
}

/** What a question needs from the API: the sales numbers (for an event, or all), or a count of orders. */
export type AnswerNeeds =
  { kind: "metrics"; eventSlug: string | undefined } | { kind: "orders"; filters: OrderFilters };

const DEFAULT_PERIOD_DAYS = 7;
const DAY_MS = 86_400_000;
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const STATUS_WORDS: Record<OrderStatus, string> = {
  pending: "pending",
  paid: "paid",
  fulfilled: "fulfilled",
  failed: "failed",
  expired: "expired",
  refunded: "refunded",
};
const METHOD_LABELS: Record<PaymentMethod, string> = { card: "card", upi: "UPI", razorpay: "Razorpay" };

const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayMonthFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);
const formatDay = (date: string) => dayFormatter.format(asDate(date));

/** "13 Nov 2026", or "6 to 12 Nov 2026", or "28 Dec 2026 to 3 Jan 2027". */
export function formatPeriod(from: string, to: string) {
  if (from === to) return formatDay(from);
  const isSameYear = from.slice(0, 4) === to.slice(0, 4);
  const isSameMonth = isSameYear && from.slice(5, 7) === to.slice(5, 7);
  const start = isSameMonth
    ? String(Number(from.slice(8)))
    : isSameYear
      ? dayMonthFormatter.format(asDate(from))
      : formatDay(from);
  return `${start} to ${formatDay(to)}`;
}

/** The orders a find-orders question is about, as the orders table's filters. */
export const ordersFilterFor = (question: OrganiserQuestion): OrderFilters => ({
  ...(question.event ? { event: question.event } : {}),
  status: question.statuses,
  ...(question.method ? { method: question.method } : {}),
  ...(question.from ? { from: question.from } : {}),
  ...(question.to ? { to: question.to } : {}),
  ...(question.search ? { q: question.search } : {}),
  orderBy: DEFAULT_ORDER_BY,
});

export const needsOf = (question: OrganiserQuestion): AnswerNeeds =>
  question.intent === "find-orders"
    ? { kind: "orders", filters: ordersFilterFor(question) }
    : { kind: "metrics", eventSlug: question.event ?? undefined };

const sharesOfWhole = (items: { label: string; count: number }[], whole: number) =>
  items.map((item) => `${formatPercent(item.count, whole)} ${item.label}`);

/** Said once, for answers whose numbers can't be cut to a period. */
const PERIOD_NOTE = "This can’t be split by date yet, so it’s every sale so far.";

export function answerFor(
  question: OrganiserQuestion,
  data: {
    events: readonly OrganiserEventDto[];
    metrics?: SalesMetricsDto | undefined;
    orderCount?: number | undefined;
  },
): Answer | null {
  const eventName = data.events.find((event) => event.slug === question.event)?.name;
  const dashboard: AnswerSource = { kind: "dashboard", eventSlug: question.event };
  const hasPeriod = question.from !== null || question.to !== null;

  if (question.intent === "unsupported") {
    return {
      sentence:
        "I can answer questions about your sales, ticket types, payments and orders. Try one of the suggestions.",
      visual: { kind: "none" },
      source: null,
      notes: [],
    };
  }

  if (question.intent === "find-orders") {
    if (data.orderCount === undefined) return null;
    const count = data.orderCount;
    const statuses = question.statuses.map((status) => STATUS_WORDS[status]).join(" or ");
    const sentence = [
      `${formatCount(count)}${statuses ? ` ${statuses}` : ""} ${count === 1 ? "order" : "orders"}`,
      question.method ? ` paid by ${METHOD_LABELS[question.method]}` : "",
      eventName ? ` for ${eventName}` : "",
      question.from || question.to
        ? `, ${formatPeriod(question.from ?? question.to ?? "", question.to ?? question.from ?? "")}`
        : "",
      question.search ? `, matching “${question.search}”` : "",
      ".",
    ].join("");
    return {
      sentence,
      visual: { kind: "none" },
      source: { kind: "orders", filters: ordersFilterFor(question), count },
      notes: [],
    };
  }

  const { metrics } = data;
  if (!metrics) return null;
  const scope = eventName ?? "Across your events";
  const notes: string[] = [];

  if (question.intent === "sales-over-time" || (question.intent === "summary" && hasPeriod)) {
    const days = metrics.salesByDay;
    const lastDay = days.at(-1)?.date;
    const firstDay = days[0]?.date;
    if (lastDay === undefined || firstDay === undefined) {
      return { sentence: "No sales are recorded yet.", visual: { kind: "none" }, source: dashboard, notes };
    }
    const to = question.to ?? lastDay;
    const from = question.from ?? shift(to, 1 - DEFAULT_PERIOD_DAYS);
    if (from < firstDay) notes.push(`Sales by day go back to ${formatDay(firstDay)}.`);
    const cut = days.filter((day) => day.date >= from && day.date <= to);
    const tickets = cut.reduce((sum, day) => sum + day.tickets, 0);
    const revenue = cut.reduce((sum, day) => sum + day.revenueMinor, 0);
    const busiest = cut.reduce<(typeof cut)[number] | undefined>(
      (best, day) => (day.tickets > (best?.tickets ?? 0) ? day : best),
      undefined,
    );
    const period = formatPeriod(from, to);
    const sentence =
      tickets === 0
        ? `${scope}, ${period}: no tickets sold.`
        : `${scope}, ${period}: ${formatCount(tickets)} ${tickets === 1 ? "ticket" : "tickets"}, ${formatMoney(revenue, metrics.currency)}.${
            busiest ? ` The busiest day was ${formatDay(busiest.date)}, with ${formatCount(busiest.tickets)}.` : ""
          }`;
    return {
      sentence,
      visual: cut.length > 0 ? { kind: "sales-chart", metrics: { ...metrics, salesByDay: cut } } : { kind: "none" },
      source: dashboard,
      notes,
    };
  }

  if (hasPeriod) notes.push(PERIOD_NOTE);

  if (question.intent === "summary") {
    const { tickets, revenue, paidOrders, currency } = metrics;
    const subject = eventName ? `${eventName} has` : "Across your events, you’ve";
    return {
      sentence: `${subject} sold ${formatCount(tickets.sold)} of ${formatCount(tickets.capacity)} tickets (${formatPercent(
        tickets.sold,
        tickets.capacity,
      )}): ${formatMoney(revenue.netMinor, currency)} net from ${formatCount(paidOrders)} paid ${paidOrders === 1 ? "order" : "orders"}.`,
      visual: { kind: "none" },
      source: dashboard,
      notes,
    };
  }

  if (question.intent === "ticket-types") {
    const share = (tier: SalesMetricsDto["tiers"][number]) => (tier.capacity > 0 ? tier.sold / tier.capacity : 0);
    const tiers = metrics.tiers.toSorted((left, right) => share(right) - share(left));
    const top = tiers[0];
    notes.push("By share sold so far: sales by ticket type aren’t kept day by day.");
    return {
      sentence: top
        ? `Selling best, as a share of its tickets: ${top.tierName}${eventName ? "" : ` (${top.eventName})`}, ${formatPercent(
            top.sold,
            top.capacity,
          )} (${formatCount(top.sold)} of ${formatCount(top.capacity)}).`
        : "There are no ticket types to compare.",
      visual: top ? { kind: "ticket-types", tiers: tiers.slice(0, 6) } : { kind: "none" },
      source: dashboard,
      notes,
    };
  }

  if (question.intent === "payment-mix") {
    const whole = metrics.paidOrders;
    const items = metrics.paymentMethods
      .filter((entry) => entry.orders > 0)
      .map((entry) => ({ label: `by ${METHOD_LABELS[entry.method]}`, count: entry.orders, whole }));
    return {
      sentence:
        whole === 0
          ? `${scope}: no paid orders yet.`
          : `Of ${formatCount(whole)} paid ${whole === 1 ? "order" : "orders"}, ${sharesOfWhole(items, whole).join(", ")}.`,
      visual: whole === 0 ? { kind: "none" } : { kind: "shares", title: "How buyers paid", items },
      source: dashboard,
      notes,
    };
  }

  // The funnel: every order began as a reservation.
  const { holds, orders, paid, fulfilled } = metrics.funnel;
  const stages = [
    { label: "became orders", count: orders, whole: holds },
    { label: "were paid", count: paid, whole: holds },
    { label: "have tickets, not refunded", count: fulfilled, whole: holds },
  ];
  return {
    sentence:
      holds === 0
        ? `${scope}: no reservations yet.`
        : `Of ${formatCount(holds)} reservations, ${stages
            .map((stage) => `${formatCount(stage.count)} ${stage.label} (${formatPercent(stage.count, holds)})`)
            .join(", ")}.`,
    visual: holds === 0 ? { kind: "none" } : { kind: "shares", title: "From reservation to ticket", items: stages },
    source: dashboard,
    notes,
  };
}
