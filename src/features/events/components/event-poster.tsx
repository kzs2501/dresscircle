import type { ReactNode } from "react";
import type { EventCategory } from "@/core/statuses";
import { posterFor, type PosterMotif } from "@/features/events/domain/poster";
import type { TierTone } from "@/features/events/domain/tier-tones";

const FILLS: Record<TierTone, string> = { 1: "fill-tier-1", 2: "fill-tier-2", 3: "fill-tier-3" };

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Each motif drawn on a 320 × 120 board, in the figure's colour (the ground is behind it). */
function Motif({ motif, figure }: { motif: PosterMotif; figure: string }): ReactNode {
  switch (motif) {
    case "sunburst":
      // Rays from the foot of the board, as over a cinema's doors.
      return (
        <g className={figure}>
          {range(13).map((ray) => {
            const angle = Math.PI * (ray / 12);
            const x = 160 - Math.cos(angle) * 260;
            const y = 120 - Math.sin(angle) * 260;
            const next = Math.PI * ((ray + 0.45) / 12);
            return (
              <polygon
                key={ray}
                points={`160,120 ${x.toFixed(1)},${y.toFixed(1)} ${(160 - Math.cos(next) * 260).toFixed(1)},${(120 - Math.sin(next) * 260).toFixed(1)}`}
              />
            );
          })}
          <circle cx="160" cy="120" r="34" className="fill-card" />
        </g>
      );
    case "proscenium":
      // A stage's arch, with its curtains drawn back.
      return (
        <g className={figure}>
          <path d="M40 120V64a120 56 0 0 1 240 0v56h-22V68a98 44 0 0 0-196 0v52z" />
          <path d="M70 120V74a90 40 0 0 1 180 0v46h-10V78a80 34 0 0 0-160 0v42z" opacity="0.6" />
          <path d="M80 120c14-24 14-50 0-72 30 10 44 40 40 72zM240 120c-14-24-14-50 0-72-30 10-44 40-40 72z" />
        </g>
      );
    case "spotlight":
      // A spotlight's pool, and the stepped stage it lands on.
      return (
        <g className={figure}>
          <circle cx="160" cy="54" r="38" />
          <circle
            cx="160"
            cy="54"
            r="52"
            fill="none"
            strokeWidth="3"
            className={`${figure} stroke-current`}
            opacity="0.6"
          />
          <path d="M60 120v-12h40v-10h120v10h40v12z" />
        </g>
      );
    case "soundwaves":
      // A voice carrying across the room.
      return (
        <g fill="none" strokeWidth="6" className={figure}>
          {range(6).map((ring) => (
            <circle
              key={ring}
              cx="40"
              cy="60"
              r={22 + ring * 30}
              className="stroke-current"
              opacity={1 - ring * 0.13}
            />
          ))}
          <circle cx="40" cy="60" r="12" className={figure} stroke="none" />
        </g>
      );
    case "lattice":
      // A workshop's tiles.
      return (
        <g className={figure}>
          {range(9).flatMap((column) =>
            range(4).map((row) => (
              <rect
                key={`${String(column)}-${String(row)}`}
                x={18 + column * 34 + (row % 2) * 17}
                y={10 + row * 27}
                width="18"
                height="18"
                transform={`rotate(45 ${String(27 + column * 34 + (row % 2) * 17)} ${String(19 + row * 27)})`}
              />
            )),
          )}
        </g>
      );
    case "fans":
      // A row of deco fans, like a festival's bunting.
      return (
        <g className={figure}>
          {range(6).map((fan) => (
            <path key={fan} d={`M${String(fan * 56 + 20)} 120a36 36 0 0 1 72 0z`} />
          ))}
          {range(5).map((fan) => (
            <path key={fan} d={`M${String(fan * 56 + 48)} 82a36 36 0 0 1 72 0z`} opacity="0.55" />
          ))}
        </g>
      );
  }
}

/** A deco poster for an event: decoration, so screen readers skip it; the card says what it is. */
export function EventPoster({
  event,
  className = "",
}: {
  event: { slug: string; category: EventCategory };
  className?: string;
}) {
  const { motif, ground, figure } = posterFor(event);
  return (
    <svg
      viewBox="0 0 320 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={`block w-full ${className}`}
    >
      <rect width="320" height="120" className={FILLS[ground]} />
      <Motif motif={motif} figure={FILLS[figure]} />
    </svg>
  );
}
