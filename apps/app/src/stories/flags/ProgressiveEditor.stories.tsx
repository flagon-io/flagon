import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressiveEditor } from "@/app/[org]/flags/[key]/env-controls";
import {
  defaultProgressive,
  validateServe,
  type ProgressiveDraft,
} from "@/app/[org]/flags/[key]/serve-model";
import { boolVariants } from "../_fixtures";

function Harness({ initial }: { initial: ProgressiveDraft }) {
  const [draft, setDraft] = useState<ProgressiveDraft>(initial);
  const errors = validateServe(
    { weights: {}, bucketBy: "", progressive: draft },
    boolVariants,
  ).progressive;
  return (
    <div className="rounded-lg border border-white/10 bg-white/2 p-4">
      <ProgressiveEditor
        variants={boolVariants}
        draft={draft}
        isBoolean
        errors={errors}
        onChange={setDraft}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Flags/ProgressiveEditor",
  component: Harness,
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** The Vercel-style default: four steps 5/10/25/60, each 6h. */
export const Default: Story = {
  args: { initial: defaultProgressive(boolVariants, 0) },
};

export const InvalidStepPercent: Story = {
  args: {
    initial: {
      variant: "on",
      fallback: "off",
      bucketBy: "",
      start: 0,
      steps: [
        { percent: 255, value: 6, unit: "hours" },
        { percent: 60, value: 6, unit: "hours" },
      ],
    },
  },
};

export const RollFromEqualsTo: Story = {
  name: "Roll from == to (invalid)",
  args: {
    initial: {
      variant: "on",
      fallback: "on",
      bucketBy: "",
      start: 0,
      steps: [{ percent: 50, value: 6, unit: "hours" }],
    },
  },
};
