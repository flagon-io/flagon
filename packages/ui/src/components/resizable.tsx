"use client";

import { GripVertical } from "lucide-react";
import {
  Panel as PrimitivePanel,
  PanelGroup as PrimitivePanelGroup,
  PanelResizeHandle as PrimitiveHandle,
} from "react-resizable-panels";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Draggable, resizable panel groups (react-resizable-panels). */
export function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof PrimitivePanelGroup>) {
  return (
    <PrimitivePanelGroup
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
      {...props}
    />
  );
}

export const ResizablePanel = PrimitivePanel;

export function ResizableHandle({
  withHandle,
  className,
  ...props
}: ComponentProps<typeof PrimitiveHandle> & { withHandle?: boolean }) {
  return (
    <PrimitiveHandle
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-hairline outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 hover:after:bg-brand/40",
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
        "data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-5 w-3 items-center justify-center rounded-sm border border-hairline bg-panel data-[panel-group-direction=vertical]:rotate-90">
          <GripVertical className="size-3 text-muted-foreground" />
        </div>
      )}
    </PrimitiveHandle>
  );
}
