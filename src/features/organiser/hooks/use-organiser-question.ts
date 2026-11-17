"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrganiserEventDto } from "@/contract/dto";
import { todayInIndia } from "@/lib/ai/engine";
import { organiserQuestionTask, type OrganiserQuestion, type QuestionEvent } from "@/lib/ai/tasks/organiser-question";
import { foreignEventIn, readingWithAnswer, readQuestion } from "@/features/organiser/domain/question";
import { useAskedQuestions, type Asked } from "./use-asked-questions";

export { MAX_ASKED, type Asked } from "./use-asked-questions";

const NO_EVENTS: readonly QuestionEvent[] = [];
const noCatalogue = () => Promise.resolve(NO_EVENTS);
/** How long a question waits for the public events, if they haven't loaded yet, before going on without. */
export const CATALOGUE_WAIT_MS = 2_000;

/** The public events, or none if they fail or take longer than `CATALOGUE_WAIT_MS`. */
function catalogueFrom(load: () => Promise<readonly QuestionEvent[]>) {
  const late = new Promise<readonly QuestionEvent[]>((resolve) => {
    setTimeout(() => {
      resolve(NO_EVENTS);
    }, CATALOGUE_WAIT_MS);
  });
  return Promise.race([load(), late]).catch(() => NO_EVENTS);
}

/**
 * An organiser's questions about their sales (ADR 026). The rules read a question first;
 * only one they can't fully place goes to an AI engine, whose code loads then. The
 * engines choose among the signed-in account's own events, so an answer about someone
 * else's can't pass. A question that names no event is about the one the overview shows.
 * One that names another organiser's event, from the public events `loadCatalogue` gives
 * (waited for, if a question comes before they've loaded), is told it isn't theirs,
 * without an engine (DC-12).
 */
export function useOrganiserQuestion(
  events: readonly OrganiserEventDto[],
  shownEvent: string | null,
  loadCatalogue: () => Promise<readonly QuestionEvent[]> = noCatalogue,
) {
  const { asked, remember: keep } = useAskedQuestions();
  const [pending, setPending] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const remember = useCallback(
    (entry: Omit<Asked, "id">) => {
      keep({ ...entry, question: { ...entry.question, event: entry.question.event ?? shownEvent } });
    },
    [keep, shownEvent],
  );

  /** A suggestion: already a question, so nothing reads it. */
  const askReady = useCallback(
    (text: string, question: OrganiserQuestion) => {
      controller.current?.abort();
      setPending(null);
      remember({ text, question, engine: null, unused: [] });
    },
    [remember],
  );

  const ask = useCallback(
    async (text: string) => {
      controller.current?.abort();
      const today = todayInIndia(Date.now());
      const reading = readQuestion(text, events, today);
      // The rules' reading is held to the same form as an engine's, in case a rule ever
      // reads something the form can't hold (DC-05 read a period that ran backwards).
      const isWellFormed = organiserQuestionTask(events, today).schema.safeParse(reading.question).success;
      if (reading.hasIntent && reading.unknownWords.length === 0 && isWellFormed) {
        setPending(null);
        remember({ text, question: reading.question, engine: null, unused: [] });
        return;
      }
      const current = new AbortController();
      controller.current = current;
      setPending(text);
      // An engine may choose only the account's events, so it would read another
      // organiser's as none, which is all of theirs.
      if (reading.question.event === null && reading.unknownWords.length > 0) {
        const notYours = foreignEventIn(text, events, await catalogueFrom(loadCatalogue), today);
        if (current.signal.aborted) return;
        if (notYours !== null) {
          controller.current = null;
          setPending(null);
          remember({ text, question: reading.question, engine: null, unused: [], notYours });
          return;
        }
      }
      const result =
        events.length > 0
          ? await import("@/lib/ai/plan").then(({ planWithEngines }) =>
              planWithEngines(organiserQuestionTask(events, today), text, { signal: current.signal }),
            )
          : null;
      if (current.signal.aborted) return;
      controller.current = null;
      setPending(null);
      if (result?.ok) {
        remember({ text, question: readingWithAnswer(reading, result.answer), engine: result.engine, unused: [] });
      } else {
        remember({ text, question: reading.question, engine: null, unused: reading.unknownWords });
      }
    },
    [events, loadCatalogue, remember],
  );

  return { asked, pending, ask, askReady };
}
