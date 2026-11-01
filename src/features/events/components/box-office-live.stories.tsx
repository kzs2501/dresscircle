import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { CATALOG } from "@/core/catalog";
import { BoxOfficeLive } from "./box-office-live";

const EVENT_NAMES = Object.fromEntries(CATALOG.map((event) => [event.slug, event.name]));

/** What the box office is doing right now, from the story's sandbox, as the home page shows it. */
const meta = {
  title: "Features/Events/Box office, live",
  component: BoxOfficeLive,
  args: { eventNames: EVENT_NAMES },
  parameters: { layout: "padded" },
} satisfies Meta<typeof BoxOfficeLive>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The simulated buyers' sales from the last few minutes, each marked as simulated. */
export const Busy: Story = {
  parameters: { sandbox: { isBusy: true } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Simulated sales are other buyers this demo makes up", { exact: false }),
    ).toBeVisible();
    await expect(canvas.getAllByText("· simulated", { exact: false })).toHaveLength(4);
  },
};

/** Nothing has happened yet in this sandbox. */
export const Quiet: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Quiet right now.")).toBeVisible();
  },
};

/** Paused: it stops asking, and says so (WCAG 2.2.2). */
export const Paused: Story = {
  parameters: { sandbox: { isBusy: true } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText("· simulated", { exact: false });
    await userEvent.click(canvas.getByRole("button", { name: "Pause updates" }));
    // The toggle's own status; the page's toast region is a status too.
    await expect(canvas.getByText("Paused")).toHaveAttribute("role", "status");
    await expect(canvas.getByRole("button", { name: "Pause updates" })).toHaveAttribute("aria-pressed", "true");
  },
};
