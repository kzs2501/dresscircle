import { Button } from "./button";

export type LiveTone = "live" | "paused" | "waiting";

const DOTS: Record<LiveTone, string> = { live: "bg-ok", paused: "bg-ink-3", waiting: "bg-warn" };

/**
 * A live view's state, and the button that pauses it: WCAG 2.2.2 asks that anything that
 * updates on its own, beside other content, can be paused. The state is a status, so a
 * screen reader hears "Paused" when it's pressed.
 */
export function PauseToggle({
  tone,
  label,
  isPaused,
  onToggle,
  buttonLabel = "Pause live updates",
}: {
  tone: LiveTone;
  label: string;
  isPaused: boolean;
  onToggle: () => void;
  buttonLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <p role="status" className="flex items-center gap-2 text-sm text-ink-2">
        <span aria-hidden="true" className={`size-2 rounded-full ${DOTS[tone]}`} />
        {label}
      </p>
      <Button type="button" variant="secondary" aria-pressed={isPaused} onClick={onToggle} className="min-h-9 px-3">
        {buttonLabel}
      </Button>
    </div>
  );
}
