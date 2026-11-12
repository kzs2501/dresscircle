import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { answerFor } from "@/features/organiser/domain/answers";
import type { Asked } from "@/features/organiser/hooks/use-organiser-question";
import { EVENTS, METRICS, questionWith } from "@/features/organiser/testing/answer-fixtures";
import { AnswerCard } from "./assistant";

const asked = (text: string, fields: Parameters<typeof questionWith>[0], extra: Partial<Asked> = {}): Asked => ({
  id: 1,
  text,
  question: questionWith(fields),
  engine: null,
  unused: [],
  ...extra,
});
const answered = (entry: Asked, orderCount?: number) =>
  answerFor(entry.question, { events: EVENTS, metrics: METRICS, orderCount });

const sales = asked("sales in the last 7 days", { intent: "sales-over-time" });
const types = asked("which ticket type is selling best?", { intent: "ticket-types" });
const paid = asked("how buyers paid", { intent: "payment-mix" });
const funnel = asked("from reservation to payment", { intent: "funnel" });
const refunds = asked(
  "refunded UPI orders for the jazz night this week",
  {
    intent: "find-orders",
    event: "night-market-jazz",
    statuses: ["refunded"],
    method: "upi",
    from: "2026-11-09",
    to: "2026-11-13",
  },
  { engine: "cloud" },
);
const poem = asked(
  "write a poem about our sales",
  { intent: "unsupported", notApplied: ["a poem"] },
  { engine: "on-device" },
);

/**
 * An organiser's question and its answer (ADR 026): how it was read and by which
 * engine, the sentence, a picture where one helps, and a link to where the numbers
 * came from. Every number is the dashboard's own.
 */
const meta = {
  title: "Features/Organiser/Answer",
  component: AnswerCard,
  args: { events: EVENTS, asked: sales, answer: answered(sales) },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AnswerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The last seven days, with the dashboard's chart cut to them. */
export const SalesOverTime: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Across your events, 7 to 13 Nov 2026: 100 tickets/u)).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 3, name: "Tickets sold by day" })).toBeVisible();
  },
};

/** By share sold, and why not by speed. */
export const TicketTypes: Story = {
  args: { asked: types, answer: answered(types) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("meter", { name: /VIP/u })).toBeVisible();
    await expect(canvas.getByText(/aren’t kept day by day/u)).toBeVisible();
  },
};

export const HowBuyersPaid: Story = { args: { asked: paid, answer: answered(paid) } };

export const Funnel: Story = { args: { asked: funnel, answer: answered(funnel) } };

/** Read by the free cloud model; the link opens the orders table filtered to just these. */
export const OrdersReadByAi: Story = {
  args: { asked: refunds, answer: answered(refunds, 23) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("AI (free tier)")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open them in the orders table" })).toHaveAttribute(
      "href",
      "/organiser/orders?event=night-market-jazz&status=refunded&method=upi&from=2026-11-09&to=2026-11-13",
    );
  },
};

/** Something it can't answer, said plainly, with what it didn't use. */
export const NotAnswerable: Story = {
  args: { asked: poem, answer: answered(poem) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^I can answer questions about your sales/u)).toBeVisible();
    await expect(canvas.getByText("Not used: “a poem”.")).toBeVisible();
  },
};

export const WorkingItOut: Story = { args: { answer: null } };

export const NumbersFailed: Story = { args: { answer: null, isFailed: true } };
