import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SplitPanel } from "@/app/[org]/flags/[key]/env-controls";
import { validateServe, type ServeDraft } from "@/app/[org]/flags/[key]/serve-model";
import { boolVariants, colorVariants } from "../_fixtures";

function Harness({
  initial,
  isBoolean = true,
  variants = boolVariants,
}: {
  initial: ServeDraft;
  isBoolean?: boolean;
  variants?: typeof boolVariants;
}) {
  const [draft, setDraft] = useState<ServeDraft>(initial);
  const errors = validateServe(draft, variants).split;
  return (
    <div className="rounded-lg border border-white/10 bg-white/2 p-4">
      <SplitPanel
        variants={variants}
        draft={draft}
        isBoolean={isBoolean}
        errors={errors}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Flags/SplitPanel",
  component: Harness,
};
export default meta;
type Story = StoryObj<typeof Harness>;

export const EvenSplit: Story = {
  args: { initial: { weights: { on: 50, off: 50 }, bucketBy: "" } },
};

export const BucketedWithFallback: Story = {
  name: "Bucketed on attribute + fallback",
  args: { initial: { weights: { on: 70, off: 30 }, bucketBy: "accountId", fallback: "off" } },
};

export const InvalidTotal: Story = {
  args: { initial: { weights: { on: 60, off: 30 }, bucketBy: "" } },
};

export const Multivariate: Story = {
  args: {
    initial: { weights: { red: 34, green: 33, blue: 33 }, bucketBy: "" },
    isBoolean: false,
    variants: colorVariants,
  },
};
