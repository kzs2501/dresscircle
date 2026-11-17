"use client";

import Link from "next/link";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  announcementOf,
  needsAttention,
  resultOf,
  summaryOf,
  type RefundRun,
} from "@/features/organiser/domain/refund-run";
import { useRefundRuns } from "@/features/organiser/hooks/use-refund-runs";

/**
 * The organiser's refund batches, on every page of the dashboard (ADR 027): one running
 * carries on while the organiser looks at orders, and says how far it's got; one that
 * left orders unrefunded says so until it's dealt with or dismissed. A screen reader
 * hears each batch start, pass each quarter, and end; not every order.
 */
export function RefundsInProgressView({
  runs,
  onStop,
  onDismiss,
}: {
  runs: readonly RefundRun[];
  onStop: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const shown = runs.filter(needsAttention);
  return (
    <>
      <p role="status" className="sr-only">
        {runs.map(announcementOf).join(" ")}
      </p>
      {shown.length > 0 && (
        <section aria-label="Refunds" className="mt-4 space-y-2">
          {shown.map((run) => {
            const summary = summaryOf(run);
            return (
              <div
                key={run.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-2 text-sm"
              >
                {summary.isRunning ? (
                  <>
                    <Spinner className="size-4" />
                    <span>
                      Refunding {run.label}: {formatCount(summary.done)} of {formatCount(summary.total)}. Leaving the
                      dashboard stops what hasn’t started.
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9"
                      onClick={() => {
                        onStop(run.id);
                      }}
                    >
                      Stop
                    </Button>
                  </>
                ) : (
                  <>
                    <span>
                      {run.label}: {resultOf(summary)}
                    </span>
                    <Link href={routes.organiser()} className="underline underline-offset-4">
                      Open on the overview
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-9"
                      onClick={() => {
                        onDismiss(run.id);
                      }}
                    >
                      Dismiss
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

export function RefundsInProgress() {
  const { runs, stop, dismiss } = useRefundRuns();
  return <RefundsInProgressView runs={Object.values(runs)} onStop={stop} onDismiss={dismiss} />;
}
