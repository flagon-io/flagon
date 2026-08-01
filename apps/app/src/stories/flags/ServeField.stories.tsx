import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ServeField } from "@/app/[org]/flags/[key]/env-controls";
import { defaultProgressive, type ServeDraft } from "@/app/[org]/flags/[key]/serve-model";
import { boolVariants, colorVariants } from "../_fixtures";

/**
 * The shared "Serve" field: a dropdown of each variant plus "a percentage split"
 * and "a progressive rollout". Drives both a rule's serve and the environment
 * default, so it validates the SplitPanel + ProgressiveEditor + inline errors.
 */
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
  return (
    <div className="rounded-lg border border-white/10 bg-white/2 p-4">
      <ServeField
        label="When no rule matches, serve"
        variants={variants}
        draft={draft}
        isBoolean={isBoolean}
        onChange={setDraft}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Flags/ServeField",
  component: Harness,
};
export default meta;
type Story = StoryObj<typeof Harness>;

export const SingleValue: Story = {
  args: { initial: { weights: { on: 100, off: 0 }, bucketBy: "" } },
};

export const PercentageSplit: Story = {
  args: { initial: { weights: { on: 50, off: 50 }, bucketBy: "" } },
};

export const SplitDoesNotTotal100: Story = {
  name: "Split · invalid total",
  args: { initial: { weights: { on: 60, off: 30 }, bucketBy: "" } },
};

export const ProgressiveRollout: Story = {
  args: {
    initial: { weights: {}, bucketBy: "", progressive: defaultProgressive(boolVariants, 0) },
  },
};

export const ProgressiveInvalidStep: Story = {
  name: "Progressive · invalid step %",
  args: {
    initial: {
      weights: {},
      bucketBy: "",
      progressive: {
        variant: "on",
        fallback: "off",
        bucketBy: "",
        start: 0,
        steps: [
          { percent: 255, value: 6, unit: "hours" },
          { percent: 60, value: 0, unit: "hours" },
        ],
      },
    },
  },
};

export const MultivariateSplit: Story = {
  args: {
    initial: { weights: { red: 34, green: 33, blue: 33 }, bucketBy: "" },
    isBoolean: false,
    variants: colorVariants,
  },
};
