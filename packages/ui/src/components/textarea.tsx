import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
