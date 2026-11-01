"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/core/organisations";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { PauseToggle } from "@/components/ui/pause-toggle";
import { Spinner } from "@/components/ui/spinner";
import { LiveUpdatesProvider, useLiveUpdates, type LiveStatus } from "@/features/organiser/hooks/use-live-updates";
import { useOrganiserSession } from "@/features/organiser/hooks/use-organiser-session";

const STATUS_LABELS: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting. Refreshing every 15 s until then",
  paused: "Paused",
};

function LiveToggle() {
  const { status, isPaused, setIsPaused } = useLiveUpdates();
  return (
    <PauseToggle
      tone={status === "live" ? "live" : status === "paused" ? "paused" : "waiting"}
      label={STATUS_LABELS[status]}
      isPaused={isPaused}
      onToggle={() => {
        setIsPaused(!isPaused);
      }}
    />
  );
}

const NAV = [
  { href: routes.organiser(), label: "Overview", isCurrent: (path: string) => path === "/organiser" },
  {
    href: routes.organiserOrders(),
    label: "Orders",
    isCurrent: (path: string) => path.startsWith("/organiser/orders"),
  },
];

/**
 * The signed-in dashboard: who you are, where you can go, and whether updates are
 * live. Without a session it sends you to sign in; with one it keeps a single live
 * stream open for every page.
 */
export function OrganiserShell({ children }: { children: ReactNode }) {
  const { token, account, signOut } = useOrganiserSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (token === null) router.replace(routes.organiserSignIn());
  }, [token, router]);

  if (!token) {
    return (
      <div className="flex justify-center py-24 text-ink-3" role="status">
        <Spinner className="size-5" />
        <span className="sr-only">{token === null ? "Taking you to sign in…" : "Loading…"}</span>
      </div>
    );
  }

  return (
    <LiveUpdatesProvider>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <nav aria-label="Organisers">
            <ul className="flex gap-1">
              {NAV.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={item.isCurrent(path) ? "page" : undefined}
                    className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-sunk hover:text-ink aria-[current=page]:bg-sunk aria-[current=page]:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-4">
            <LiveToggle />
            {account && (
              <p className="text-sm text-ink-2">
                <span className="font-medium text-ink">{account.name}</span> · {ROLE_LABELS[account.role]},{" "}
                {account.organisation.name}
              </p>
            )}
            <Button type="button" variant="ghost" onClick={() => void signOut()} className="min-h-9 px-3">
              Sign out
            </Button>
          </div>
        </div>
        <div className="pt-8">{children}</div>
      </div>
    </LiveUpdatesProvider>
  );
}
