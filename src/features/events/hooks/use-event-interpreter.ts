"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventSearchTask, searchToday } from "@/lib/ai/tasks/event-search";
import type { EngineName } from "@/lib/ai/engine";
import { filterChoices, type EventFilters } from "@/features/events/domain/event-filters";
import { readEventQuery, readingWithAnswer, type QueryNote } from "@/features/events/domain/event-query";

type Listed = Parameters<typeof filterChoices>[0][number];

export type Interpretation =
  | { status: "idle" }
  | { status: "reading"; request: string }
  | {
      status: "done";
      request: string;
      filters: EventFilters;
      notes: QueryNote[];
      /** Which AI engine helped, or null when the rules read it alone. */
      engine: EngineName | null;
    };

/**
 * A search written in your own words, turned into filters (ADR 025). The rules read it
 * first, free and instantly; only words they can't place go to an AI engine, whose code
 * loads then, so the home page's first load carries none of it. Asking again, or typing,
 * drops an answer still on its way.
 */
export function useEventInterpreter(events: readonly Listed[]) {
  const [interpretation, setInterpretation] = useState<Interpretation>({ status: "idle" });
  const pending = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  const clear = useCallback(() => {
    cancel();
    setInterpretation({ status: "idle" });
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  /** The filters a request reads as, or null if a newer request took its place. */
  const interpret = useCallback(
    async (request: string): Promise<EventFilters | null> => {
      cancel();
      const today = searchToday(Date.now());
      const reading = readEventQuery(request, events, today);
      if (reading.unknownWords.length === 0) {
        setInterpretation({ status: "done", request, ...reading, engine: null });
        return reading.filters;
      }

      const controller = new AbortController();
      pending.current = controller;
      setInterpretation({ status: "reading", request });
      const { planWithEngines } = await import("@/lib/ai/plan");
      const result = await planWithEngines(eventSearchTask(filterChoices(events), today), request, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      pending.current = null;

      if (result.ok) {
        const merged = readingWithAnswer(reading, result.answer, events);
        setInterpretation({ status: "done", request, ...merged, engine: result.engine });
        return merged.filters;
      }
      const notes: QueryNote[] = [...reading.notes, { kind: "unused", words: reading.unknownWords }];
      setInterpretation({ status: "done", request, filters: reading.filters, notes, engine: null });
      return reading.filters;
    },
    [cancel, events],
  );

  return { interpretation, interpret, cancel, clear };
}
