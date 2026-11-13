import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import type { OrganiserEventDto } from "@/contract/dto";
import { MAX_REFUND_BATCH, type BatchOrder, type RefundBatch } from "@/features/organiser/domain/refund-batch";
import { EVENTS, questionWith } from "@/features/organiser/testing/answer-fixtures";
import { RefundBatchView } from "./refund-batch";

const OWNER_EVENTS: OrganiserEventDto[] = EVENTS.map((event) => ({
  ...event,
  permissions: ["orders:read", "orders:export", "orders:refund"],
}));
const BUYERS = ["Priya Shah", "Arun Kumar", "Meera Iyer", "Kabir Singh", "Sana Qureshi", "Dev Patel"];
const orders = (count: number): BatchOrder[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `ord_h${String(11_200 + index)}`,
    buyerName: BUYERS[index % BUYERS.length] ?? "A buyer",
    eventName: "Night Market Jazz",
    totalMinor: 800_000,
    currency: "INR",
  }));
const batchOf = (count: number, fields: Partial<RefundBatch> = {}): RefundBatch => ({
  orders: orders(count),
  alreadyRefunding: 0,
  notAllowed: 0,
  totalMinor: count * 800_000,
  currency: "INR",
  isTooMany: false,
  ...fields,
});
const question = questionWith({ intent: "refund-orders", event: "night-market-jazz", refundReason: "event_changed" });

/**
 * A request to refund, answered (ADR 027): what would be refunded, said before anything
 * is; a review that lists exactly those orders; from 20, the number typed to confirm;
 * then the batch's progress, what didn't go through, and Retry.
 */
const meta = {
  title: "Features/Organiser/Refund batch",
  component: RefundBatchView,
  args: {
    batch: batchOf(3),
    question,
    events: OWNER_EVENTS,
    state: { status: "idle" },
    onConfirm: fn(),
    onStop: fn(),
    onRetry: fn(),
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof RefundBatchView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A few orders: one review, no typing, and the reason the request gave already chosen. */
export const AFewOrders: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText("3 orders for Night Market Jazz can be refunded: ₹24,000.00 in all.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Review and refund…" }));
    // The dialog opens on the next frame, once it lists the orders frozen as it opened.
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Refund 3 orders?" });
    await expect(within(dialog).getByRole("combobox", { name: "Why?" })).toHaveValue("event_changed");
    await expect(within(dialog).queryByRole("textbox")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Refund 3 orders (₹24,000.00)" }));
    await expect(args.onConfirm).toHaveBeenCalledWith(orders(3), "event_changed");
  },
};

/** Twenty or more: the number must be typed before Refund does anything. */
export const ManyOrders: Story = {
  args: { batch: batchOf(23) },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Review and refund…" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Refund 23 orders?" }),
    );
    await expect(dialog.getByText("and 13 more")).toBeVisible();
    const refund = dialog.getByRole("button", { name: "Refund 23 orders (₹1,84,000.00)" });
    await expect(refund).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(refund);
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByRole("textbox", { name: "Type 23 to confirm" }), "23");
    await expect(refund).not.toHaveAttribute("aria-disabled");
    await userEvent.click(dialog.getByRole("button", { name: "Keep them" }));
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

/** Orders already refunding, and of events this role can't refund, are left out and counted. */
export const SomeLeftOut: Story = {
  args: { batch: batchOf(5, { alreadyRefunding: 4, notAllowed: 1 }) },
};

export const TooMany: Story = {
  args: { batch: batchOf(0, { isTooMany: true, currency: null }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(new RegExp(`more than ${String(MAX_REFUND_BATCH)} orders`, "u"))).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Review and refund…" })).toBeNull();
  },
};

export const NothingToRefund: Story = {
  args: { batch: batchOf(0, { currency: null, alreadyRefunding: 2 }) },
};

/** The box office reads the orders, but only an owner can refund them. */
export const BoxOffice: Story = {
  args: { events: EVENTS },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Your role can’t refund orders/u)).toBeVisible();
  },
};

export const Refunding: Story = {
  args: { state: { status: "running", total: 23, done: 12, failed: [] } },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText("Refunding: 12 of 23.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(args.onStop).toHaveBeenCalled();
  },
};

export const Started: Story = {
  args: { state: { status: "finished", total: 23, started: 23, failed: [], wasStopped: false } },
};

export const SomeFailed: Story = {
  args: {
    state: {
      status: "finished",
      total: 23,
      started: 21,
      failed: [
        { orderId: "ord_h11203", message: "The payment provider couldn’t start the refund." },
        { orderId: "ord_h11207", message: "This order has already been refunded." },
      ],
      wasStopped: false,
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Retry the 2 that failed" }));
    await expect(args.onRetry).toHaveBeenCalledWith("event_changed");
  },
};

export const Stopped: Story = {
  args: { state: { status: "finished", total: 23, started: 8, failed: [], wasStopped: true } },
};
