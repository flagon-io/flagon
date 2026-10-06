import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { slantSurface } from "@/lib/slant";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

/** Buttons are slanted by nature: the fill, border and focus ring live on a
 * skewed surface (slantSurface), the label stays upright. */
const base = cn(
  slantSurface,
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-colors focus-visible:before:ring-2 focus-visible:before:ring-brand focus-visible:before:ring-offset-2 focus-visible:before:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
);

const variants: Record<ButtonVariant, string> = {
  default: "text-primary-foreground before:bg-primary hover:before:bg-primary/90",
  secondary:
    "text-foreground before:border before:border-hairline before:bg-panel hover:before:bg-secondary",
  ghost: "text-muted-foreground hover:text-foreground hover:before:bg-panel",
  outline:
    "text-foreground before:border before:border-hairline hover:before:bg-panel",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-sm",
  md: "h-[38px] px-5 text-sm",
  lg: "h-11 px-7 text-[15px]",
};

/** Class string for a button-styled element (button or link). */
export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { variant = "default", size = "md", className } = opts ?? {};
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}
