/**
 * An organiser's question about their sales, read by rules (ADR 026): free, instant and
 * the same every time. It knows the dashboard's words (sales, ticket types, how buyers
 * paid, the funnel, orders and their statuses), periods ("yesterday", "last week", "the
 * past 30 days", "in October"), and the account's events by the words of their names.
 * Words it can't place are handed back, for an AI engine to read the whole question.
 */
import type { OrderStatus, PaymentMethod } from "@/core/statuses";
import type { OrganiserQuestion, QuestionEvent, QuestionIntent } from "@/lib/ai/tasks/organiser-question";

export interface QuestionReading {
  question: OrganiserQuestion;
  /** Whether the rules found what kind of answer is wanted. */
  hasIntent: boolean;
  /** Words that are neither the dashboard's nor an event's. */
  unknownWords: string[];
}

const DAY_MS = 86_400_000;

/** An ISO date plus some days. Dates here are calendar days, so UTC arithmetic is exact. */
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** Monday is 0. */
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const isoMonth = (year: number, month: number) => `${String(year)}-${String(month).padStart(2, "0")}`;
const lastDayOf = (month: string) => {
  const [year = 0, index = 1] = month.split("-").map(Number);
  return shift(`${index === 12 ? isoMonth(year + 1, 1) : isoMonth(year, index + 1)}-01`, -1);
};
const earlier = (left: string, right: string) => (left < right ? left : right);

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
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

const STATUS_WORDS: readonly [RegExp, OrderStatus[]][] = [
  [/\brefund(?:s|ed)?\b/u, ["refunded"]],
  [/\b(?:failed|failures?|declined)\b/u, ["failed"]],
  [/\b(?:pending|unpaid|waiting)\b/u, ["pending"]],
  [/\b(?:expired|lapsed)\b/u, ["expired"]],
  [/\b(?:fulfilled|issued)\b/u, ["fulfilled"]],
  [/\bpaid orders?\b/u, ["paid", "fulfilled"]],
];

const METHOD_WORDS: readonly [RegExp, PaymentMethod][] = [
  [/\bupi\b/u, "upi"],
  [/\b(?:cards?|credit cards?|debit cards?)\b/u, "card"],
  [/\brazorpay\b/u, "razorpay"],
];

/** The words for each kind of answer, most specific first: the first that matches wins. */
const INTENT_WORDS: readonly [QuestionIntent, RegExp][] = [
  ["payment-mix", /\b(?:how (?:did )?(?:buyers|people|they|customers) (?:pay|paid)|payment methods?)\b/u],
  ["find-orders", /\b(?:orders?|buyers?|bookings?|who bought|customers?)\b/u],
  [
    "funnel",
    /\b(?:funnel|conversion|convert(?:ed|s)?|drop(?:ped)?[\s-]?offs?|dropped|abandon(?:ed|s)?|reservations?|holds?)\b/u,
  ],
  [
    "ticket-types",
    /\b(?:tiers?|ticket types?|types? of tickets?|types?|vip|best[\s-]selling|selling best|sells best|most popular|fastest)\b/u,
  ],
  ["payment-mix", /\b(?:paid with|pay with|payments?)\b/u],
  ["sales-over-time", /\b(?:per day|by day|each day|daily|trend|over time|busiest|day by day|week by week)\b/u],
  [
    "summary",
    /\b(?:sales|revenue|made|make|earn(?:ed|ings|t)?|totals?|how much|sold|selling|sell|net|gross|overview|doing|performance|performing)\b/u,
  ],
];

/** How people phrase a question, not what they ask. */
const STOPWORDS = new Set(
  (
    "how many much what whats which who the a an of for in on at is are was were did do does we our my me us " +
    "show tell give list get got have has had there been so far any all events event tickets ticket number count " +
    "please can could you i im and or with by from to this that it its about up till until since between than " +
    "be being been were will would should time times there here now yet still ever some just only most more"
  ).split(" "),
);

/** Words in event names too common to tell one event from another. */
const GENERIC_NAME_WORDS = new Set(["the", "from", "night", "nights", "live", "show", "late", "open", "festival"]);

const normalised = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/gu, "");

const wordsOf = (text: string) => text.split(/[^\p{L}\p{N}_@.+-]+/u).filter(Boolean);

