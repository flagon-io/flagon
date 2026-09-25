import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { controlHeight, focusRing, type ControlSize } from "../lib/control";

export type InputProps = Omit<ComponentProps<"input">, "size"> & { size?: ControlSize };

// `size` is the control-scale variant (sm/md/lg), not the native character-width
// attribute, so an input lines up with the button beside it. Defaults to md.
export function Input({ className, size = "md", ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      className={cn(
        controlHeight[size],
        "w-full rounded-md border border-input bg-background px-3 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "transition",
        focusRing,
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
