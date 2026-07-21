import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HexField } from "./hex-field";

/**
 * The hexagonal backdrop, both intensities.
 *
 * `quiet` was tuned by putting it next to `hero`, because judged alone a
 * deliberately restrained treatment always looks fine and the real failure is
 * that it disappears. Side by side is the only useful comparison, and this is
 * where to make it.
 */
const meta = {
  title: "Marketing/HexField",
  component: HexField,
} satisfies Meta<typeof HexField>;

export default meta;
type Story = StoryObj<typeof meta>;

const Frame = ({ variant }: { variant: "hero" | "quiet" }) => (
  <div className="relative h-96 border-b border-white/10">
    <HexField variant={variant} />
    <div className="relative p-12">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-teal-400/80">
        {variant}
      </p>
      <h2 className="mt-4 max-w-lg text-4xl font-semibold tracking-tight">
        The lattice must never cross the type.
      </h2>
    </div>
  </div>
);

export const Hero: Story = { render: () => <Frame variant="hero" /> };
export const Quiet: Story = { render: () => <Frame variant="quiet" /> };
export const Compared: Story = {
  render: () => (
    <>
      <Frame variant="hero" />
      <Frame variant="quiet" />
    </>
  ),
};
