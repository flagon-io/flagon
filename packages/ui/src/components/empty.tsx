import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/** An empty-state placeholder: an icon, a title, a description, and an optional action. */
export function Empty({
  className,
  icon,
  title,
  description,
  children,
  ...props
}: ComponentProps<"div"> & { icon?: ReactNode; title?: ReactNode; description?: ReactNode }) {
  return (
    <div
      data-slot="empty"
      className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}
      {...props}
    >
      {icon && (
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
