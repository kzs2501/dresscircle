# 027: Actions the organiser confirms

**Status:** Accepted. Builds on [026](026-an-assistant-that-never-sees-the-data.md) and [016](016-refunds.md).

## Context

With the assistant reading questions about orders (026), the next thing an organiser asks
is to act on them: "refund every order for Night Market Jazz, the show was cancelled".
That's the part of an assistant enterprises guard most, and for a box office it's money
going back to people, which can't be undone. The pattern that holds up is the same
everywhere: the AI can propose, a person confirms what exactly will happen, and only then
does anything happen, through the same checked paths as doing it by hand.

## Decision

**The model has no way to act.** It still only fills in the question's form (026); a
request to refund is one more kind of answer, `refund-orders`, with an optional reason
from the API's own list. Nothing in the form refunds anything, whoever read the question:
the rules, Chrome's model or the cloud's.

**The answer is what would happen, said before it does.** The page asks the orders API for
the request's orders, fulfilled ones only (the only ones a refund can start for), reading
page after page up to 500, and says how many and how much, leaving out and counting
orders already refunding and orders of events the account may not refund. Past 500 it
says to narrow it down. The box office, which may read but not refund, is told only an
owner can.

**A review, always, and the number typed from 20 orders.** The owner opens a native dialog
(focus kept inside, Escape closes, focus goes back) that lists the orders, says the total
and that refunds can't be undone, and offers the reason the request gave, or "The buyer
asked for it". From 20 orders, the Refund button waits until the number is typed, the
way a code host asks for a repository's name before deleting it; while it waits, it keeps
focus and points to why, and a press does nothing.

**What the dialog lists is what's refunded.** The list is copied as the dialog opens, so
a sale or a refund arriving on the live stream while the owner reads can't change what
the button does. Once the batch starts, its progress takes the place of what could be
refunded, which falls as the batch's own refunds land, and a screen reader hears the
answer once, not again with every refund.

**Refunded one order at a time, through the single refund's endpoint** (016): the same
permission check, the same "only fulfilled, never twice" rules, the same chaos. Four are
in flight at once, quick enough for a few hundred and gentle on the payment provider.
Each order keeps its idempotency key while an answer may have been lost, so a retry
can't refund it twice, and gets a new one once the server has refused it. Stop lets the
refunds in flight finish and starts no more; what didn't go through is listed with the
API's reason, with "Retry the ones that failed". While refunds run, the browser asks
before the tab closes.

**No suggestion button refunds.** An irreversible action never starts from one click.

## Consequences

- An organiser can cancel a show's sales in a sentence, and still sees, chooses and
  confirms every refund, with the API's checks unchanged.
- **Measured:** the rules read a request to refund from a question about refunds ("how
  many refunds?", "which were refunded?"), and a question asking whether to ("should I
  refund…?") is never offered as one. The evals hold them at 85% across 38 questions,
  with the reason scored.
- **Not done:** a batch is in the browser tab that started it; a server would run it as a
  job that survives the tab, and send each buyer an email. Refunds are whole orders, as
  for one refund (016).
