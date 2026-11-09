# 024: The backstop on a scheduler that keeps time

**Status:** Accepted. Refines [018](018-server-mode.md) and [020](020-razorpay-test-mode.md).

## Context

Server mode has one call that nothing else makes for it: `GET /api/internal/deliver`, with
`Authorization: Bearer $CRON_SECRET`. Each call sweeps Razorpay checkouts that closed with no
payment reaching us, sends the simulated provider's webhooks that are due, and sends
captures and refunds still waiting in the outbox. Reads and the follow-up after a payment
are the quick paths; this call is for when nobody is looking.

Until now a GitHub Actions schedule made that call, asking for every five minutes (Vercel's
Hobby crons run once a day at most). GitHub runs schedules on a best-effort basis, and the
history showed it: over the 40 runs from 29 October to 7 November 2026, the runs were a
median of 6.0 hours apart and at most 10.2. GitHub also switches a schedule off after about
60 days without activity in the repository, without failing anything, so a finished project
would lose its backstop quietly.

## Decision

**An Upstash QStash schedule makes the call every five minutes.** It sends `GET` with the
bearer token forwarded (`Upstash-Forward-Authorization`), and retries a call that doesn't
answer 2xx. Five minutes is 288 calls a day, inside QStash's free plan. The app is
unchanged: the endpoint already existed for any scheduler.

**GitHub's schedule stays, as a second trigger.** Two triggers can't do anything twice:

- delivery takes each due event under a lease (`FOR UPDATE SKIP LOCKED`, 30 seconds), so
  two calls at once never send the same webhook;
- settling a payment is idempotent, whichever way it's heard about ([020](020-razorpay-test-mode.md));
- every capture or refund first asks Razorpay how the payment stands, so a second attempt
  after a lost reply isn't a second refund.

**The token goes to Upstash.** It only lets the holder trigger that idempotent backstop, the
same thing the schedule does anyway.

## Consequences

- A payment whose webhook and Checkout result were both lost is found within minutes of its
  checkout closing, not hours; a refund that failed is retried once its backoff allows (at
  most an hour), not whenever GitHub next runs.
- The backstop no longer depends on the repository being active.
- **Still not done:** nobody is told when something goes wrong. A refused webhook logs one
  line saying why (020), and QStash keeps a log of every call, but nothing pages anyone. A
  production box office would alert on refused webhooks and failed scheduled calls.
