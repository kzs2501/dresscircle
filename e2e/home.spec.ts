/**
 * The home page: a box office first, with the system running underneath. Its search and
 * filters, the live strip, and the shortcuts to the hard parts.
 */
import type { Page } from "@playwright/test";
import { axeViolations, expect, test } from "./fixtures";

const liveStrip = (page: Page) => page.getByRole("region", { name: "Box office, live" });
const results = (page: Page) => page.getByRole("region", { name: "Results" });

test.describe("search and filters", () => {
  test(
    "live in the URL: a choice can be undone with Back, and a reload keeps it",
    { tag: "@both" },
    async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Theatre" }).click();
      await expect(page).toHaveURL(/\/\?cat=theatre$/);
      await expect(results(page).getByRole("status")).toHaveText("1 event");
      await expect(results(page).getByRole("link", { name: /The Last Train from Churchgate/ })).toBeVisible();

      await page.getByLabel("City").selectOption("Goa");
      await expect(page).toHaveURL(/cat=theatre&city=Goa$/);
      await expect(results(page)).toContainText("Nothing matches");

      await page.goBack();
      await expect(page).toHaveURL(/\/\?cat=theatre$/);
      await expect(results(page).getByRole("status")).toHaveText("1 event");

      await page.reload();
      await expect(page.getByRole("button", { name: "Theatre" })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("region", { name: "All events" })).toBeVisible();
    },
  );

  test("search as you type, every word, and keep what was typed on a reload", { tag: "@both" }, async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search events, venues and cities" });
    await search.fill("sarod hooghly");
    await expect(page).toHaveURL(/\?q=sarod\+hooghly$/);
    await expect(results(page).getByRole("link", { name: /Ragas by the River/ })).toBeVisible();
    await expect(results(page).getByRole("status")).toHaveText("1 event");

    await page.reload();
    await expect(search).toHaveValue("sarod hooghly");
    await expect(results(page).getByRole("link", { name: /Ragas by the River/ })).toBeVisible();
  });
});

test.describe("the live strip", () => {
  test(
    "is quiet with nothing happening, and shows a purchase once it's paid",
    { tag: "@both" },
    async ({ page, buyer }) => {
      await page.goto("/");
      const strip = liveStrip(page);
      await expect(strip.getByRole("status")).toHaveText("Live");
      // In the sandbox, with the simulated buyers kept out, nothing has happened yet.
      await expect(strip.getByText(/Quiet right now|Sold/).first()).toBeVisible();

      await buyer.goToPayment(1);
      await buyer.pay();
      await expect(buyer.ticketsHeading).toBeVisible({ timeout: 10_000 });

      await page.goto("/");
      await expect(
        strip
          .getByRole("list", { name: "Latest at the box office" })
          .getByRole("listitem")
          .filter({ hasText: "Open Studio: Ceramics" })
          .filter({ hasText: "Sold" })
          .first(),
      ).toBeVisible();
    },
  );

  test("can be paused, and says so", { tag: "@both" }, async ({ page }) => {
    await page.goto("/");
    const strip = liveStrip(page);
    await strip.getByRole("button", { name: "Pause updates" }).click();
    await expect(strip.getByRole("button", { name: "Pause updates" })).toHaveAttribute("aria-pressed", "true");
    await expect(strip.getByRole("status")).toHaveText("Paused");
  });
});

test.describe("with the simulated buyers on", () => {
  test.use({ isCrowdQuiet: false });

  test("the box office is busy from the first visit, and says the buyers are simulated", async ({ page }) => {
    await page.goto("/");
    const strip = liveStrip(page);
    await expect(strip.getByRole("listitem").filter({ hasText: "simulated" }).first()).toBeVisible();
    await expect(strip.getByText("Simulated sales are other buyers this demo makes up")).toBeVisible();
    await expect(strip.getByRole("definition").last()).not.toHaveText("0");
  });
});

test.describe("try the hard parts", () => {
  test("a flash sale puts you in its queue", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Join a flash sale/ }).click();
    await expect(page).toHaveURL(/\/events\/lakeside-lights$/);
    await expect(page.getByRole("button", { name: "Join the queue" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Chaos.*Flash sale/ })).toBeVisible();
  });

  test("breaking a payment starts at the Chaos panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Break a payment/ }).click();
    await expect(page.getByRole("dialog", { name: "Chaos panel" })).toBeVisible();
  });

  test("every mode has a seat to pick and a door to scan at", { tag: "@both" }, async ({ page }) => {
    await page.goto("/");
    const hardParts = page.getByRole("region", { name: "Try the hard parts" });
    await expect(hardParts.getByRole("link", { name: /^Pick a seat/ })).toHaveAttribute(
      "href",
      "/events/monsoon-strings",
    );
    await expect(hardParts.getByRole("link", { name: /^Scan tickets at the door/ })).toHaveAttribute("href", "/scan");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`the home page has no axe violations, live strip and all (${scheme})`, { tag: "@both" }, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(liveStrip(page).getByRole("definition").first()).not.toBeEmpty();
    expect(await axeViolations(page), "home").toEqual([]);
    await page.getByRole("button", { name: "Theatre" }).click();
    await expect(results(page)).toBeVisible();
    // The chip's colours ease in over 160 ms: measure them once they've arrived.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
    expect(await axeViolations(page), "results").toEqual([]);
  });
}

// WCAG 1.4.10: the page reflows at 320 CSS pixels, with no scrolling sideways.
test("reflows at 320 px: the header wraps, nothing scrolls sideways", { tag: "@both" }, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "All events" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
