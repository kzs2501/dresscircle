import type { EngineName } from "@/lib/ai/engine";

const ENGINE_LABELS: Record<EngineName | "none", string> = {
  "on-device": "On-device AI",
  cloud: "AI (free tier)",
  none: "Without AI",
};

/**
 * Which engine read a request (ADR 025): Chrome's built-in model, the free cloud tier,
 * or the page's own rules. Said wherever AI read something, so nobody has to guess.
 */
export function EngineBadge({ engine }: { engine: EngineName | null }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-3">
      {ENGINE_LABELS[engine ?? "none"]}
    </span>
  );
}
