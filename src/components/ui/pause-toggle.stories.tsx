import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { PauseToggle } from "./pause-toggle";

const meta = {
  title: "UI/Pause toggle",
  component: PauseToggle,
  args: { tone: "live", label: "Live", isPaused: false, onToggle: fn() },
  tags: ["autodocs"],
} satisfies Meta<typeof PauseToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Pause live updates" }));
    await expect(args.onToggle).toHaveBeenCalledOnce();
  },
};

export const Paused: Story = { args: { tone: "paused", label: "Paused", isPaused: true } };

/** Reconnecting, or waiting to start: amber. */
export const Waiting: Story = { args: { tone: "waiting", label: "Reconnecting. Refreshing every 15 s until then" } };
