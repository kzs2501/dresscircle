# The hard parts

The problems Dress Circle exists to solve properly, each with the decision record behind
it. [The README's code tour](../README.md#where-to-look) maps each one to its files.

## 1. Holds that can't oversell, and expire without a timer

Choosing tickets creates a hold with an `expiresAt`. Availability is
`capacity − sold − tickets in live holds`, where _live_ means `now < expiresAt`.
Expiry is **lazy**: an expired hold simply stops counting. There's no sweeper job, so
there's no window where a dead hold still blocks a buyer, and reads never write.
([decision](decisions/002-holds-and-lazy-expiry.md))

## 2. A typed step registry, driven by the URL

Each step declares `isApplicable(ctx)` and `isComplete(ctx)`; the flow is whatever
applies (no extras step for events without extras). The URL
(`/checkout/[holdId]/[step]`) is the source of truth, so refresh resumes, deep links
can't skip ahead, and back/forward just work. Drafts persist per hold, and review only
counts as done if the server's order matches what you typed.
([decision](decisions/003-step-registry.md))

## 3. The webhook, not the redirect, decides

Paying returns `202 processing`, never "paid". The browser goes to the order page,
which polls with backoff until the provider's webhook settles the order. Payments carry
an `Idempotency-Key` minted per _attempt_ (a retry after a network error reuses it, so
it can never charge twice: the "Connection drops" scenario shows it); webhooks are
deduplicated by event id. A status check that fails keeps the last known state on
screen rather than replacing it with an error.
([decision](decisions/004-payments-and-webhooks.md))

## 4. Payment after the hold expired

Starting a payment extends the hold once, and a payment in flight protects its order.
If the money still arrives after the tickets are gone, the order is refunded in full and
the page says why, rather than overselling or quietly keeping the money.

## 5. A seat map you can use with a keyboard

Two events have reserved seating: a concert in a 998-seat hall, and a play at Marine
Lines Playhouse. Both halls are drawn from static data and server-rendered. Each section is a WAI-ARIA grid with one tab stop. The arrow
keys step over aisles, and Up and Down go to the seat _in front_, not the one with the
same number. Every seat says its row, number, tier, price and state. Choosing seats is
all-or-nothing: if one has gone, nothing is held and the server names it. "Best
available" lets the server choose and hold in one step, keeping a party together
without stranding a single seat. An e2e budget keeps the longest interaction under
200 ms with the CPU slowed four times.
([decision](decisions/010-reserved-seating.md))

## 6. A waiting room, and a limit on trying

In a flash sale, everyone queues first. The line is first in, first out, a batch at a
time, and your place is computed from when you joined and the clock: nothing ticks, a
refresh keeps it, and the server says when to check again. The page shows the people
ahead, a bar that only moves forward and a coarse wait. When your turn comes, it says
so and moves focus, but doesn't redirect you. Reserving is also rate-limited: the
fourth try in 15 seconds is a 429 with `Retry-After`, and the page waits exactly that
long. ([decision](decisions/011-waiting-room-and-rate-limits.md))

## 7. The price you see is the price you pay

Showing a base price and adding fees at checkout is drip pricing, which India's dark
patterns guidelines and the US FTC's fees rule both ban. So every price on screen is all
in: the 3% booking fee and GST included, with what it's made of one line away. One
pricing engine serves the server's charge and every label. GST rules are data: 18% on
admission, none at ₹500 or less, and 18% on the fee. Tax is worked out per ticket in
paise, as CGST and SGST halves each rounded, so one ticket's price times the quantity
is exactly the total. ([decision](decisions/012-gst-and-all-in-pricing.md))

## 8. UPI: approved in another app, settled by webhook

Merchants can't send "collect" requests any more (NPCI, 2026), so a UPI payment is an
intent. That's a `upi://pay` link, with the merchant category code and a reference
unique to the payment, shown as a QR code on a computer or opened as the UPI app on a
phone. The buyer answers in another app, so the page never learns the outcome from the
browser: it re-reads the order, and the webhook decides. A request runs out after five
minutes (lazily, like a hold), never outlasts the hold, and can be cancelled to pay by
card. ([decision](decisions/013-upi-by-intent-and-qr.md))

## 9. An organisers' dashboard, with access checked twice

Sign in as one of three demo accounts across two organisations. Each sees only its own
events' orders and only what its role allows. The same `can()` rule hides the Refund
button from the box office and makes the server refuse it anyway. Statuses are exact:
401 for no session, 403 for an event that isn't yours, and 404 for an order that
isn't, so its existence isn't confirmed. ([decision](decisions/014-organiser-access.md))

## 10. Eleven thousand orders in a table that stays a table

The history is generated from a seed, not stored, and it agrees with the catalogue to
the ticket. The server filters, sorts (AIP-132) and pages by keyset (AIP-158), so new
orders between pages can't repeat or skip a row.

- **The table:** TanStack Virtual draws about 30 rows, but it's still a real
  `<table>`, with spacer rows instead of absolute positioning. `aria-rowcount` and
  `aria-rowindex` tell screen readers the whole story, and a focused row stays drawn.
- **The filters:** they live in the URL, and they're optimistic, so they respond at
  once.
- **Live updates:** server-sent events read with `fetch` (so they can carry a token)
  refresh what's on screen, and can be paused. The table offers new rows rather than
  moving under you.

([decision](decisions/015-reporting-at-scale.md))

## 11. Refunds, optimistic and honest

A refund is an idempotent request settled by webhook, like a payment. The dashboard
shows "Refund pending" at once, on the order and in every cached table page. If the
provider refuses, everything rolls back and a focused alert says why. Refunded tickets
go back on sale, and door scanners refuse the old ones once they've fetched the event's
list of refunded codes, which they keep for offline. ([decision](decisions/016-refunds.md))

## 12. Every state in a catalogue, every pixel checked

The checkout and the order page render a state; their view-model hooks supply it. So
every state is a story in a Storybook catalogue, built from data the contract's schemas
parse, including ones that are hard to reach by clicking. Components that fetch their
own data run on a fresh copy of the sandbox for every story.

- **Every story is a test:** it renders in Chromium, passes its play function, and has
  no axe violations.
- **Every story is a screenshot,** in light and dark, and at 375 px for whole screens,
  made in Playwright's Linux image on arm64, both on a laptop and in CI. Screenshots
  only compare on the machine that made them, and emulating Intel on Apple Silicon
  renders OKLCH colours as white.
- **It found two bugs at once:** an unlayered `:focus-visible` rule beat every
  `outline-none`; and a busy button, being `disabled`, could drop keyboard focus (a
  flaky screenshot, found by running the suite three times over).

([decision](decisions/017-catalogue-and-visual-tests.md))

## 13. The same API on Postgres, and races the database can't lose

Built with `NEXT_PUBLIC_BACKEND=server`, the app talks to a server instead of the
sandbox: Next route handlers answer `/api/*` with the very handlers the sandbox runs in
its service worker, over Postgres. The same 15 HTTP contract tests pass on both
backends, and so do 32 end-to-end flows.

- **Stock and seats:** a hold takes tickets with one conditional update of the tier's
  row, and seats with a partial unique index. Against real Postgres, 50 buyers at the
  last 10 tickets get exactly 10, and 20 buyers for one pair of seats get one.
- **Everything else:** the sandbox's own rules, run on the server's rows under a lock on
  the hold. Ten payments at once for one order give one charge.
- **Webhooks:** signed by a simulated provider, checked over the raw body, and acted on
  once, in the same transaction as their effect. Each is delivered under a lease, and
  one that fails is retried with backoff rather than holding up the rest. A payment
  confirmed while its hold was live keeps its tickets, however late its webhook.
- **Production means production:** without its database, webhook secret, ticket key
  and fingerprint secret, the server refuses to start, and says which are missing.
- **A race test that couldn't fail:** on a cold connection pool, the first
  "simultaneous" request finished before the rest connected. Each test pool now opens
  every connection first, and a version without the lock fails.

([decision](decisions/018-server-mode.md))

## 14. Tickets that work in a basement

Doors are where networks fail, so neither the ticket nor the check needs one.

- **A ticket is a signed token.** Each one carries its claims and an Ed25519 signature,
  in its QR code. The door checks it with the public key alone, so a ticket that was
  changed, or made up, is refused offline.
- **The wallet is on the device.** Tickets are saved to IndexedDB when they're issued,
  and `/tickets` opens with no network, after a reload or in a new tab.
- **One service worker, two jobs.** A scope has one worker, and MSW's already had the
  site's, so the app's worker imports MSW's. Its own listeners go first. MSW's worker
  also unregisters itself when its last tab closes, so the merged one keeps its
  registration, or the wallet would find no worker the next time.
- **The door scanner** (`/scan`) uses the browser's `BarcodeDetector` where there is
  one, and ZXing in WebAssembly elsewhere, served from this site. It remembers whom it
  has let in, in one IndexedDB transaction per scan. Only this page may use the camera
  or compile WebAssembly, so it's always reached by a full page load: headers are per
  document.
- **Refunds reach the door:** a signature can't say a ticket was refunded, so the door
  fetches its event's refunded codes while online, keeps them, and says when it last
  checked.
- **Tested with a fake camera:** Chromium plays a video of a signed ticket, and the
  scanner reads it. Then the same ticket, after a reload, reads as already scanned.

([decision](decisions/019-offline-tickets-and-door-scanner.md))

## 15. A real payment provider, and money that can't stay

[Server mode](https://dresscircle-server.vercel.app) takes payment through Razorpay's test
mode: no real money moves.

- **Card details never reach this server.** Checkout is Razorpay's page, in a frame of
  its own, and 3-D Secure runs at the bank, not in a dialog anyone with a payment's id
  could approve.
- **Two ways to hear about a payment, one rule.** Razorpay's webhook, or Checkout's
  result, signed with the key secret and checked against Razorpay before it's believed.
  Whichever comes second finds the payment settled.
- **A capture that can't become tickets is refunded,** through Razorpay's API: paid
  after the hold ran out, for a checkout the buyer gave up on and then paid anyway, or
  for the wrong amount. Refunds are an outbox, retried until they work, and each first
  asks Razorpay whether it's needed, so a lost reply never refunds twice.
- **Webhooks without timestamps:** Razorpay's can't be refused for their age, so each is
  acted on once, by its event id, and a payment settles once whatever reports it.
- **Found on the way:** an event for an order that had moved on used to be dropped,
  harmless with simulated money and a kept payment with real money. And any command on
  a sold order had always failed with a 500.
- **Tested without the network:** the server against an in-memory Razorpay, and the
  browser against a stand-in whose Checkout is a dialog of buttons, both in CI. The real
  Checkout was opened under the security policy, which found one more origin it needed.

([decision](decisions/020-razorpay-test-mode.md))

## 16. A box office first, the system underneath

The first page is a working box office: search and filters kept in the URL (a choice is a
step Back undoes; typing replaces it), your next event from the offline wallet, a live
strip of what's being held and sold, the events with the fewest tickets left, one click
to each hard part, and every event with a poster drawn in SVG.

- **The live strip** polls `GET /api/activity` every five seconds while the tab is in
  view, can be paused (WCAG 2.2.2), keeps its height before data arrives, and announces
  nothing.
- **A simulated crowd, labelled:** on the happy path the sandbox invents a buyer now and
  then, from tiers with plenty left, and every one of their sales says "simulated". The
  server site shows real activity only.
- **Cached, not rate limited:** the feed is the same for everyone and carries no ids or
  names, so Vercel's CDN keeps it for five seconds, and the database sees about one
  query per five seconds however many pages poll.

([decision](decisions/023-a-box-office-first.md))

## 17. Search in your own words, for free

Type "stand-up in Delhi in February" or "something mellow by the sea" and press Enter: the
filters are set, and a line under them says what the request was read as and which engine
read it.

- **The AI fills in a form:** a kind of event, a city, a month, words to search for and
  what isn't a filter, each chosen from the catalogue's own lists. The page's code checks
  and applies it, so the model can't invent an event or a number.
- **Rules first, then free engines in order:** the rules read most requests with no
  network; words they can't place go to Chrome's built-in model when it's installed, then
  to an open model on Groq's free tier, and when neither answers, the rules' reading stands.
- **Not a free chatbot:** `/ai/plan` builds its task on the server and takes only the
  request's text, rate-limited per client.
- **Measured:** 33 requests scored field by field (`npm run eval:ai`); CI holds the rules
  alone to 80%.

([decision](decisions/025-the-ai-fills-in-a-form.md))

## 18. An assistant that never sees the data

On the organisers' overview, ask "refunded UPI orders last week" or "which ticket type is
selling best?", or click a suggestion: the answer is a sentence, a picture where one helps,
and a link to where its numbers came from.

- **The model never sees the data:** it fills in a query (what kind of answer, which event,
  period, statuses, method or buyer), and the page answers it from the organisers' API, as
  the dashboard does. Only the question and the public list of events leave the browser.
- **Rules first, and exact:** they read most questions with no network, and where they
  found a period, status, method or buyer, an engine's reading keeps theirs.
- **Only your events:** an engine in the browser is offered only the account's own, and the
  API checks access as always.
- **Live and honest:** answers update with the dashboard, and say what they can't split
  (sales by ticket type, by date).

([decision](decisions/026-an-assistant-that-never-sees-the-data.md))

## 19. Actions the organiser confirms

Ask the assistant to "refund every order for Night Market Jazz, the show was cancelled":
it says how many orders and how much would go back, an owner reviews exactly those orders
and confirms, and they're refunded with progress, Stop and Retry.

- **The model can't act:** a refund request is one more kind of answer in its form.
- **Said before it's done:** the orders, the total, and what was left out and why; past
  500, narrow it down. The box office can't refund at all.
- **A review, always, and the number typed from 20 orders;** the list is frozen as the
  dialog opens, so what it shows is what's refunded.
- **Through the single refund's endpoint,** four at a time, each order keeping its
  idempotency key, so a retry never refunds twice.

([decision](decisions/027-actions-the-organiser-confirms.md))
