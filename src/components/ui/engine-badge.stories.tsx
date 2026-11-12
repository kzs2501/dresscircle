import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { EngineBadge } from "./engine-badge";

/** Which engine read a request: the device's model, the free cloud tier, or rules alone. */
const meta = {
  title: "UI/Engine badge",
  component: EngineBadge,
  args: { engine: null },
} satisfies Meta<typeof EngineBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutAi: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Without AI")).toBeVisible();
  },
};

export const OnDevice: Story = { args: { engine: "on-device" } };

export const Cloud: Story = { args: { engine: "cloud" } };
