# Quality

What each check covers. [The README](../README.md#quality) has the summary; CI runs every
one of them on each push (`.github/workflows/ci.yml`).

## `npm run lint` + `typecheck`

Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …) and type-aware ESLint: naming conventions, exhaustive switches, and the layer boundaries.

## `npm test`

707 unit, component and HTTP-contract tests: every relative link and anchor in the README and the docs, signed tickets (tampered, forged, unknown keys), the door's decisions (refunded tickets too), its scan log (two scans at once) and its camera (released when the page goes, paused while hidden), whom the door's keyring trusts, the service worker's URL per build, the wallet, the catalogue's fixtures against the contract, permissions and tenant isolation, keyset paging, CSV escaping and its download, metrics in the organiser's time zone, refunds and their keys, the live stream (a catch-up, a garbled event), the virtualised table's ARIA and focus under filtering and sorting, the search box's debounce, optimistic rollback, pricing and GST, UPI intents, expiry and cancelling, inventory, the order state machine (every legal and illegal transition), idempotency and its fingerprint, webhook dedupe, persistence, problem details, the server's settings per environment, the API client's errors and time-outs, the view-model state machines, the step registry, countdown maths, money and validation, the hall's geometry, the seat allocator (never stranding a seat), the seat map's keyboard model and its focus, the live regions, the waiting room's line and the rate limiter.

## `npm run test:server`

93 tests of the server backend against real Postgres: concurrent holds and seats, ten payments at once, Idempotency-Keys across processes and who owns a claim, signed webhooks (forged, altered, replayed, duplicated, rotated), a delivery that fails and is retried, a payment confirmed in time but delivered late, deadlocks retried, the rate limit per client (the sandbox's answers, a burst held to the limit), limits on input and bodies streamed past them, logs without buyers' data, the seed and the status constraints, and the shared HTTP contract.

## `npm run test:coverage`

The same, with coverage floors per layer: core, contract, the backend domain and HTTP adapter, the checkout, door and dashboard rules, `src/lib`, the order page's polling and the wallet.

## `npm run test:stories`

113 stories, each a test in Chromium: it renders, passes its play function (keyboard models, focus after a dialog, permissions, reserving on the sandbox) and has no axe violations.

## `npm run test:visual`

273 screenshots: every story in light and dark, and whole screens at 375 px, compared in Playwright's Linux image on arm64, with axe in both themes.

## `npm run test:e2e`

100 browser tests (32 of them also run against server mode, `npm run test:e2e:server`, and 4 more pay through Razorpay's checkout against a stand-in, `npm run test:e2e:razorpay`): one per chaos preset, each checking what the server recorded, plus tickets offline (after a reload, in a new tab), the door scanner by photo and by a fake camera (once only, forged, another event, refunded, offline), the door reached by its link with its own headers, the camera and WebAssembly allowed on `/scan` alone, the home page (filters in the URL, the live strip, the shortcuts, 320 px), the organisers' dashboard (filters in the URL, an 11,000-row table, CSV, refunds and their rollback, access, live updates, axe), paying by UPI (approved, declined, expired, cancelled, after a refresh), all-in prices, a flash sale through the waiting room, a rate limit waited out, a keyboard-only seat purchase, best available, axe on the seat map, security headers and the content security policy (buying, the wallet, the door, the dashboard), the image optimiser switched off, four font files per page, refresh-resume (mid-form and mid-payment), step guards, expiry and re-reserve, threshold announcements, focus management, hover contrast, axe (WCAG 2.2 AA) in light and dark, 375 px, reduced motion.

## `npm run test:e2e:perf`

2 responsiveness budgets, run on their own and never retried: choosing seats and filtering 11,000 orders stay under 200 ms with the CPU slowed four times.

## `npm run lhci`

Lighthouse on desktop, six pages: performance, accessibility and best practices ≥ 95 on every one, and SEO ≥ 90 on the buyer's pages (the dashboard and the door aren't indexed). Last run: 100 in all four on every buyer's page, and 99 for the door's performance.

## `npm run lhci:mobile`

The home page and both event pages on a mid-range phone: performance ≥ 85 ([ADR 010](decisions/010-reserved-seating.md)), the other categories ≥ 95, and at most 420 KB of script. Last run on a laptop: 92 (the home page), 93 and 92 (the seat map); on GitHub's runner, 95, 95 and 93 at best of three; 100 in every other category.

## Accessibility and money

Accessibility details worth knowing: focus moves to each step's heading; the countdown
is announced at 2 min, 1 min and 30 s rather than every second; errors are linked to
their fields and the first one gets focus; the chaos panel and 3-D Secure challenge are
native `<dialog>`s.

Money is an integer amount in minor units together with its currency (the events are
priced in INR), priced by one engine (`core/pricing.ts`) on both the client and the
server, so the price you see is the price that's charged. Errors are RFC 9457 problem
details: see [the API](api.md).
