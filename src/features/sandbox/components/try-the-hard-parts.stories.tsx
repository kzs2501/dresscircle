import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { TryTheHardParts } from "./try-the-hard-parts";

/** The hard parts, one click each: in the sandbox, all five. */
const meta = {
  title: "Features/Sandbox/Try the hard parts",
  component: TryTheHardParts,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TryTheHardParts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InTheSandbox: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("listitem")).toHaveLength(5);
    await expect(canvas.getByRole("button", { name: /^Break a payment/ })).toBeEnabled();
  },
};
