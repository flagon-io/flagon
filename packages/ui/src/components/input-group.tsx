import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * A text input with an optional leading/trailing addon (prefix/suffix), rendered
 * as distinct segments that share one bordered, focus-ring container - e.g.
 * `app.flagon.io/ [ slug ]` or `[ subdomain ] .flagon.app`.
 */
export function InputGroup({
  prefix,
  suffix,
  className,
  inputClassName,
  disabled,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-background text-sm",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        disabled && "opacity-60",
        className,
      )}
    >
      {prefix != null && (
        <span className="flex select-none items-center border-r border-input bg-muted/40 px-3 text-muted-foreground">
          {prefix}
        </span>
      )}
      <input
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-3 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          inputClassName,
        )}
        {...props}
      />
      {suffix != null && (
        <span className="flex select-none items-center border-l border-input bg-muted/40 px-3 text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
