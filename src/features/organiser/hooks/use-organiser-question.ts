"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrganiserEventDto } from "@/contract/dto";
import { todayInIndia, type EngineName } from "@/lib/ai/engine";
import { organiserQuestionTask, type OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";
import { readQuestion } from "@/features/organiser/domain/question";

/** One question asked, and how it was read. The answer is worked out from live numbers when shown. */
export interface Asked {
  id: number;
  text: string;
  question: OrganiserQuestion;
  /** Which AI engine read it, or null when rules (or a suggestion) did. */
  engine: EngineName | null;
  /** Words neither the rules nor an engine could use. */
  unused: string[];
}

/** Questions kept in the panel, newest first. In memory only: a reload starts afresh. */
export const MAX_ASKED = 5;

/**
 * An organiser's questions about their sales (ADR 026). The rules read a question first;
 * only one they can't fully place goes to an AI engine, whose code loads then. The
 * engines choose among the signed-in account's own events, so an answer about someone
 * else's can't pass. A question that names no event is about the one the overview shows.
 */
export function useOrganiserQuestion(events: readonly OrganiserEventDto[], shownEvent: string | null) {
  const [asked, setAsked] = useState<Asked[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => () => controller.current?.abort(), []);

  const remember = useCallback(
    (entry: Omit<Asked, "id">) => {
      const question = { ...entry.question, event: entry.question.event ?? shownEvent };
      setAsked((previous) => [{ ...entry, question, id: nextId.current++ }, ...previous].slice(0, MAX_ASKED));
    },
    [shownEvent],
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
        remember({ text, question: result.answer, engine: result.engine, unused: [] });
      } else {
        remember({ text, question: reading.question, engine: null, unused: reading.unknownWords });
      }
    },
    [events, remember],
  );

  return { asked, pending, ask, askReady };
}
