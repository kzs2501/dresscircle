import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { CATALOG } from "@/core/catalog";
import { Discovery } from "./discovery";
import { cardOf } from "./event-card";

const CARDS = CATALOG.map(cardOf);

/** The home page's search and filters, read from the URL. Unfiltered, the page's own sections show instead. */
const meta = {
  title: "Features/Events/Discovery",
  component: Discovery,
  args: { events: CARDS, children: <p>The home page’s sections go here when nothing is filtered.</p> },
  tags: ["screen"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof Discovery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unfiltered: Story = {};

/** Music in March 2027: the chip pressed, the month chosen, and what matches. */
export const Filtered: Story = {
  parameters: { nextjs: { navigation: { pathname: "/", query: { cat: "music", month: "2027-03" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Music" })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByText("1 event")).toHaveAttribute("role", "status");
  },
};

export const NothingMatches: Story = {
  parameters: { nextjs: { navigation: { pathname: "/", query: { q: "opera", city: "Goa" } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Nothing matches/)).toBeVisible();
  },
};
