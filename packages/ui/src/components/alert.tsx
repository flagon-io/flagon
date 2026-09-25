import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export type AlertVariant =
  | "default"
  | "info"
  | "brand"
  | "success"
  | "warning"
  | "destructive";

const surfaces: Record<AlertVariant, string> = {
  default: "border-hairline bg-card",
  info: "border-hairline bg-panel",
  brand: "border-brand/30 bg-brand/8",
  success: "border-success/30 bg-success/10",
  warning: "border-warning/30 bg-warning/10",
  destructive: "border-destructive/30 bg-destructive/10",
};

const iconTint: Record<AlertVariant, string> = {
  default: "text-muted-foreground",
  info: "text-muted-foreground",
  brand: "text-brand-bright",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export type AlertProps = ComponentProps<"div"> & {
  variant?: AlertVariant;
  /** Optional leading icon (e.g. a lucide icon element); rendered decoratively. */
  icon?: ReactNode;
};

export function Alert({
  variant = "default",
  icon,
  role,
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      // Errors/warnings announce assertively (role="alert"); the rest are polite
      // status regions - more correct than a blanket role="alert".
      role={role ?? (variant === "destructive" || variant === "warning" ? "alert" : "status")}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm text-foreground",
        surfaces[variant],
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          data-slot="alert-icon"
          aria-hidden="true"
          className={cn("mt-0.5 shrink-0 [&_svg]:size-4", iconTint[variant])}
        >
          {icon}
        </span>
      )}
      <div data-slot="alert-content" className="min-w-0 flex-1 space-y-1">
        {children}
      </div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-title"
      className={cn("font-medium leading-none tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
