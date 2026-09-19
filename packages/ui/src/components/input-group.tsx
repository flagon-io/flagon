import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { controlHeight, type ControlSize } from "../lib/control";

/**
 * A text input with an optional leading/trailing addon (prefix/suffix), rendered
 * as distinct segments that share one bordered, focus-ring container - e.g.
 * `app.flagon.io/ [ slug ]` or `[ subdomain ] .flagon.app`. `size` is the
 * control-scale variant (sm/md/lg), not the native attribute.
 */
export function InputGroup({
  prefix,
  suffix,
  className,
  inputClassName,
  prefixClassName,
  suffixClassName,
  disabled,
  size = "md",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputClassName?: string;
  /** Class for the leading addon segment (e.g. `p-0` to let an interactive child fill it). */
  prefixClassName?: string;
  /** Class for the trailing addon segment. */
  suffixClassName?: string;
  size?: ControlSize;
}) {
  return (
    <div
      className={cn(
        controlHeight[size],
        "flex items-stretch overflow-hidden rounded-md border border-input bg-background text-sm",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        disabled && "opacity-60",
        className,
      )}
    >
      {prefix != null && (
        <span
          className={cn(
            "flex select-none items-center border-r border-input bg-muted/40 px-3 text-muted-foreground",
            prefixClassName,
          )}
        >
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
        <span
          className={cn(
            "flex select-none items-center border-l border-input bg-muted/40 px-3 text-muted-foreground",
            suffixClassName,
          )}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
