# 023: A box office first, the system underneath

**Status:** Accepted.

## Context

The first page was a heading, a paragraph and five event cards. It read as a small demo,
while the app underneath has a seat map, a fair queue, two payment providers, offline
tickets and an organisers' dashboard. A visitor, often a reviewer with a few minutes,
saw none of that until they clicked into an event.

The ticket sites people use, in India (BookMyShow, District) and elsewhere (Ticketmaster,
Eventbrite), open on the same few things: a search box, a city, the kinds of night out,
what is selling fast, and the buyer's own next booking. Operations products add one more:
a sign that the system is running right now.

## Decision

**The first page is a working box office, with the system visible underneath it.** Top to
bottom (`src/app/page.tsx`, which composes the features):

- **Search and filters,** by words, kind of night out, city and month, kept in the URL
  (`?q=&cat=&city=&month=`). A choice is a step that Back undoes; typing replaces the step,
  so Back doesn't replay every letter. Filtering is a pure function
  (`features/events/domain/event-filters.ts`) over cards the server already rendered, so the
  catalogue isn't shipped to the browser.
- **Your next event,** from this device's wallet, when there is one.
- **Box office, live:** held now, queuing (during a flash sale), sold today, and the last
  five things that happened, polled every five seconds while the tab is in view. It can be
  paused (WCAG 2.2.2), keeps its height before data arrives (no layout shift) and announces
  nothing, so a screen reader isn't interrupted every five seconds.
- **Almost gone,** **Try the hard parts** (one click to the seat map, a flash sale, a
  broken payment, the door and the organisers' side) and **All events,** each card with a
  poster drawn in SVG from its kind of night out.

**The catalogue grew to ten events in ten cities,** each with a category, so the filters
have something to do: a play in a second hall (Marine Lines Playhouse, whose section ids
are unique because the sandbox keeps sold seats in one list), a comedy night, a recital, a
talks night and a festival. Every date moved into 2027, so no event is in the past while
the demo is being looked at; nothing in the app handles past events.

**The sandbox has a simulated crowd, and says so.** On the happy path, another buyer takes
a ticket every 20 seconds or so, from tiers with plenty left (never the last few), and four
such sales are backfilled when the sandbox starts. Each is marked "simulated" in the strip,
with a line saying what that means, and shows in the organisers' dashboard as the "busy
on-sale" scenario's sales do. Without it, the strip would read "Quiet right now" to every
first visitor, which undersells the one thing it is there to show. The Chaos scenarios keep
their own crowds and get no ambient one; tests turn it off by default
(`STORAGE_KEYS.quietCrowd`). The server site has no simulated buyers: it shows real
activity only.

**`GET /api/activity`** serves the strip in both modes. It is derived from records (holds,
orders, the sandbox's live sales), never parsed from the log, and carries no ids, names or
codes, since a hold's or an order's id is the key to it; a test allows only the expected
keys. It is the same for every visitor, so it is cached at the CDN for five seconds
(`public, s-maxage=5, stale-while-revalidate=10`) rather than rate limited: however many
pages poll, the database sees about one query per five seconds, helped by indexes on holds
by creation and on paid orders by update.

## Consequences

- A reviewer sees the scale of the thing in the first screen, and each hard part is one
  click away.
- The generated history grew to about 11,000 orders with the larger catalogue
  ([015](015-reporting-at-scale.md)); the performance budgets still hold.
- Ids renumbered, so the sandbox's state version went up: a sandbox saved before starts fresh.
- The dates need moving again before 2028.
- Simulated sales are an honest fiction only while they're labelled: the label and its
  explanation are part of the feature, and an e2e test checks both.
