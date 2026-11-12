# 026: An assistant that never sees the data

**Status:** Accepted. Builds on [025](025-the-ai-fills-in-a-form.md), [014](014-organiser-access.md) and [015](015-reporting-at-scale.md).

## Context

The organisers' overview answers the questions its designers thought of: tickets sold,
revenue, a chart by day, the funnel, how buyers paid, each ticket type. Organisers ask
other ones: "how many refunds this week?", "which ticket type is selling best for the
jazz night?", "how did buyers pay last month?". Merchant dashboards now answer questions
like these in words (Shopify's Sidekick is the best-known), and the pattern that holds up
is the one search already uses: the AI chooses a query from a fixed set, and the product
answers it from its own data, citing where the numbers came from.

An assistant over sales data has a sharper risk than search: a model that sees the numbers
can misquote them, and one that's sent them leaks an organiser's revenue and buyers to
whoever runs the model.

## Decision

**The model never sees the data.** It reads the question and fills in a form
(`src/lib/ai/tasks/organiser-question.ts`): the kind of answer (a summary, sales over
time, ticket types, how buyers paid, the funnel, finding orders, or none of those), and
the event, period, order statuses, payment method and buyer it's about. On the cloud path,
the only things sent are the question and the catalogue's public list of events. The page
then asks the organisers' API, as the dashboard does, and writes the answer from what comes
back (`domain/answers.ts`): a sentence from a template, a picture where one helps (the
dashboard's own chart, cut to the period, or ticket types' meters), and a link to where the
numbers came from, such as the orders table filtered to exactly the orders counted.

**Rules first, and exact where they can be** (`domain/question.ts`). They read the
dashboard's words, order statuses and payment methods, an email or an order id, periods
worked out from today ("yesterday", "last week", "the past 30 days", "in October", the
latest one, since sales are history), and the account's events by the words of their
names. They read 28 of the 30 eval cases exactly right. When they can't place every word,
an engine reads the whole question, but where the rules found a period, a status, a method
or a buyer, theirs is kept: the free model took "this week" for the last seven days.

**Access is the API's, as before.** In the browser, an engine is offered only the signed-in
account's events, so an answer naming someone else's can't pass the schema, and the rules'
reading stands. The server's copy of the task lists every catalogue event, because the
route doesn't know who's asking; it only ever returns a choice, never data. Every number
still comes through the API, which checks the account's access as it always has (014).

**Answers stay true.** They're computed from the same React Query data as the dashboard,
so the live stream that refreshes the dashboard refreshes them. Counting orders asks the
API for one row and reads its total, under the orders' query key.

**Honest about what it can't do:**

- Sales by ticket type aren't recorded day by day, so "which sold fastest?" is answered by
  share sold so far, and says so.
- How buyers paid and the funnel can't be cut to a period yet, so with a period they say
  they're every sale so far.
- Sales by day go back as far as the history does, and an answer asking about earlier says
  how far back that is.
- A question it can't answer gets "I can answer questions about your sales, ticket types,
  payments and orders", with the suggestions.

## Consequences

- An organiser can ask in their own words, or click one of five suggestions, which need no
  engine at all. The last five questions stay in the panel, newest first, and one live
  region says the newest answer.
- A wrong reading shows in its "Understood as" line, and costs a wrong but true answer:
  every number shown is the API's.
- **The free tier is tighter here:** the question's instructions list the events, about
  1,500 tokens a request, and Groq's free tier allows about 8,000 tokens a minute across
  every visitor. Past that, the cloud engine answers `ai_unavailable` and the rules read
  the question alone.
- **Measured:** with the free model, 28 of 30 cases exactly right; its misses vary between
  runs ("how is the jazz night going?" once came back as nothing it could answer). CI holds
  the rules alone to 85%.
- **Next:** acting on an answer, such as refunding the orders it found, is the following
  step, with the organiser confirming before anything happens.
