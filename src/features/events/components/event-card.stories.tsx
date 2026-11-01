import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CATALOG } from "@/core/catalog";
import { EVENT_CATEGORIES } from "@/core/statuses";
import { cardOf, EventGrid } from "./event-card";

/** One event of each kind, so every poster's motif is here: sunburst, arch, spotlight, waves, tiles and fans. */
const ONE_OF_EACH = EVENT_CATEGORIES.flatMap((category) => {
  const event = CATALOG.find((candidate) => candidate.category === category);
  return event ? [cardOf(event)] : [];
});

const meta = {
  title: "Features/Events/Event cards",
  component: EventGrid,
  args: { events: ONE_OF_EACH },
  tags: ["screen"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof EventGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryKindOfNightOut: Story = {};
