"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PauseToggle } from "@/components/ui/pause-toggle";
import type { ActivityDto, ActivityEntryDto } from "@/contract/dto";
import type { ActivityKind } from "@/core/statuses";
import { formatAgo, formatCount } from "@/lib/format";
import { activityQueries } from "@/lib/queries";

/** How often the feed asks again while it's visible and not paused. */
const ACTIVITY_REFRESH_MS = 5_000;
/** How many of the latest things it shows. */
const SHOWN = 5;

const KINDS: Record<ActivityKind, { label: string; className: string }> = {
  sold: { label: "Sold", className: "bg-ok-soft text-ink" },
  held: { label: "Held", className: "bg-warn-soft text-ink" },
  released: { label: "Released", className: "bg-sunk text-ink-2" },
};

function Counter({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="tabular mt-0.5 text-2xl font-medium">
        {value ?? <span aria-hidden="true" className="inline-block h-7 w-12 rounded-md bg-sunk align-middle" />}
      </dd>
    </div>
  );
}

function Entry({ entry, eventName, serverMs }: { entry: ActivityEntryDto; eventName: string; serverMs: number }) {
  const kind = KINDS[entry.kind];
  return (
    <li className="flex items-baseline gap-3 text-sm">
      <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium ${kind.className}`}>{kind.label}</span>
      <span className="min-w-0 flex-1">
        <span className="tabular">{entry.quantity}</span> × {entry.tierName}, {eventName}
        {entry.isSimulated && <span className="text-ink-3"> · simulated</span>}
      </span>
      <span className="tabular shrink-0 text-xs text-ink-3">{formatAgo(serverMs - Date.parse(entry.at))}</span>
    </li>
  );
}

function Feed({ data, eventNames }: { data: ActivityDto; eventNames: Readonly<Record<string, string>> }) {
  const serverMs = Date.parse(data.serverTime);
  const recent = data.recent.slice(0, SHOWN);
  if (recent.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        Quiet right now.
        {data.lastSaleAt && ` The last sale was ${formatAgo(serverMs - Date.parse(data.lastSaleAt))}.`}
      </p>
    );
  }
  return (
    <>
      <ul aria-label="Latest at the box office" className="space-y-2">
        {recent.map((entry) => (
          <Entry
            key={`${entry.at}-${entry.kind}-${entry.eventSlug}-${entry.tierName}`}
            entry={entry}
            eventName={eventNames[entry.eventSlug] ?? entry.eventSlug}
            serverMs={serverMs}
          />
        ))}
      </ul>
      {recent.some((entry) => entry.isSimulated) && (
        <p className="mt-3 text-xs text-ink-3">
          Simulated sales are other buyers this demo makes up, so its box office is never empty.
        </p>
      )}
    </>
  );
}

/**
 * What the box office is doing right now: tickets held, the queue, today's sales, and the
 * latest few things that happened. It asks again every few seconds while the tab is in
 * view, and can be paused. It never announces itself: a feed that talked every few
 * seconds would drown out the page.
 */
export function BoxOfficeLive({ eventNames }: { eventNames: Readonly<Record<string, string>> }) {
  const [isPaused, setIsPaused] = useState(false);
  const { data, isError } = useQuery({
    ...activityQueries.live(),
    refetchInterval: isPaused ? false : ACTIVITY_REFRESH_MS,
  });

  return (
    <section aria-labelledby="box-office-live" className="rounded-xl border-4 border-double border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="box-office-live" className="font-display text-xl font-semibold">
          Box office, live
        </h2>
        <PauseToggle
          tone={isPaused ? "paused" : "live"}
          label={isPaused ? "Paused" : "Live"}
          isPaused={isPaused}
          onToggle={() => {
            setIsPaused(!isPaused);
          }}
          buttonLabel="Pause updates"
        />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        <Counter label="Held now" value={data ? formatCount(data.heldNow) : null} />
        <Counter
          label="In a queue"
          value={data ? (data.queuing === null ? "None" : formatCount(data.queuing)) : null}
        />
        <Counter label="Sold today" value={data ? formatCount(data.soldToday) : null} />
      </dl>
      {/* Room for the five latest, kept whether they've arrived or not, so nothing below moves. */}
      <div className="mt-5 min-h-40 border-t border-line pt-4">
        {data ? (
          <Feed data={data} eventNames={eventNames} />
        ) : isError ? (
          <p className="text-sm text-ink-2">The live feed isn’t available right now. Everything else works.</p>
        ) : null}
      </div>
    </section>
  );
}