export function readQuestion(text: string, events: readonly QuestionEvent[], today: string): QuestionReading {
  let rest = ` ${normalised(text)} `;
  /** Every match of a phrase, cut out of what's left to read. */
  const take = (pattern: RegExp) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const global = new RegExp(pattern.source, flags);
    const found = [...rest.matchAll(global)].map((match) => [...match]);
    rest = rest.replace(global, " ");
    return found;
  };

  // A buyer's email or an order's id, before anything splits them up.
  const [named] = [...take(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/u), ...take(/\bord_[a-z0-9]+\b/u)];
  const search = named?.[0] ?? null;

  // The first period named wins; one that runs past today ends today.
  const range: { from: string | null; to: string | null } = { from: null, to: null };
  const period = (start: string, end: string) => {
    range.from ??= start;
    range.to ??= earlier(end, today);
  };
  const thisWeek = shift(today, -weekday(today));
  if (take(/\btoday\b/u).length) period(today, today);
  if (take(/\byesterday\b/u).length) period(shift(today, -1), shift(today, -1));
  if (take(/\bthis week\b/u).length) period(thisWeek, today);
  if (take(/\blast week\b/u).length) period(shift(thisWeek, -7), shift(thisWeek, -1));
  for (const [, days] of take(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/u)) {
    const count = Math.max(1, Number(days));
    period(shift(today, 1 - count), today);
  }
  if (take(/\bthis month\b/u).length) period(`${today.slice(0, 7)}-01`, today);
  if (take(/\blast month\b/u).length) {
    const lastMonth = shift(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    period(`${lastMonth}-01`, lastDayOf(lastMonth));
  }
  for (const [, name = "", year] of take(
    new RegExp(`\\b(${Object.keys(MONTHS).join("|")})(?:\\s+(20\\d\\d))?\\b`, "u"),
  )) {
    const index = MONTHS[name] ?? 1;
    const [todayYear = 0, todayMonth = 1] = today.split("-").map(Number);
    // Sales are history: a month without a year is the latest one up to now.
    const month = isoMonth(year ? Number(year) : index <= todayMonth ? todayYear : todayYear - 1, index);
    period(`${month}-01`, lastDayOf(month));
  }

  const statuses = [...new Set(STATUS_WORDS.flatMap(([pattern, found]) => (take(pattern).length ? found : [])))];
  const methods = METHOD_WORDS.flatMap(([pattern, method]) => (take(pattern).length ? [method] : []));
  const method = methods[0] ?? null;

  let intent: QuestionIntent | null = statuses.length > 0 || search !== null ? "find-orders" : null;
  for (const [kind, pattern] of INTENT_WORDS) {
    if (take(pattern).length && intent === null) intent = kind;
  }
  if (intent === null && method !== null) intent = "payment-mix";
  const hasIntent = intent !== null;

  // An event by the words of its name: the one with the most of them, if just one has the most.
  const words = wordsOf(rest).filter((word) => !STOPWORDS.has(word));
  const nameWords = (event: QuestionEvent) =>
    new Set(wordsOf(normalised(event.name)).filter((word) => word.length > 3 && !GENERIC_NAME_WORDS.has(word)));
  const scores = events.map((event) => {
    const own = nameWords(event);
    return { event, matched: words.filter((word) => own.has(word) || own.has(word.replace(/s$/u, ""))) };
  });
  const best = Math.max(0, ...scores.map((score) => score.matched.length));
  const leaders = scores.filter((score) => best > 0 && score.matched.length === best);
  const chosen = leaders.length === 1 ? leaders[0] : undefined;
  // Every word of the chosen event's name is placed, the common ones too ("Night" in Night Market Jazz).
  const used = new Set(chosen ? [...chosen.matched, ...wordsOf(normalised(chosen.event.name))] : []);

  const unknownWords = words.filter((word) => !used.has(word) && !/^\d+$/u.test(word) && word.length > 1);
  const resolved: QuestionIntent = intent ?? (chosen ? "summary" : "unsupported");
  // Sales asked about over a period are sales over time.
  const finalIntent = resolved === "summary" && range.from !== null ? "sales-over-time" : resolved;

  return {
    question: {
      intent: finalIntent,
      event: chosen?.event.slug ?? null,
      from: range.from,
      to: range.to,
      statuses,
      method,
      search,
      notApplied: [],
    },
    hasIntent,
    unknownWords,
  };
}
