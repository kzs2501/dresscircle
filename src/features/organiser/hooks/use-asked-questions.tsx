"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { EngineName } from "@/lib/ai/engine";
import type { OrganiserQuestion } from "@/lib/ai/tasks/organiser-question";

/** One question asked, and how it was read. The answer is worked out from live numbers when shown. */
export interface Asked {
  id: number;
  text: string;
  question: OrganiserQuestion;
  /** Which AI engine read it, or null when rules (or a suggestion) did. */
  engine: EngineName | null;
  /** Words neither the rules nor an engine could use. */
  unused: string[];
  /** Another organiser's event the question named (DC-12): answered by saying so, with no numbers. */
  notYours?: string;
}

/** Questions kept in the panel, newest first. In memory only: a reload starts afresh. */
export const MAX_ASKED = 5;

interface AskedQuestions {
  asked: Asked[];
  remember: (entry: Omit<Asked, "id">) => void;
}

const AskedQuestionsContext = createContext<AskedQuestions | null>(null);

/**
 * The questions an organiser has asked, kept by the dashboard's shell: coming back to the
 * overview from another page shows them still, with any refund batch they started
 * (ADR 027). Signing out forgets them.
 */
export function AskedQuestionsProvider({ children }: { children: ReactNode }) {
  const [asked, setAsked] = useState<Asked[]>([]);
  const nextId = useRef(1);
  const remember = useCallback((entry: Omit<Asked, "id">) => {
    setAsked((previous) => [{ ...entry, id: nextId.current++ }, ...previous].slice(0, MAX_ASKED));
  }, []);
  const value = useMemo(() => ({ asked, remember }), [asked, remember]);
  return <AskedQuestionsContext value={value}>{children}</AskedQuestionsContext>;
}

export function useAskedQuestions(): AskedQuestions {
  const context = useContext(AskedQuestionsContext);
  if (!context)
    throw new Error("useAskedQuestions needs an AskedQuestionsProvider, which the dashboard's shell gives.");
  return context;
}
