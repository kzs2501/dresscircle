/**
 * A search written in your own words ("stand-up in Delhi in February"), read into the
 * home page's filters by rules: free, instant, and the same every time. It knows the
 * filters' words (kinds of event, the catalogue's cities and months) and the things a
 * request often asks for that aren't filters yet (a price, a number of tickets, a day),
 * which it reports instead of dropping. Words it can't place are handed back, so the
 * page can ask an AI engine about them (ADR 025), or say they weren't used.
 */
import { CATEGORY_LABELS, type EventCategory } from "@/core/statuses";
import { filterChoices, type EventFilters } from "./event-filters";

type Listed = Parameters<typeof filterChoices>[0][number];

/** The longest request read: past this, it isn't a search any more. */
export const MAX_REQUEST_LENGTH = 200;

/** What a reading couldn't turn into a filter, said back to the person who asked. */
export type QueryNote =
  | { kind: "price" }
  | { kind: "ticket-count" }
  | { kind: "day"; phrase: string }
  | { kind: "month-empty"; month: string; nextMonth: string | null }
  | { kind: "not-applied"; text: string }
  | { kind: "unused"; words: string[] };

export interface QueryReading {
  filters: EventFilters;
  notes: QueryNote[];
  /** Words that are neither a filter nor anything an event mentions. */
  unknownWords: string[];
}

const CATEGORY_WORDS: Readonly<Record<string, EventCategory>> = {
  music: "music",
  concert: "music",
  gig: "music",
  band: "music",
  theatre: "theatre",
  theater: "theatre",
  play: "theatre",
  drama: "theatre",
  musical: "theatre",
  comedy: "comedy",
  standup: "comedy",
  comic: "comedy",
  comedian: "comedy",
  funny: "comedy",
  talk: "talks",
  conference: "talks",
  summit: "talks",
  meetup: "talks",
  lecture: "talks",
  keynote: "talks",
  workshop: "workshops",
  class: "workshops",
  course: "workshops",
  festival: "festivals",
  fest: "festivals",
};

/** Old and other names people still use, for the catalogue's cities. */
const CITY_ALIASES: Readonly<Record<string, string>> = {
  bombay: "Mumbai",
  bangalore: "Bengaluru",
  calcutta: "Kolkata",
  madras: "Chennai",
  "new delhi": "Delhi",
};

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** Words that carry no filter: how people phrase a request, not what they ask for. */
const STOPWORDS = new Set(
  (
    "a an the in at on near around by for of to from me my i im we us our you want wanna would like looking look " +
    "find search show shows event events something anything some any please with and or is are there whats what " +
    "happening going get tickets ticket book booking see watch attend good nice best great night nights evening " +
    "out go can could where when which this that it its be"
  ).split(" "),
);

const NUMBER_WORD = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a couple|couple of|couple";

/** Phrases read before the words: a price, a number of tickets, a day. Each is cut out once read. */
const PRICE = new RegExp(
  "(?:under|below|less than|upto|up to|max|maximum|cheaper than|within)\\s*(?:rs\\.?|inr|₹)?\\s*\\d[\\d,]*(?:\\s*(?:rs|rupees|inr))?" +
    "|₹\\s*\\d[\\d,]*|\\b\\d[\\d,]*\\s*(?:rs|rupees|inr)\\b|\\b(?:cheap|cheapest|affordable|budget|free|inexpensive)\\b",
  "gu",
);
const TICKET_COUNT = new RegExp(
  `\\bfor\\s+(?:${NUMBER_WORD})(?:\\s+(?:people|persons|adults|friends|of us|guests))?\\b|\\b(?:${NUMBER_WORD})\\s+(?:tickets?|seats?|people|persons|adults|guests)\\b`,
  "gu",
);
const DAY = /\b(?:today|tonight|tomorrow|this weekend|next weekend|weekend|weekday|weekdays)\b/gu;
const RELATIVE_MONTH = /\b(this|next) month\b/gu;

const normalised = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/\bstand[\s-]+up\b/gu, "standup")
    .replace(/\blive music\b/gu, "music");

const isoMonth = (year: number, month: number) => `${String(year)}-${String(month).padStart(2, "0")}`;

/** `2027-03` plus some months. */
function addMonths(month: string, count: number) {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const zeroBased = index - 1 + count;
  return isoMonth(year + Math.floor(zeroBased / 12), (zeroBased % 12) + 1);
}

