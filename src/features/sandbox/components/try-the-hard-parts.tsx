"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRESETS } from "@/backend";
import { isServerMode } from "@/lib/backend-mode";
import { routes } from "@/lib/routes";
import { requestChaosPanel } from "@/features/sandbox/chaos-panel-requests";
import { useSandboxControl } from "@/features/sandbox/hooks/use-sandbox-control";

const CARD =
  "flex h-full w-full flex-col gap-1.5 rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-ink-3";

function Title({ children }: { children: ReactNode }) {
  return <span className="font-display text-base font-semibold">{children}</span>;
}

function Detail({ children }: { children: ReactNode }) {
  return <span className="text-sm text-pretty text-ink-2">{children}</span>;
}

/** Every way the Chaos panel can break things, besides the path where nothing breaks. */
const SCENARIOS = PRESETS.filter((preset) => preset.id !== "happy").length;

/**
 * The hard parts of a box office, one step away each: a seat map, a flash sale's queue,
 * a payment that goes wrong, the door, and the organisers' side. In server mode, which
 * has no Chaos panel, no queue and no organisers' pages, the ones it has.
 *
 * Their names are chosen not to echo the header's links ("Chaos…", the organisers' link,
 * "Door scanner", "Your tickets"), so each name says one thing on the page.
 */
export function TryTheHardParts() {
  const router = useRouter();
  const sandbox = useSandboxControl();

  return (
    <section aria-labelledby="hard-parts">
      <h2 id="hard-parts" className="font-display text-2xl font-semibold">
        Try the hard parts
      </h2>
      <p className="mt-1 text-ink-2">What a busy box office has to get right, one click each.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <Link href={routes.event("monsoon-strings")} className={CARD}>
            <Title>Pick a seat</Title>
            <Detail>A thousand seats in three price tiers, chosen by pointer or keyboard.</Detail>
          </Link>
        </li>
        {isServerMode ? (
          <li>
            <Link href={routes.event("night-market-jazz")} className={CARD}>
              <Title>Pay with Razorpay’s test card</Title>
              <Detail>Razorpay’s real checkout, in test mode: card 4100 2800 0000 1007 is approved.</Detail>
            </Link>
          </li>
        ) : (
          <>
            <li>
              <button
                type="button"
                disabled={!sandbox}
                onClick={() => {
                  sandbox?.setPreset("flash-sale");
                  router.push(routes.event("lakeside-lights"));
                }}
                className={`${CARD} press disabled:opacity-60`}
              >
                <Title>Join a flash sale</Title>
                <Detail>Forty thousand people (simulated) arrive at once. Wait your turn in a fair queue.</Detail>
              </button>
            </li>
            <li>
              <button type="button" onClick={requestChaosPanel} className={`${CARD} press`}>
                <Title>Break a payment</Title>
                <Detail>
                  Decline a card, send a webhook twice, expire a hold mid-payment: {SCENARIOS} ways, then watch it cope.
                </Detail>
              </button>
            </li>
          </>
        )}
        <li>
          {/* A plain link: the scanner's page has security headers of its own, which only a full load brings. */}
          <a href={routes.scanner()} className={CARD}>
            <Title>Scan tickets at the door</Title>
            <Detail>Check tickets with a camera, even with no connection, and catch one used twice.</Detail>
          </a>
        </li>
        {!isServerMode && (
          <li>
            <Link href={routes.organiser()} className={CARD}>
              <Title>Run the box office</Title>
              <Detail>Live sales, eleven thousand orders and refunds, as the venue sees them.</Detail>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
