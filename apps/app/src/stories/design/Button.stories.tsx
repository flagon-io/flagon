import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@flagon/design";
import { Plus } from "lucide-react";

const meta: Meta<typeof Button> = {
  title: "Design/Button",
  component: Button,
  args: { children: "Button" },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost", "danger"] },
    size: { control: "select", options: ["md", "sm", "icon"] },
    disabled: { control: "boolean" },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete" } };
export const WithIcon: Story = {
  args: { variant: "secondary", children: [<Plus key="i" className="size-4" />, "Add rule"] },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="secondary" size="sm">
        Small
      </Button>
      <Button variant="secondary" disabled>
        Disabled
      </Button>
    </div>
  ),
};
