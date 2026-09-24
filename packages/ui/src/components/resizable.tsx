"use client";

import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { createContext, useContext, type ComponentProps } from "react";
import { cn } from "../lib/cn";

// react-resizable-panels v4 renamed the primitives (PanelGroup/PanelResizeHandle ->
// Group/Separator), swapped `direction` for `orientation`, and no longer exposes the
// group direction as a data attribute on descendants. We carry the orientation down
// through context so the handle can still style itself for the axis it sits on.
const OrientationContext = createContext<"horizontal" | "vertical">("horizontal");

/** Draggable, resizable panel groups (react-resizable-panels). */
export function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<typeof Group>) {
  return (
    <OrientationContext.Provider value={orientation}>
      <Group
        data-slot="resizable-panel-group"
        orientation={orientation}
        className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
        {...props}
      />
    </OrientationContext.Provider>
  );
}

export const ResizablePanel = Panel;

export function ResizableHandle({
  withHandle,
  className,
  ...props
}: ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  const vertical = useContext(OrientationContext) === "vertical";
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex items-center justify-center bg-hairline outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
        vertical
          ? "h-px w-full after:absolute after:inset-x-0 after:left-0 after:top-1/2 after:h-1 after:w-full after:-translate-y-1/2 hover:after:bg-brand/40"
          : "w-px after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 hover:after:bg-brand/40",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "z-10 flex h-5 w-3 items-center justify-center rounded-sm border border-hairline bg-panel",
            vertical && "rotate-90",
          )}
        >
          <GripVertical className="size-3 text-muted-foreground" />
        </div>
      )}
    </Separator>
  );
}
