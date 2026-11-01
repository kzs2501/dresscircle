/**
 * Halls with reserved seating, as data. Fictional, like everything in the catalogue.
 */
import { seededRandom } from "./random";
import { expandLayout, type RowSpec, type SeatPlan, type VenueLayout } from "./seating";

/** Theatres skip I and O, which read as 1 and 0 on a ticket. */
const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

const rows = (count: number, rowSpec: (index: number) => Omit<RowSpec, "label">): RowSpec[] =>
  Array.from(ROW_LETTERS.slice(0, count), (label, index) => ({ label, ...rowSpec(index) }));

export const RANGMANCH_LAYOUT: VenueLayout = {
  id: "rangmanch-auditorium",
  sections: [
    {
      id: "stalls",
      name: "Stalls",
      // Twenty rows. The first three curve in, so they're shorter; the last has level
      // access, with a wheelchair space at each end.
      rows: rows(20, (index) => ({
        tierId: index < 6 ? "ms-premium" : "ms-stalls",
        blocks: index < 3 ? [7, 14, 7] : [9, 16, 9],
        ...(index === 19 ? { wheelchairSeatNumbers: [1, 34] } : {}),
      })),
    },
    {
      id: "balcony",
      name: "Balcony",
      rows: rows(12, () => ({ tierId: "ms-balcony", blocks: [6, 16, 6] })),
    },
  ],
};

export const RANGMANCH_PLAN: SeatPlan = expandLayout(RANGMANCH_LAYOUT);

/**
 * An old playhouse in the Deco style, with the seat classes a single-screen hall sold:
 * stalls on the ground floor, the dress circle above them, and the balcony at the top.
 * Its sections have ids no other hall uses, so its seats never share an id with one.
 */
export const MARINE_LINES_LAYOUT: VenueLayout = {
  id: "marine-lines-playhouse",
  sections: [
    {
      id: "orchestra",
      name: "Stalls",
      // Fourteen rows; the last has level access, with a wheelchair space at each end.
      rows: rows(14, (index) => ({
        tierId: "lt-stalls",
        blocks: index < 2 ? [6, 12, 6] : [8, 14, 8],
        ...(index === 13 ? { wheelchairSeatNumbers: [1, 30] } : {}),
      })),
    },
    {
      id: "circle",
      name: "Dress Circle",
      rows: rows(8, () => ({ tierId: "lt-circle", blocks: [6, 14, 6] })),
    },
    {
      id: "gallery",
      name: "Balcony",
      rows: rows(8, () => ({ tierId: "lt-balcony", blocks: [5, 12, 5] })),
    },
  ],
};

export const MARINE_LINES_PLAN: SeatPlan = expandLayout(MARINE_LINES_LAYOUT);

/**
 * Seats sold before the sandbox started: runs of two to four, the way groups book,
 * busiest near the stage (a hall's first section, rows from the front). Deterministic for a given seed, so tests and screenshots
 * see the same hall every time.
 */
export function baselineSoldSeatIds(plan: SeatPlan, seed: number): ReadonlySet<string> {
  const random = seededRandom(seed);
  const sold = new Set<string>();
  plan.sections.forEach((section, sectionIndex) => {
    section.rows.forEach((row, rowIndex) => {
      const runStartChance = sectionIndex === 0 ? 0.22 - rowIndex * 0.008 : 0.1;
      for (const block of row.blocks) {
        let i = 0;
        while (i < block.length) {
          if (random() < runStartChance) {
            const runLength = 2 + Math.floor(random() * 3);
            for (const seat of block.slice(i, i + runLength)) sold.add(seat.id);
            i += runLength + 1;
          } else {
            i += 1;
          }
        }
      }
    });
  });
  return sold;
}
