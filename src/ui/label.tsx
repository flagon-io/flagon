"use client";

import * as LabelPrimitive from "@radix-ui/react-label";

/** Form label (Radix Label: proper association + double-click prevention). */
export function Label({
  className = "",
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={`block text-sm font-medium text-zinc-300 ${className}`}
      {...props}
    />
  );
}
