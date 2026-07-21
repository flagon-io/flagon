import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Skeleton,
  SkeletonCards,
  SkeletonPageHeader,
  SkeletonRows,
  SkeletonText,
} from "./skeleton";

/**
 * Loading states.
 *
 * These are the hardest things in the app to look at deliberately: they exist
 * for a few hundred milliseconds on a fast connection, so the only reliable
 * way to judge whether a skeleton matches the shape of what replaces it is to
 * hold it still. A skeleton whose proportions are wrong reads as the page
 * jumping when the data lands.
 */
const meta = {
  title: "Feedback/Skeleton",
  component: SkeletonRows,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SkeletonRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rows: Story = { args: { rows: 3 } };

/** The empty-ish case: one row should not look like a rendering bug. */
export const SingleRow: Story = { args: { rows: 1 } };

export const Primitives: Story = {
  render: () => (
    <div className="max-w-2xl space-y-8 p-8">
      <Skeleton className="h-9 w-9" />
      <SkeletonText />
      <SkeletonPageHeader />
    </div>
  ),
};

export const Cards: Story = {
  render: () => (
    <div className="p-8">
      <SkeletonCards cards={6} />
    </div>
  ),
};
