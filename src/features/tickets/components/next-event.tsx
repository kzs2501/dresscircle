"use client";

import Link from "next/link";
import { formatEventDate, formatEventTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { WalletTicket } from "@/lib/wallet";
import { useWallet } from "@/features/tickets/hooks/use-wallet";

/** The soonest event this device holds a ticket for, and how many tickets; none if it holds none. */
export function nextEventOf(tickets: readonly WalletTicket[]) {
  const valid = tickets.filter((ticket) => !ticket.isRefunded);
  const [soonest] = valid.toSorted((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  if (!soonest) return null;
  return { ticket: soonest, count: valid.filter((ticket) => ticket.eventSlug === soonest.eventSlug).length };
}

/**
 * A box office that remembers you: the next event this device has tickets for, read
 * from the offline wallet once the page is in the browser. Nothing at all when it has
 * none, so a first visit isn't told about tickets it doesn't have.
 */
export function NextEvent() {
  const wallet = useWallet();
  const next = wallet.kind === "ready" ? nextEventOf(wallet.tickets) : null;
  if (!next) return null;
  const { ticket, count } = next;
  return (
    <section
      aria-labelledby="next-event"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-accent-soft p-5"
    >
      <div className="min-w-0">
        <h2 id="next-event" className="text-xs tracking-[0.16em] text-ink-2 uppercase">
          Your next event
        </h2>
        <p className="mt-1 font-display text-xl font-semibold">{ticket.eventName}</p>
        <p className="tabular mt-0.5 text-sm text-ink-2">
          {formatEventDate(ticket.startsAt, ticket.timeZone)} · {formatEventTime(ticket.startsAt, ticket.timeZone)} ·{" "}
          {ticket.venue}, {ticket.city}
        </p>
      </div>
      <Link
        href={routes.tickets()}
        className="inline-flex min-h-11 press items-center rounded-lg border border-line bg-card px-5 text-sm font-medium hover:bg-sunk"
      >
        {count === 1 ? "Open the ticket" : `Open the ${String(count)} tickets`}
      </Link>
    </section>
  );
}
