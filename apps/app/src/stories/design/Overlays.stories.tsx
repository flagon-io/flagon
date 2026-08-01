import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@flagon/design";
import { ArrowDown, ArrowUp, MoreHorizontal, Trash2 } from "lucide-react";

const meta: Meta = {
  title: "Design/Overlays",
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj;

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <ModalHeader
            title="Discard targeting rules?"
            description="This switches the environment back to a single value."
            onClose={() => setOpen(false)}
          />
          <ModalBody>
            <p className="text-sm text-zinc-400">
              Your staged rules will be lost. This cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Discard and switch
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}

export const HouseModal: Story = { render: () => <ModalDemo /> };

export const OverflowMenu: Story = {
  render: () => (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem>
          <ArrowUp className="size-4" /> Add step before
        </MenuItem>
        <MenuItem>
          <ArrowDown className="size-4" /> Add step after
        </MenuItem>
        <MenuSeparator />
        <MenuItem className="text-red-400 data-highlighted:text-red-300">
          <Trash2 className="size-4" /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
};
