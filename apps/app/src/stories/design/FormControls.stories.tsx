import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  TagsInput,
  Textarea,
} from "@flagon/design";
import { Crosshair, RefreshCw } from "lucide-react";

const meta: Meta = {
  title: "Design/Form controls",
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj;

/** Every control shares the same 40px height so a mixed row lines up. */
function AlignedRowDemo() {
  const [seg, setSeg] = useState("on");
  const [sel, setSel] = useState("red");
  return (
    <div className="flex w-130 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Text input" className="flex-1" />
        <Select
          value={sel}
          onValueChange={setSel}
          options={[
            { value: "red", label: "Red" },
            { value: "green", label: "Green" },
            { value: "blue", label: "Blue" },
          ]}
          className="w-32"
        />
      </div>
      <SegmentedControl
        value={seg}
        onValueChange={setSeg}
        options={[
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
        ]}
      />
      <SegmentedControl
        value={seg}
        onValueChange={setSeg}
        sizing="content"
        options={[
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
          {
            value: "rules",
            label: <Crosshair className="size-4" />,
            title: "Rules",
          },
          {
            value: "reuse",
            label: <RefreshCw className="size-4" />,
            title: "Reuse",
          },
        ]}
      />
    </div>
  );
}

function TagsDemo() {
  const [tags, setTags] = useState<string[]>(["pro", "enterprise"]);
  return (
    <div className="w-105">
      <TagsInput value={tags} onChange={setTags} placeholder="Add a value…" />
    </div>
  );
}

function ToggleDemo() {
  const [on, setOn] = useState(true);
  return <Switch checked={on} onCheckedChange={setOn} ariaLabel="Toggle" />;
}

export const AlignedRow: Story = { render: () => <AlignedRowDemo /> };

export const Inputs: Story = {
  render: () => (
    <div className="flex w-105 flex-col gap-4">
      <Field label="Name">
        <Input placeholder="my-flag" />
      </Field>
      <Field label="Description" hint="Optional">
        <Textarea rows={3} placeholder="What does this flag do?" />
      </Field>
      <Field label="Narrow (width override wins)">
        <Input defaultValue="42" className="w-16 text-right" />
      </Field>
    </div>
  ),
};

export const Tags: Story = { render: () => <TagsDemo /> };
export const Toggle: Story = { render: () => <ToggleDemo /> };
