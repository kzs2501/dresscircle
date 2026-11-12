// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import { MAX_REQUEST_LENGTH, nextMonthWithEvents, readEventQuery, readingWithAnswer } from "./event-query";

/** A fixed day, so "next month" and a month without a year always mean the same. */
const TODAY = "2026-11-12";
const read = (text: string, today = TODAY) => readEventQuery(text, CATALOG, today);

describe("reading a search written in your own words", () => {
  it.each([
    ["stand-up in Delhi", { category: "comedy", city: "Delhi" }],
    ["standup comedy delhi", { category: "comedy", city: "Delhi" }],
    ["a play in Bombay", { category: "theatre", city: "Mumbai" }],
    ["theater shows in mumbai", { category: "theatre", city: "Mumbai" }],
    ["gigs in Bangalore", { category: "music", city: "Bengaluru" }],
    ["live music in Calcutta", { category: "music", city: "Kolkata" }],
    ["conferences in Madras", { category: "talks", city: "Chennai" }],
    ["tech summit pune", { category: "talks", city: "Pune" }],
    ["pottery classes in Jaipur", { category: "workshops", city: "Jaipur" }],
    ["festivals in Udaipur", { category: "festivals", city: "Udaipur" }],
    ["fest in hyderabad", { category: "festivals", city: "Hyderabad" }],
    ["comedy in New Delhi", { category: "comedy", city: "Delhi" }],
  ])("reads the kind and the city from %j", (text, filters) => {
    expect(read(text).filters).toMatchObject(filters);
  });

  it("reads a month by name, taking the next time it comes round when there's no year", () => {
    expect(read("music in February").filters).toMatchObject({ category: "music", month: "2027-02" });
    expect(read("talks in mar").filters).toMatchObject({ category: "talks", month: "2027-03" });
    expect(read("anything in April 2027").filters).toMatchObject({ month: "2027-04" });
    // November has come round this year already: the next November with events is 2027's.
    expect(read("festivals in november", "2026-12-01").filters).toMatchObject({ month: "2027-11" });
  });

  it("says a month has no events, and which month next does, instead of dropping it silently", () => {
    const reading = read("comedy next month");
    expect(reading.filters).toEqual({ category: "comedy" });
    expect(reading.notes).toContainEqual({ kind: "month-empty", month: "2026-12", nextMonth: "2027-02" });
    expect(read("anything this month").notes).toContainEqual({
      kind: "month-empty",
      month: "2026-11",
      nextMonth: "2027-02",
    });
    expect(read("music in december 2028").notes).toContainEqual({
      kind: "month-empty",
      month: "2028-12",
      nextMonth: null,
    });
  });

  it("rolls the year over at December", () => {
    expect(read("talks next month", "2026-12-20").notes).toContainEqual(
      expect.objectContaining({ kind: "month-empty", month: "2027-01" }),
    );
    expect(read("music next month", "2027-01-05").filters).toMatchObject({ month: "2027-02" });
  });

  it.each([
    ["comedy under ₹1,000", "price"],
    ["cheap gigs in Goa", "price"],
    ["music under rs 500", "price"],
    ["something free in Pune", "price"],
    ["comedy for 4 people", "ticket-count"],
    ["two tickets for the play", "ticket-count"],
    ["theatre for a couple", "ticket-count"],
  ] as const)("says %j asks for something that isn't a filter yet", (text, kind) => {
    expect(read(text).notes).toContainEqual({ kind });
  });

  it("says a day isn't a filter yet", () => {
    expect(read("comedy tonight").notes).toContainEqual({ kind: "day", phrase: "tonight" });
    expect(read("music this weekend in Goa")).toMatchObject({
      filters: { category: "music", city: "Goa" },
      notes: [{ kind: "day", phrase: "this weekend" }],
    });
  });

  it("keeps words an event mentions as the search, and hands back the rest", () => {
    expect(read("jazz in Goa")).toEqual({ filters: { q: "jazz", city: "Goa" }, notes: [], unknownWords: [] });
    expect(read("something mellow by the sea")).toEqual({
      filters: {},
      notes: [],
      unknownWords: ["mellow", "sea"],
    });
    expect(read("ceramics")).toEqual({ filters: { q: "ceramics" }, notes: [], unknownWords: [] });
  });

  it("hands back a second kind of event, since only one can be a filter", () => {
    expect(read("comedy or music in Delhi")).toMatchObject({
      filters: { category: "comedy", city: "Delhi" },
      unknownWords: ["music"],
    });
  });

  it("drops the way people phrase a request", () => {
    expect(read("I'm looking for a good comedy show in Delhi please")).toEqual({
      filters: { category: "comedy", city: "Delhi" },
      notes: [],
      unknownWords: [],
    });
  });

  it("reads nothing from nothing, and only the first stretch of a very long request", () => {
    expect(read("")).toEqual({ filters: {}, notes: [], unknownWords: [] });
    expect(read("   ")).toEqual({ filters: {}, notes: [], unknownWords: [] });
    const long = `${"x ".repeat(MAX_REQUEST_LENGTH)} comedy`;
    expect(read(long).filters.category).toBeUndefined();
  });

  it("finds the next month with events", () => {
    expect(nextMonthWithEvents(["2027-02", "2027-03"], "2026-12")).toBe("2027-02");
    expect(nextMonthWithEvents(["2027-02", "2027-03"], "2027-02")).toBe("2027-03");
    expect(nextMonthWithEvents(["2027-02"], "2027-05")).toBeNull();
  });
});

describe("an AI engine's answer on top of the rules' reading", () => {
  const answer = (fields: Partial<Parameters<typeof readingWithAnswer>[1]>) => ({
    category: null,
    city: null,
    month: null,
    keywords: null,
    notApplied: [],
    ...fields,
  });
  const merged = (text: string, fields: Partial<Parameters<typeof readingWithAnswer>[1]>) =>
    readingWithAnswer(read(text), answer(fields), CATALOG);

  it("adds what the engine understood to what the rules read", () => {
    expect(merged("something mellow by the sea", { category: "music", city: "Goa", notApplied: ["mellow"] })).toEqual({
      filters: { category: "music", city: "Goa" },
      notes: [{ kind: "not-applied", text: "mellow" }],
      unknownWords: [],
    });
  });

  it("uses an engine's words only when an event mentions them, and says which it didn't use", () => {
    expect(merged("ceramics vibes", { keywords: "ceramics pottery" })).toEqual({
      filters: { q: "ceramics" },
      notes: [{ kind: "unused", words: ["pottery"] }],
      unknownWords: [],
    });
  });

  it("can't choose what the catalogue doesn't have", () => {
    expect(merged("opera in Atlantis", { category: "comedy", city: "Atlantis" }).filters).toEqual({
      category: "comedy",
    });
  });

  it("takes a month with events, and says when one has none", () => {
    expect(merged("something in feb", { month: "2027-02" }).filters).toMatchObject({ month: "2027-02" });
    expect(merged("winter fun", { month: "2026-12" }).notes).toContainEqual({
      kind: "month-empty",
      month: "2026-12",
      nextMonth: "2027-02",
    });
  });

  it("doesn't say twice what the rules already reported", () => {
    expect(
      merged("cheap comedy for 4 tonight, something chill", {
        category: "comedy",
        notApplied: ["cheap", "for 4", "tonight", "chill"],
      }).notes,
    ).toEqual([
      { kind: "price" },
      { kind: "ticket-count" },
      { kind: "day", phrase: "tonight" },
      { kind: "not-applied", text: "chill" },
    ]);
  });
});
