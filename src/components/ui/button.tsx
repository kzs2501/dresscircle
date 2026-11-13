import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost";

// Busy looks like disabled; see below for why it isn't `disabled`.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-action text-action-ink hover:bg-action-hover disabled:opacity-60 aria-busy:opacity-60",
  secondary: "border border-line bg-card text-ink hover:bg-sunk disabled:opacity-60 aria-busy:opacity-60",
  ghost: "text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60 aria-busy:opacity-60",
};

export function Button({
  variant = "primary",
  isBusy = false,
  isDisabled = false,
  className = "",
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  isBusy?: boolean;
  /** Not yet: focusable, so its reason (`aria-describedby`) can be read, but ignoring presses. */
  isDisabled?: boolean;
}) {
  const isInert = isBusy || isDisabled;
  return (
    <button
      {...props}
      // Busy or not yet, the button keeps keyboard focus, which `disabled` would drop to the
      // page, but ignores presses. That includes Enter in one of its form's fields: a form
      // submits by clicking its default button, and a cancelled click doesn't submit.
      aria-busy={isBusy || undefined}
      aria-disabled={isInert || undefined}
      onClick={(event) => {
        if (isInert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={`inline-flex min-h-11 press items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium disabled:cursor-not-allowed aria-busy:cursor-progress ${isDisabled ? "cursor-not-allowed" : ""} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {/* The label stays visible while busy, so the button never changes width or meaning. */}
      {isBusy && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
