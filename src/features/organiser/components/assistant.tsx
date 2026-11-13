"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { OrganiserEventDto } from "@/contract/dto";
import { writeOrderSearchParams } from "@/contract/queries";
import type { OrderStatus, PaymentMethod } from "@/core/statuses";
import { formatCount, formatPercent } from "@/lib/format";
import { organiserQueries } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { MAX_AI_REQUEST_LENGTH } from "@/lib/ai/engine";
import type { OrganiserQuestion, QuestionIntent } from "@/lib/ai/tasks/organiser-question";
import { Button } from "@/components/ui/button";
import { EngineBadge } from "@/components/ui/engine-badge";
import { Spinner } from "@/components/ui/spinner";
import { answerFor, formatPeriod, needsOf, type Answer } from "@/features/organiser/domain/answers";
import { REFUND_REASON_LABELS } from "@/features/organiser/domain/refund-reasons";
import { useOrganiserQuestion, type Asked } from "@/features/organiser/hooks/use-organiser-question";
import { RefundBatchAnswer, RefundBatchSentence } from "./refund-batch";
import { SalesChart } from "./sales-chart";

const BLANK: OrganiserQuestion = {
  intent: "summary",
  event: null,
  from: null,
  to: null,
  statuses: [],
  method: null,
  search: null,
  refundReason: null,
  notApplied: [],
};

/** Questions an organiser asks most, ready-read: a click needs no engine. */
export const SUGGESTIONS: readonly { label: string; question: OrganiserQuestion }[] = [
  { label: "Sales in the last 7 days", question: { ...BLANK, intent: "sales-over-time" } },
  { label: "Which ticket type is selling best?", question: { ...BLANK, intent: "ticket-types" } },
  { label: "Refunded orders", question: { ...BLANK, intent: "find-orders", statuses: ["refunded"] } },
  { label: "How buyers paid", question: { ...BLANK, intent: "payment-mix" } },
  { label: "From reservation to payment", question: { ...BLANK, intent: "funnel" } },
];

const INTENT_LABELS: Record<QuestionIntent, string> = {
  summary: "Sales so far",
  "sales-over-time": "Sales over time",
  "ticket-types": "Ticket types",
  "payment-mix": "How buyers paid",
  funnel: "From reservation to ticket",
  "find-orders": "Orders",
  "refund-orders": "Refund orders",
  unsupported: "Not something I can answer",
};
const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  failed: "Failed",
  expired: "Expired",
  refunded: "Refunded",
};
const METHOD_LABELS: Record<PaymentMethod, string> = { card: "Card", upi: "UPI", razorpay: "Razorpay" };

const CHIP =
  "inline-flex min-h-10 press items-center rounded-full border border-line bg-card px-4 text-sm text-ink-2 hover:bg-sunk";

/** How a question was read, in the dashboard's words. */
function understood(question: OrganiserQuestion, events: readonly OrganiserEventDto[]) {
  const eventName = events.find((event) => event.slug === question.event)?.name;
  return [
    INTENT_LABELS[question.intent],
    ...(question.intent === "unsupported" ? [] : [eventName ?? "All your events"]),
    ...(question.from || question.to
      ? [formatPeriod(question.from ?? question.to ?? "", question.to ?? question.from ?? "")]
      : []),
    ...question.statuses.map((status) => STATUS_LABELS[status]),
    ...(question.method ? [METHOD_LABELS[question.method]] : []),
    ...(question.search ? [`“${question.search}”`] : []),
    ...(question.intent === "refund-orders" && question.refundReason
      ? [REFUND_REASON_LABELS[question.refundReason]]
      : []),
  ];
}

