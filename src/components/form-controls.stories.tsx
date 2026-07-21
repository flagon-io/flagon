import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Field, Input, Textarea } from "./form-controls";

/**
 * The form primitives, all five button variants at once.
 *
 * Variants are worth seeing TOGETHER rather than one per story. The only
 * question that matters about them is relative: whether secondary reads as
 * clearly secondary next to primary, and whether danger is distinct enough to
 * stop someone mid-click. Neither is answerable one variant at a time.
 */
const meta = {
  title: "Controls/Form",
  component: Button,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => (
    <div className="space-y-6 p-10">
      {(["md", "sm"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-3">
          {(["primary", "secondary", "danger", "ghost", "bare"] as const).map(
            (variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ),
          )}
        </div>
      ))}
      {/* Disabled is not a sixth variant, it is a state every variant has, and
          it is the one most likely to be forgotten in a restyle. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled>disabled</Button>
        <Button variant="secondary" disabled>
          disabled
        </Button>
      </div>
    </div>
  ),
};

export const Inputs: Story = {
  render: () => (
    <div className="w-100 space-y-5 p-10">
      <Field label="Name">
        <Input placeholder="Robin Vale" />
      </Field>
      <Field label="Slug" hint="Lowercase, no spaces.">
        <Input placeholder="acme-platform" />
      </Field>
      <Field label="Overview">
        <Textarea placeholder="What this project is, and who it serves." />
      </Field>
      <Field label="Disabled">
        <Input disabled placeholder="Not editable" />
      </Field>
    </div>
  ),
};
