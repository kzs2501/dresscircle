"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrganiserEventDto } from "@/contract/dto";
import { todayInIndia } from "@/lib/ai/engine";
import { organiserQuestionTask, type OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";
import { readingWithAnswer, readQuestion } from "@/features/organiser/domain/question";
import { useAskedQuestions, type Asked } from "./use-asked-questions";

export { MAX_ASKED, type Asked } from "./use-asked-questions";

/**
 * An organiser's questions about their sales (ADR 026). The rules read a question first;
 * only one they can't fully place goes to an AI engine, whose code loads then. The
 * engines choose among the signed-in account's own events, so an answer about someone
 * else's can't pass. A question that names no event is about the one the overview shows.
 */
export function useOrganiserQuestion(events: readonly OrganiserEventDto[], shownEvent: string | null) {
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
      if (reading.hasIntent && reading.unknownWords.length === 0) {
        setPending(null);
        remember({ text, question: reading.question, engine: null, unused: [] });
        return;
      }

      const current = new AbortController();
      controller.current = current;
      setPending(text);
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
    [events, remember],
  );

  return { asked, pending, ask, askReady };
}