/** The numbers a question needs, live: the dashboard's own queries, so they're shared and kept current. */
function useAnswer(asked: Asked, events: readonly OrganiserEventDto[]) {
  const needs = needsOf(asked.question);
  const isUnsupported = asked.question.intent === "unsupported";
  const metrics = useQuery({
    ...organiserQueries.metrics(needs.kind === "metrics" ? needs.eventSlug : undefined),
    enabled: needs.kind === "metrics" && !isUnsupported,
  });
  const count = useQuery({
    ...organiserQueries.orderCount(
      needs.kind === "orders" ? needs.filters : { status: [], orderBy: { field: "createdAt", isDescending: true } },
    ),
    enabled: needs.kind === "orders",
  });
  const answer = answerFor(asked.question, { events, metrics: metrics.data, orderCount: count.data });
  const isFailed = answer === null && (metrics.isError || count.isError);
  return { answer, isFailed };
}

function Visual({ answer }: { answer: Answer }) {
  const id = useId();
  const { visual } = answer;
  switch (visual.kind) {
    case "none":
      return null;
    case "sales-chart":
      return <SalesChart metrics={visual.metrics} headingLevel={3} />;
    case "ticket-types":
      return (
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          {visual.tiers.map((tier) => (
            <li key={tier.tierId}>
              <div className="flex justify-between gap-3">
                <label htmlFor={`${id}-${tier.tierId}`}>
                  {tier.tierName} <span className="text-ink-3">· {tier.eventName}</span>
                </label>
                <span className="tabular-nums">
                  {formatCount(tier.sold)} of {formatCount(tier.capacity)}
                </span>
              </div>
              <meter
                id={`${id}-${tier.tierId}`}
                min={0}
                max={tier.capacity}
                value={tier.sold}
                className="mt-1.5 block h-2 w-full"
              />
            </li>
          ))}
        </ul>
      );
    case "shares":
      return (
        <ul aria-label={visual.title} className="space-y-3 text-sm">
          {visual.items.map((item) => (
            <li key={item.label}>
              <div className="flex justify-between gap-3">
                <span>{item.label}</span>
                <span className="tabular-nums">
                  {formatCount(item.count)}{" "}
                  <span className="text-ink-3">({formatPercent(item.count, item.whole)})</span>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-sunk">
                <div className="h-2 rounded-full bg-accent" style={{ width: formatPercent(item.count, item.whole) }} />
              </div>
            </li>
          ))}
        </ul>
      );
  }
}

function Source({ answer, events }: { answer: Answer; events: readonly OrganiserEventDto[] }) {
  const { source } = answer;
  if (!source) return null;
  if (source.kind === "orders") {
    const label =
      source.count === 0 ? "Open the orders table" : `Open ${source.count === 1 ? "it" : "them"} in the orders table`;
    return (
      <Link
        href={routes.organiserOrders(writeOrderSearchParams(source.filters))}
        className="text-sm underline underline-offset-4"
      >
        {label}
      </Link>
    );
  }
  const eventName = events.find((event) => event.slug === source.eventSlug)?.name;
  return eventName ? (
    <Link href={routes.organiser(source.eventSlug ?? undefined)} className="text-sm underline underline-offset-4">
      Show {eventName} on the dashboard
    </Link>
  ) : null;
}

/**
 * One question and its answer: how it was read and by which engine, the answer's
 * sentence, a picture where one helps, anything that couldn't be used, and a link to
 * where the numbers came from. Pure, so the catalogue can show every kind.
 */
