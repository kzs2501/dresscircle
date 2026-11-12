import { CATEGORY_LABELS } from "@/core/statuses";
import { formatMonth } from "@/lib/format";
import type { EngineName } from "@/lib/ai/engine";
import type { EventFilters } from "@/features/events/domain/event-filters";
import type { QueryNote } from "@/features/events/domain/event-query";
import type { Interpretation } from "@/features/events/hooks/use-event-interpreter";

const ENGINE_LABELS: Record<EngineName | "none", string> = {
  "on-device": "On-device AI",
  cloud: "AI (free tier)",
  none: "Without AI",
};

/** The filters a request was read as, in the words the filters use. */
function understood({ category, city, month, q }: EventFilters): string[] {
  return [
    ...(category ? [CATEGORY_LABELS[category]] : []),
    ...(city ? [city] : []),
    ...(month ? [formatMonth(month)] : []),
    ...(q ? [`“${q}”`] : []),
  ];
}

const quoted = (words: readonly string[]) => words.map((word) => `“${word}”`).join(", ");

function describeNote(note: QueryNote): string {
  switch (note.kind) {
    case "price":
      return "Price isn’t a filter yet.";
    case "ticket-count":
      return "You choose how many tickets on the event’s page.";
    case "day":
      return `“${note.phrase}” isn’t a filter yet: events are listed by month.`;
    case "month-empty":
      return note.nextMonth
        ? `No events in ${formatMonth(note.month)}. The next ones are in ${formatMonth(note.nextMonth)}.`
        : `No events in ${formatMonth(note.month)}.`;
    case "not-applied":
      return `Not a filter: “${note.text}”.`;
    case "unused":
      return `Didn’t use ${quoted(note.words)}.`;
  }
}

/**
 * What a search written in your own words was read as, said back: the filters it set,
 * which engine read it (ADR 025), and anything it couldn't use, so nothing is dropped
 * silently. A live region, so a screen reader hears it when it changes.
 */
export function UnderstoodAs({ interpretation }: { interpretation: Interpretation }) {
  return (
    <div role="status" className="min-h-6 text-sm text-ink-2">
      {interpretation.status === "reading" && <p>Reading your request…</p>}
      {interpretation.status === "done" && <Reading {...interpretation} />}
    </div>
  );
}

function Reading({ filters, notes, engine }: Extract<Interpretation, { status: "done" }>) {
  const parts = understood(filters);
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span>
          {parts.length > 0 ? <>Understood as {parts.join(" · ")}.</> : <>Couldn’t turn that into filters.</>}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-3">
          {ENGINE_LABELS[engine ?? "none"]}
        </span>
      </p>
      {notes.length > 0 && (
        <ul className="text-ink-3">
          {notes.map((note) => (
            <li key={describeNote(note)}>{describeNote(note)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
