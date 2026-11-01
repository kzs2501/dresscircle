"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORY_LABELS } from "@/core/statuses";
import { formatMonth } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  eventFilterParams,
  eventFiltersFrom,
  filterChoices,
  hasEventFilters,
  matchingEvents,
  MAX_EVENT_SEARCH_LENGTH,
  type EventFilters,
} from "@/features/events/domain/event-filters";
import { EventGrid, type EventCardData } from "./event-card";

type Change = (next: EventFilters, how: "push" | "replace") => void;

const CHIP =
  "inline-flex min-h-10 press items-center rounded-full border px-4 text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";
const SELECT = "min-h-10 rounded-lg border border-line bg-card px-3 text-sm";

/**
 * The search box and filters, and what they find. Pure: `Discovery` gives it the URL's
 * filters and a way to change them; the server's render gives it none, as a placeholder
 * that looks the same until the page is in the browser.
 */
export function DiscoveryView({
  events,
  filters,
  query,
  onQuery,
  onChange,
  children,
}: {
  events: readonly EventCardData[];
  filters: EventFilters;
  /** What's typed in the search box, which may run ahead of the URL. */
  query: string;
  onQuery: (query: string) => void;
  onChange: Change;
  /** What the page shows when nothing is being searched for. */
  children: ReactNode;
}) {
  const { categories, cities, months } = filterChoices(events);
  const active: EventFilters = { ...filters, q: query.trim() || undefined };
  const results = hasEventFilters(active) ? matchingEvents(events, active) : null;

  return (
    <>
      <form
        role="search"
        aria-label="Find an event"
        className="mt-8 space-y-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="event-search" className="sr-only">
          Search events, venues and cities
        </label>
        <input
          id="event-search"
          type="search"
          value={query}
          maxLength={MAX_EVENT_SEARCH_LENGTH}
          placeholder="Search events, venues, cities"
          autoComplete="off"
          onChange={(event) => {
            onQuery(event.target.value);
          }}
          className="w-full rounded-lg border border-line bg-card px-4 py-3 text-base placeholder:text-ink-3"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Kind of event" className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={filters.category === category}
                onClick={() => {
                  onChange({ ...active, category: filters.category === category ? undefined : category }, "push");
                }}
                className={`${CHIP} border-line bg-card text-ink-2 hover:bg-sunk`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="event-city">
            City
          </label>
          <select
            id="event-city"
            value={filters.city ?? ""}
            onChange={(event) => {
              onChange({ ...active, city: event.target.value || undefined }, "push");
            }}
            className={SELECT}
          >
            <option value="">Any city</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="event-month">
            Month
          </label>
          <select
            id="event-month"
            value={filters.month ?? ""}
            onChange={(event) => {
              onChange({ ...active, month: event.target.value || undefined }, "push");
            }}
            className={SELECT}
          >
            <option value="">Any month</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
        </div>
      </form>

      {results ? (
        <section aria-labelledby="results" className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="results" className="font-display text-2xl font-semibold">
              Results
            </h2>
            <p className="flex items-baseline gap-3 text-sm text-ink-2">
              <span role="status">{results.length === 1 ? "1 event" : `${String(results.length)} events`}</span>
              <button
                type="button"
                onClick={() => {
                  onQuery("");
                  onChange({}, "push");
                }}
                className="underline underline-offset-4 hover:text-ink"
              >
                Clear filters
              </button>
            </p>
          </div>
          {results.length > 0 ? (
            <div className="mt-4">
              <EventGrid events={results} />
            </div>
          ) : (
            <p className="mt-4 text-ink-2">Nothing matches. Clear the filters to see every event.</p>
          )}
        </section>
      ) : (
        children
      )}
    </>
  );
}

const ignore = () => undefined;

/**
 * What the server renders while the URL's filters are only known in the browser: the
 * same search box and sections, so nothing moves when the page takes over.
 */
export function DiscoveryFallback({ events, children }: { events: readonly EventCardData[]; children: ReactNode }) {
  return (
    <DiscoveryView events={events} filters={{}} query="" onQuery={ignore} onChange={ignore}>
      {children}
    </DiscoveryView>
  );
}

/**
 * The search and filters, kept in the URL: a choice adds a step to history, so Back
 * undoes it, while typing replaces the current one. The box keeps its own text, so the
 * cursor never jumps, and takes the URL's again when it changes from elsewhere (Back).
 */
export function Discovery({ events, children }: { events: readonly EventCardData[]; children: ReactNode }) {
  const router = useRouter();
  const filters = eventFiltersFrom(new URLSearchParams(useSearchParams()), events);
  const urlQuery = filters.q ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== query.trim()) setQuery(urlQuery);
  }

  const change: Change = (next, how) => {
    const href = routes.home(eventFilterParams(next));
    if (how === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };

  return (
    <DiscoveryView
      events={events}
      filters={filters}
      query={query}
      onQuery={(next) => {
        setQuery(next);
        change({ ...filters, q: next.trim() || undefined }, "replace");
      }}
      onChange={change}
    >
      {children}
    </DiscoveryView>
  );
}