export function AnswerCard({
  asked,
  answer,
  events,
  isFailed = false,
  body,
}: {
  asked: Asked;
  answer: Answer | null;
  events: readonly OrganiserEventDto[];
  isFailed?: boolean;
  /** In place of a sentence and a picture: what a request to refund answers with. */
  body?: ReactNode;
}) {
  const titleId = useId();
  const notes = [
    ...asked.question.notApplied.map((text) => `Not used: “${text}”.`),
    ...(asked.unused.length ? [`Didn’t use ${asked.unused.map((word) => `“${word}”`).join(", ")}.`] : []),
    ...(answer?.notes ?? []),
  ];
  return (
    <article aria-labelledby={titleId} className="space-y-3 rounded-lg border border-line p-4">
      <h3 id={titleId} className="font-medium">
        “{asked.text}”
      </h3>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-2">
        <span>Understood as {understood(asked.question, events).join(" · ")}.</span>
        <EngineBadge engine={asked.engine} />
      </p>
      {body ??
        (answer ? (
          <>
            <p>{answer.sentence}</p>
            <Visual answer={answer} />
            {notes.length > 0 && (
              <ul className="text-sm text-ink-3">
                {notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            <Source answer={answer} events={events} />
          </>
        ) : isFailed ? (
          <p className="text-sm text-bad">Couldn’t load the numbers for this. Check your connection and ask again.</p>
        ) : (
          <Spinner label="Working out the answer" />
        ))}
    </article>
  );
}

function LiveAnswer({ asked, events }: { asked: Asked; events: readonly OrganiserEventDto[] }) {
  const { answer, isFailed } = useAnswer(asked, events);
  return <AnswerCard asked={asked} answer={answer} events={events} isFailed={isFailed} />;
}

/** The newest answer's sentence, for the panel's one live region. */
function LatestSentence({ asked, events }: { asked: Asked; events: readonly OrganiserEventDto[] }) {
  const { answer } = useAnswer(asked, events);
  return answer?.sentence ?? null;
}

/** One question, answered: a request to refund by the orders it covers, anything else from the numbers. */
function AskedItem({ asked, events }: { asked: Asked; events: readonly OrganiserEventDto[] }) {
  return asked.question.intent === "refund-orders" ? (
    <AnswerCard
      asked={asked}
      answer={null}
      events={events}
      body={<RefundBatchAnswer question={asked.question} events={events} />}
    />
  ) : (
    <LiveAnswer asked={asked} events={events} />
  );
}

/**
 * Ask about your sales (ADR 026), at the top of the overview: a question in your own
 * words or a suggestion, answered from the dashboard's own numbers. The last few stay,
 * newest first, and keep up with the live numbers.
 */
export function Assistant({
  events,
  shownEvent,
}: {
  events: readonly OrganiserEventDto[];
  /** The event the overview shows: what a question that names none is about. */
  shownEvent: string | null;
}) {
  const { asked, pending, ask, askReady } = useOrganiserQuestion(events, shownEvent);
  const [text, setText] = useState("");
  const latest = asked[0];

  return (
    <section aria-labelledby="assistant-title" className="space-y-4 rounded-xl border border-line bg-card p-5">
      <h2 id="assistant-title" className="font-display text-lg font-semibold">
        Ask about your sales
      </h2>
      <form
        aria-labelledby="assistant-title"
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const question = text.trim();
          if (!question) return;
          setText("");
          void ask(question);
        }}
      >
        <label htmlFor="assistant-question" className="sr-only">
          Your question
        </label>
        <input
          id="assistant-question"
          type="text"
          value={text}
          maxLength={MAX_AI_REQUEST_LENGTH}
          autoComplete="off"
          placeholder="Like “refunded orders last week”"
          onChange={(event) => {
            setText(event.target.value);
          }}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 text-base placeholder:text-ink-3"
        />
        <Button type="submit" isBusy={pending !== null}>
          Ask
        </Button>
      </form>
      <div role="group" aria-label="Suggested questions" className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            className={CHIP}
            onClick={() => {
              askReady(suggestion.label, suggestion.question);
            }}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {pending !== null ? (
          "Reading your question…"
        ) : latest?.question.intent === "refund-orders" ? (
          <RefundBatchSentence question={latest.question} events={events} />
        ) : latest ? (
          <LatestSentence asked={latest} events={events} />
        ) : null}
      </p>
      {pending !== null && (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Spinner className="size-4" /> Reading “{pending}”…
        </p>
      )}
      {asked.length > 0 && (
        <ol aria-label="Your questions, newest first" className="space-y-3">
          {asked.map((entry) => (
            <li key={entry.id}>
              <AskedItem asked={entry} events={events} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
