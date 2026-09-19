import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";
import { controlHeight, type ControlSize } from "../lib/control";

// `size` is the control-scale variant (sm/md/lg), not the native character-width
// attribute, so an input lines up with the button beside it. Defaults to md.
export function Input({
  className,
  size = "md",
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: ControlSize; ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        controlHeight[size],
        "w-full rounded-md border border-input bg-background px-3 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
