import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { UnderstoodAs } from "./understood-as";

/**
 * What a search written in your own words was read as (ADR 025): the filters it set, the
 * engine that read it, and anything it couldn't use. A live region under the filters.
 */
const meta = {
  title: "Features/Events/Understood as",
  component: UnderstoodAs,
  args: { interpretation: { status: "idle" } },
  parameters: { layout: "padded" },
} satisfies Meta<typeof UnderstoodAs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing asked yet: an empty live region, holding its line so nothing moves. */
export const Idle: Story = {};

export const Reading: Story = {
  args: { interpretation: { status: "reading", request: "something mellow by the sea" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Reading your request…")).toBeVisible();
  },
};

/** Read by the rules alone: "stand-up in Delhi". */
export const WithoutAi: Story = {
  args: {
    interpretation: {
      status: "done",
      request: "stand-up in Delhi",
      filters: { category: "comedy", city: "Delhi" },
      notes: [],
      engine: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Understood as Comedy · Delhi.")).toBeVisible();
    await expect(canvas.getByText("Without AI")).toBeVisible();
  },
};

/** Chrome's built-in model read the words the rules couldn't place. */
export const OnDevice: Story = {
  args: {
    interpretation: {
      status: "done",
      request: "something mellow by the sea",
      filters: { category: "music", city: "Goa" },
      notes: [{ kind: "not-applied", text: "mellow" }],
      engine: "on-device",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("On-device AI")).toBeVisible();
    await expect(canvas.getByText("Not a filter: “mellow”.")).toBeVisible();
  },
};

/** Everything a request can ask that isn't a filter, said back rather than dropped. */
export const CloudWithNotes: Story = {
  args: {
    interpretation: {
      status: "done",
      request: "cheap jazz for 4 tonight next month",
      filters: { q: "jazz" },
      notes: [
        { kind: "price" },
        { kind: "ticket-count" },
        { kind: "day", phrase: "tonight" },
        { kind: "month-empty", month: "2026-12", nextMonth: "2027-02" },
      ],
      engine: "cloud",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("AI (free tier)")).toBeVisible();
    await expect(canvas.getByText("No events in December 2026. The next ones are in February 2027.")).toBeVisible();
  },
};

export const NothingUnderstood: Story = {
  args: {
    interpretation: {
      status: "done",
      request: "xyzzy plugh",
      filters: {},
      notes: [{ kind: "unused", words: ["xyzzy", "plugh"] }],
      engine: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Couldn’t turn that into filters.")).toBeVisible();
    await expect(canvas.getByText("Didn’t use “xyzzy”, “plugh”.")).toBeVisible();
  },
};
