import { Suspense } from "react";
import { CATALOG, type EventInfo } from "@/core/catalog";
import { isServerMode } from "@/lib/backend-mode";
import { spellCount } from "@/lib/format";
import { BoxOfficeLive } from "@/features/events/components/box-office-live";
import { Discovery, DiscoveryFallback } from "@/features/events/components/discovery";
import { cardOf, EventGrid } from "@/features/events/components/event-card";
import { TryTheHardParts } from "@/features/sandbox/components/try-the-hard-parts";
import { NextEvent } from "@/features/tickets/components/next-event";

const bySoonest = (left: EventInfo, right: EventInfo) => Date.parse(left.startsAt) - Date.parse(right.startsAt);

const CARDS = CATALOG.toSorted(bySoonest).map(cardOf);
const CITY_COUNT = new Set(CATALOG.map((event) => event.city)).size;
const EVENT_NAMES = Object.fromEntries(CATALOG.map((event) => [event.slug, event.name]));

/**
 * The three events with the fewest tickets left as the box office opened. Each card's
 * badge then says how many are left now; the crowd never takes the last few.
 */
const ALMOST_GONE = CATALOG.map((event) => ({
  event,
  left: event.tiers.reduce((total, tier) => total + tier.capacity - tier.baselineSold, 0),
}))
  .filter(({ left }) => left > 0)
  .toSorted((a, b) => a.left - b.left)
  .slice(0, 3)
  .map(({ event }) => cardOf(event));

/** What the page shows when nothing is being searched for: the box office, then everything on. */
function BoxOffice() {
  return (
    <div className="mt-10 space-y-14">
      <NextEvent />
      <BoxOfficeLive eventNames={EVENT_NAMES} />
      <section aria-labelledby="almost-gone">
        <h2 id="almost-gone" className="font-display text-2xl font-semibold">
          Almost gone
        </h2>
        <p className="mt-1 text-ink-2">The fewest tickets left.</p>
        <div className="mt-4">
          <EventGrid events={ALMOST_GONE} />
        </div>
      </section>
      <TryTheHardParts />
      <section aria-labelledby="all-events">
        <h2 id="all-events" className="font-display text-2xl font-semibold">
          All events
        </h2>
        <p className="mt-1 text-ink-2">Soonest first.</p>
        <div className="mt-4">
          <EventGrid events={CARDS} />
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="tabular text-xs tracking-[0.16em] text-ink-3 uppercase">Box office open</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Find a seat for tonight.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-pretty text-ink-2">
        Concerts, plays and talks across {spellCount(CITY_COUNT)} Indian cities. Everything here works the way a real
        box office does, and nothing is charged.{" "}
        {isServerMode ? (
          <>This one runs on a server, on Postgres, and takes payment through Razorpay’s test mode.</>
        ) : (
          <>
            Open the <strong className="font-medium text-ink">Chaos panel</strong> to decline a card, send a webhook
            twice, or let a crowd chase the last seat.
          </>
        )}
      </p>
      {/* The filters live in the URL, which the server's render doesn't know: until the page
          is in the browser, the same search box and sections, unfiltered. */}
      <Suspense
        fallback={
          <DiscoveryFallback events={CARDS}>
            <BoxOffice />
          </DiscoveryFallback>
        }
      >
        <Discovery events={CARDS}>
          <BoxOffice />
        </Discovery>
      </Suspense>
    </div>
  );
}
