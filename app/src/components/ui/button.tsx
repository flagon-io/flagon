import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary:
    "border border-hairline bg-panel text-foreground hover:bg-secondary",
  ghost: "text-muted-foreground hover:bg-panel hover:text-foreground",
  outline:
    "border border-hairline bg-transparent text-foreground hover:bg-panel",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-[38px] px-4 text-sm",
  lg: "h-11 px-6 text-[15px]",
};

/** Class string for a button-styled element (button, link, etc). */
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
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
