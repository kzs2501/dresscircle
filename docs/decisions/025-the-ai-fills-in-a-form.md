# 025: The AI fills in a form

**Status:** Accepted. Builds on [023](023-a-box-office-first.md).

## Context

The home page's search matches every word typed against each event's name, venue, city
and kind. People don't search like that: they ask for "stand-up in Delhi in February" or
"something mellow by the sea", and every word of either matches nothing.

AI could read requests like those, but three things ruled out the usual chat box:

- **It must cost nothing,** for visitors and for the project. There's no budget for a paid
  model, and the demo must keep working when any free allowance runs out.
- **It must not make things up.** A box office that invents an event, a price or a seat
  count is worse than one without AI.
- **It must not be a free model for anyone who finds the endpoint.**

What companies ship for this kind of product points the same way: assistants that act
through the product's own filters and reports, with their answers grounded in its data,
rather than writing free-form text or SQL.

## Decision

**The AI fills in a form, and the page's own code does the rest.** A task
(`src/lib/ai/engine.ts`) is a set of instructions, a few worked examples, a Zod schema the
answer must pass, and a JSON Schema the model is held to while it writes. For search, the
form is the existing filters: a kind of event and a city (each an enum of what the
catalogue has, or null), a month, a word or two to search names for, and a list of what
was asked that isn't a filter. The page checks the answer against the same rules the URL
uses, so the worst a wrong answer can do is choose a filter the person sees and can undo.

**Rules read the request first** (`event-query.ts`): kinds of event by their everyday
names, the catalogue's cities and their old names, months with or without a year, and the
things a request often asks for that aren't filters (a price, a number of tickets, a
day), which are reported rather than dropped. Only words the rules can't place go to an
engine. The rules alone read 28 of the 32 eval cases exactly right; the four they miss
need an engine.

**Engines are tried in order, and each is free:**

1. **On the device:** Chrome's built-in model (Gemini Nano), through the Prompt API, held
   to the JSON Schema by `responseConstraint`. Nothing leaves the browser. It's used only
   when the model is already installed: a search never starts its multi-gigabyte download.
2. **In the cloud:** `POST /ai/plan`, which asks an open gpt-oss model on Groq's free tier
   (about a thousand requests a day, no card), with strict structured output.
3. **None:** the rules' reading stands, with the words it didn't use said back.

Each engine has four seconds before the next is asked. The engines' code loads on the
first Enter, so the home page's first load carries none of it.

**`/ai/plan` isn't a way to reach a model.** It takes a task's name and up to 200
characters of text; the server builds the task itself, from the catalogue and its own
clock, and answers only with what passed the schema. Each client may ask 10 times a minute
and 60 an hour. No key, a spent quota, a slow or malformed answer are all one problem,
`503 ai_unavailable` with `Retry-After`, after which the tab stops asking for that long.
It's outside `/api/*`, so the sandbox's service worker lets it through to the server.

**Said back, always:** under the filters, a live region says what the request was read as,
which engine read it ("On-device AI", "AI (free tier)" or "Without AI"), and anything it
couldn't use.

## Consequences

- A wrong answer is visible and undoable (Back), and can't invent anything: the model never
  writes text a person reads, only choices from lists.
- A request with instructions in it ("ignore all previous instructions…") can't do
  anything: the answer still has to be five fields from fixed lists.
- **What leaves the browser:** only on the cloud path, the request's text. The catalogue's
  kinds and cities go with it from the server; nothing about the visitor does. The log
  says why a request failed, never what was asked or what the model wrote.
- **The rate limit is in each server instance's memory,** so instances count separately.
  That's acceptable because the real ceiling is Groq's daily quota, and running into it
  costs nothing: visitors get the rules' reading until it resets.
- **Quality is measured, not assumed:** `npm run eval:ai` scores 32 requests field by
  field. CI runs the rules alone and requires 80%; `EVAL_ENGINE=cloud` asks the model too,
  by hand.
- **Not done:** the real on-device model can't run in Playwright's Chromium, so that
  engine is tested with a stand-in for the Prompt API. The organisers' assistant, the next
  task built on this, gets its own decision.
