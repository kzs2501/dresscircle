/**
 * An event's poster: a deco motif for its kind of night out, in two of the hall's tier
 * colours. Drawn, not photographed, so every event has one and the page loads no image.
 */
import type { EventCategory } from "@/core/statuses";
import type { TierTone } from "./tier-tones";

export type PosterMotif = "sunburst" | "proscenium" | "spotlight" | "soundwaves" | "lattice" | "fans";

const MOTIFS: Record<EventCategory, PosterMotif> = {
  music: "sunburst",
  theatre: "proscenium",
  comedy: "spotlight",
  talks: "soundwaves",
  workshops: "lattice",
  festivals: "fans",
};

const PAIRS: readonly (readonly [ground: TierTone, figure: TierTone])[] = [
  [2, 1],
  [3, 1],
  [1, 2],
  [3, 2],
  [1, 3],
  [2, 3],
];

/** The same event always gets the same poster; neighbours in the grid usually differ. */
export function posterFor(event: { slug: string; category: EventCategory }) {
  let hash = 7;
  for (let index = 0; index < event.slug.length; index++) hash = (hash * 31 + event.slug.charCodeAt(index)) % 9_973;
  const [ground, figure] = PAIRS[hash % PAIRS.length] ?? [2, 1];
  return { motif: MOTIFS[event.category], ground, figure };
}