/** The words of a kind, singular: "gigs" reads as "gig", "classes" as "class". */
function singular(word: string, dictionary: Readonly<Record<string, unknown>>) {
  if (word in dictionary) return word;
  if (word.endsWith("es") && word.slice(0, -2) in dictionary) return word.slice(0, -2);
  if (word.endsWith("s") && word.slice(0, -1) in dictionary) return word.slice(0, -1);
  return null;
}

/** The first month after this one that has events, if any. */
export const nextMonthWithEvents = (months: readonly string[], after: string) =>
  months.find((month) => month > after) ?? null;

/**
 * Read a request into filters. `today` is the date where the events are (`YYYY-MM-DD`),
 * so a month without a year means the next time it comes round.
 */
export function readEventQuery(text: string, events: readonly Listed[], today: string): QueryReading {
  const choices = filterChoices(events);
  const notes: QueryNote[] = [];
  const filters: EventFilters = {};
  const unknownWords: string[] = [];
  const keywords: string[] = [];
  const thisMonth = today.slice(0, 7);

  let rest = ` ${normalised(text.slice(0, MAX_REQUEST_LENGTH))} `;
  /** Every match of a phrase (its text, then its groups), cut out of what's left to read. */
  const take = (pattern: RegExp) => {
    const found = [...rest.matchAll(pattern)].map((match) => [...match]);
    rest = rest.replace(pattern, " ");
    return found;
  };

  if (take(PRICE).length > 0) notes.push({ kind: "price" });
  if (take(TICKET_COUNT).length > 0) notes.push({ kind: "ticket-count" });
  const [day] = take(DAY);
  if (day?.[0]) notes.push({ kind: "day", phrase: day[0] });

  const [relative] = take(RELATIVE_MONTH);
  let month = relative ? (relative[1] === "next" ? addMonths(thisMonth, 1) : thisMonth) : undefined;

  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (alias.includes(" ") && rest.includes(` ${alias} `) && choices.cities.includes(city)) {
      filters.city ??= city;
      rest = rest.replace(` ${alias} `, " ");
    }
  }

  // Whole words only: "sea" isn't in "research", though a search's substring match would find it.
  const vocabulary = new Set(
    events.flatMap((event) =>
      normalised([event.name, event.tagline, event.venue, event.city, CATEGORY_LABELS[event.category]].join(" ")).split(
        /[^\p{L}\p{N}]+/u,
      ),
    ),
  );
  const mentions = (word: string) =>
    [word, `${word}s`, `${word}es`, word.replace(/e?s$/u, "")].some((form) => vocabulary.has(form));

  const words = rest.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const [index, word] of words.entries()) {
    const categoryWord = singular(word, CATEGORY_WORDS);
    const category = categoryWord ? CATEGORY_WORDS[categoryWord] : undefined;
    if (category && choices.categories.includes(category)) {
      // A second kind can't be a filter too ("comedy or music"): an AI engine may know which.
      if (filters.category) unknownWords.push(word);
      else filters.category = category;
      continue;
    }

    const city = choices.cities.find((name) => name.toLowerCase() === word) ?? CITY_ALIASES[word];
    if (city && choices.cities.includes(city) && !filters.city) {
      filters.city = city;
      continue;
    }

    const monthIndex = MONTHS[word];
    if (monthIndex !== undefined && month === undefined) {
      const next = words[index + 1];
      const year = next && /^20\d\d$/u.test(next) ? Number(next) : undefined;
      const [todayYear = 0, todayMonth = 1] = thisMonth.split("-").map(Number);
      month = isoMonth(year ?? (monthIndex >= todayMonth ? todayYear : todayYear + 1), monthIndex);
      continue;
    }
    if (/^20\d\d$/u.test(word) && month !== undefined) continue;
    if (STOPWORDS.has(word)) continue;

    if (word.length < 2) continue;

    if (mentions(word)) keywords.push(word);
    else unknownWords.push(word);
  }

  if (month !== undefined) {
    const asked = month;
    if (choices.months.includes(asked)) filters.month = asked;
    else notes.push({ kind: "month-empty", month: asked, nextMonth: nextMonthWithEvents(choices.months, asked) });
  }
  if (keywords.length > 0) filters.q = keywords.join(" ");

  return { filters, notes, unknownWords };
}
