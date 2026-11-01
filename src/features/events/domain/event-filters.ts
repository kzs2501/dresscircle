/**
 * The home page's search and filters, kept in the URL so a view can be shared, a reload
 * keeps it, and Back undoes a change. Like the orders table's (organiser's
 * `order-filters.ts`), a filter that doesn't make sense, such as a city the catalogue
 * has no events in, is dropped on its own, and the rest still apply.
 */
import * as z from "@/core/zod";
import type { EventInfo } from "@/core/catalog";
import { CATEGORY_LABELS, EVENT_CATEGORIES, type EventCategory } from "@/core/statuses";

export const MAX_EVENT_SEARCH_LENGTH = 60;

export interface EventFilters {
  q?: string | undefined;
  category?: EventCategory | undefined;
  city?: string | undefined;
  /** `2027-03`: events that start that month, in their venue's time. */
  month?: string | undefined;
}

type Listed = Pick<EventInfo, "name" | "tagline" | "venue" | "city" | "category" | "startsAt">;

/** An event's month, in its venue's time: the ISO string carries the venue's offset. */
export const monthOf = (event: Pick<EventInfo, "startsAt">) => event.startsAt.slice(0, 7);

/** The choices the filters offer: only what the catalogue has, so none comes up empty. */
export function filterChoices(events: readonly Listed[]) {
  return {
    categories: EVENT_CATEGORIES.filter((category) => events.some((event) => event.category === category)),
    cities: [...new Set(events.map((event) => event.city))].sort(),
    months: [...new Set(events.map(monthOf))].sort(),
  };
}

const parsed = <T>(schema: z.ZodType<T>, value: string | null): T | undefined => {
  const result = schema.safeParse(value ?? undefined);
  return result.success ? result.data : undefined;
};

export function eventFiltersFrom(params: URLSearchParams, events: readonly Listed[]): EventFilters {
  const { cities, months } = filterChoices(events);
  const city = params.get("city");
  const month = params.get("month");
  return {
    q: parsed(z.string().trim().min(1).max(MAX_EVENT_SEARCH_LENGTH), params.get("q")),
    category: parsed(z.enum(EVENT_CATEGORIES), params.get("cat")),
    city: city !== null && cities.includes(city) ? city : undefined,
    month: month !== null && months.includes(month) ? month : undefined,
  };
}

/** The URL's query for some filters, in a fixed order, so equal filters make equal URLs. */
export function eventFilterParams({ q, category, city, month }: EventFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("cat", category);
  if (city) params.set("city", city);
  if (month) params.set("month", month);
  return params;
}

export const hasEventFilters = (filters: EventFilters) =>
  Boolean(filters.q ?? filters.category ?? filters.city ?? filters.month);

const normalised = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The events that match, soonest first. Search looks at the name, tagline, venue, city and kind. */
export function matchingEvents<Event extends Listed>(events: readonly Event[], filters: EventFilters): Event[] {
  const words = normalised(filters.q ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return events
    .filter((event) => !filters.category || event.category === filters.category)
    .filter((event) => !filters.city || event.city === filters.city)
    .filter((event) => !filters.month || monthOf(event) === filters.month)
    .filter((event) => {
      if (words.length === 0) return true;
      const haystack = normalised(
        [event.name, event.tagline, event.venue, event.city, CATEGORY_LABELS[event.category]].join(" "),
      );
      return words.every((word) => haystack.includes(word));
    })
    .toSorted((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}
