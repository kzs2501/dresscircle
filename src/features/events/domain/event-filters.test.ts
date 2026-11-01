// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/core/catalog";
import {
  eventFilterParams,
  eventFiltersFrom,
  filterChoices,
  hasEventFilters,
  matchingEvents,
  MAX_EVENT_SEARCH_LENGTH,
} from "./event-filters";

const read = (query: string) => eventFiltersFrom(new URLSearchParams(query), CATALOG);
const slugs = (query: string) => matchingEvents(CATALOG, read(query)).map((event) => event.slug);

describe("the home page's filters", () => {
  it("read each filter from the URL, and drop one that makes no sense on its own", () => {
    expect(read("q=jazz&cat=music&city=Goa&month=2027-02")).toEqual({
      q: "jazz",
      category: "music",
      city: "Goa",
      month: "2027-02",
    });
    // A category, city or month the catalogue doesn't have; a search too long or blank.
    expect(read(`cat=opera&city=Atlantis&month=1999-01&q=${"x".repeat(MAX_EVENT_SEARCH_LENGTH + 1)}`)).toEqual({
      q: undefined,
      category: undefined,
      city: undefined,
      month: undefined,
    });
    expect(read("q=%20%20&cat=theatre")).toMatchObject({ q: undefined, category: "theatre" });
  });

  it("write the same filters as the same URL, and nothing when there are none", () => {
    const filters = { month: "2027-03", q: "talks", city: "Chennai", category: "talks" } as const;
    expect(eventFilterParams(filters).toString()).toBe("q=talks&cat=talks&city=Chennai&month=2027-03");
    expect(read(eventFilterParams(filters).toString())).toEqual(filters);
    expect(eventFilterParams({}).toString()).toBe("");
    expect(hasEventFilters({})).toBe(false);
    expect(hasEventFilters({ city: "Goa" })).toBe(true);
  });

  it("find events by every filter at once, soonest first", () => {
    expect(slugs("cat=music")).toEqual(["night-market-jazz", "ragas-by-the-river", "monsoon-strings"]);
    expect(slugs("cat=music&city=Kolkata")).toEqual(["ragas-by-the-river"]);
    expect(slugs("month=2027-03")).toEqual([
      "last-train-from-churchgate",
      "frontend-systems-summit",
      "ragas-by-the-river",
    ]);
  });

  it("search the name, tagline, venue, city and kind, every word, ignoring case and accents", () => {
    expect(slugs("q=Mumbai")).toEqual(["last-train-from-churchgate"]);
    expect(slugs("q=playhouse")).toEqual(["last-train-from-churchgate"]);
    expect(slugs("q=COMEDY")).toEqual(["late-show-hauz-khas"]);
    expect(slugs("q=sarod%20hooghly")).toEqual(["ragas-by-the-river"]);
    expect(slugs("q=sarod%20goa")).toEqual([]);
  });

  it("offer only choices that some event has", () => {
    const { categories, cities, months } = filterChoices(CATALOG);
    expect(categories).toEqual(["music", "theatre", "comedy", "talks", "workshops", "festivals"]);
    expect(cities).toHaveLength(10);
    for (const month of months) expect(slugs(`month=${month}`).length).toBeGreaterThan(0);
  });
});
