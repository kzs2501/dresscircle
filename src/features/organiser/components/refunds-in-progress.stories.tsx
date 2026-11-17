import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import type { BatchOrder } from "@/features/organiser/domain/refund-batch";
import { newRun, type RefundRun } from "@/features/organiser/domain/refund-run";
import { RefundsInProgressView } from "./refunds-in-progress";

const orders = (count: number): BatchOrder[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `ord_h${String(11_200 + index)}`,
    buyerName: "A buyer",
    eventName: "Night Market Jazz",
    totalMinor: 800_000,
    currency: "INR",
  }));
const run = (id: number, label: string, count: number, fields: Partial<RefundRun>): RefundRun => ({
  ...newRun(id, label, orders(count), "event_changed"),
  ...fields,
});
const started = (count: number) =>
  Object.fromEntries(orders(count).map((order) => [order.id, { status: "started" as const }]));

/**
 * The dashboard's refund batches, on every page (ADR 027): one running says how far it's
 * got, with Stop; one that left orders unrefunded says so until it's dismissed.
 */
const meta = {
  title: "Features/Organiser/Refunds in progress",
  component: RefundsInProgressView,
  args: { runs: [], onStop: fn(), onDismiss: fn() },
  parameters: { layout: "padded" },
} satisfies Meta<typeof RefundsInProgressView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  args: { runs: [run(1, "Night Market Jazz", 28, { pass: { total: 28, done: 12 }, outcomes: started(12) })] },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(/^Refunding Night Market Jazz: 12 of 28\./u)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(args.onStop).toHaveBeenCalledWith(1);
  },
};

export const LeftSomeUnrefunded: Story = {
  args: {
    runs: [
      run(2, "Monsoon Strings", 10, {
        outcomes: { ...started(7), ord_h11207: { status: "failed", message: "This order has already been refunded." } },
        wasStopped: true,
      }),
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      within(canvas.getByRole("region", { name: "Refunds" })).getByText(
        "Monsoon Strings: Refunds started for 7 orders. They’re refunded once the payment provider confirms. 1 didn’t go through. Stopped: 2 weren’t asked for.",
      ),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onDismiss).toHaveBeenCalledWith(2);
  },
};

/** Every refund started: nothing to show, only what a screen reader heard. */
export const AllStarted: Story = {
  args: { runs: [run(3, "Night Market Jazz", 4, { outcomes: started(4) })] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("region", { name: "Refunds" })).toBeNull();
  },
};
