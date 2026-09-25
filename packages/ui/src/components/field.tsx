import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { Label } from "./label";

/**
 * A form row: label + control + description + error, spaced consistently. Compose
 * Field > FieldLabel + your control + FieldDescription/FieldError.
 */
export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field" className={cn("space-y-1.5", className)} {...props} />;
}
export function FieldLabel(props: ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" {...props} />;
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-xs text-muted-foreground", className)} {...props} />;
}
export function FieldError({ className, children, ...props }: ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p data-slot="field-error" role="alert" className={cn("text-xs text-destructive", className)} {...props}>
      {children}
    </p>
  );
}
