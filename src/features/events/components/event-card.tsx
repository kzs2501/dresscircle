import Link from "next/link";
import type { EventInfo } from "@/core/catalog";
import { CATEGORY_LABELS } from "@/core/statuses";
import { lowestAllInPriceMinor } from "@/core/pricing";
import { formatEventDate, formatEventTime, formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { AvailabilityBadge } from "./availability-badge";
import { EventPoster } from "./event-poster";

/**
 * What a card shows, worked out on the server: plain data, so the home page's search can
 * filter cards in the browser without shipping the catalogue (and its halls) there.
 */
export type EventCardData = Pick<
  EventInfo,
  "slug" | "name" | "tagline" | "category" | "startsAt" | "timeZone" | "venue" | "city"
> & { fromPrice: string };

export const cardOf = (event: EventInfo): EventCardData => ({
  slug: event.slug,
  name: event.name,
  tagline: event.tagline,
  category: event.category,
  startsAt: event.startsAt,
  timeZone: event.timeZone,
  venue: event.venue,
  city: event.city,
  fromPrice: formatMoney(lowestAllInPriceMinor(event), event.currency),
});

/** An event: its poster, when and where, from how much, and how many are left (live). The whole card is the link. */
export function EventCard({ event }: { event: EventCardData }) {
  return (
    <Link
      href={routes.event(event.slug)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-card transition-colors hover:border-ink-3"
    >
      <EventPoster event={event} className="h-24 border-b border-line" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="tabular text-xs text-ink-3">
            {formatEventDate(event.startsAt, event.timeZone)} · {formatEventTime(event.startsAt, event.timeZone)}
          </p>
          <AvailabilityBadge slug={event.slug} />
        </div>
        <h3 className="mt-3 font-display text-xl font-semibold group-hover:text-accent">{event.name}</h3>
        <p className="mt-1.5 text-sm text-pretty text-ink-2">{event.tagline}</p>
        <p className="mt-auto pt-4 text-sm text-ink-3">
          {CATEGORY_LABELS[event.category]} · {event.venue}, {event.city}
        </p>
        <p className="mt-1 text-sm">
          From <span className="tabular font-medium">{event.fromPrice}</span> <span className="text-ink-3">all in</span>
        </p>
      </div>
    </Link>
  );
}

/** Cards in a grid that fits the width: one column on a phone, up to three. */
export function EventGrid({ events }: { events: readonly EventCardData[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li key={event.slug}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}
