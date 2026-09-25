import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/cn";
import { controlHeight, focusRing } from "../lib/control";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

// The chunky elevation is built HERE from the Brand's geometry (--el-ring / --el-x
// / --el-y, all 0 by default = flat) and each variant's own --btn-shade color, so
// a primary button gets a dark-primary edge and a neutral button a dark edge - the
// two-tone "3D block" look. On :active the offset shrinks to --el-xp/yp and the
// button nudges down, so it sinks into its shadow. Because box-shadow carries the
// elevation, focus is the shared OUTLINE treatment (`focusRing`), never a
// shadow-based ring that would fight it.
const base = cn(
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition [box-shadow:0_0_0_var(--el-ring,0px)_var(--btn-shade,transparent),var(--el-x,0px)_var(--el-y,0px)_0_0_var(--btn-shade,transparent)] active:[box-shadow:0_0_0_var(--el-ring,0px)_var(--btn-shade,transparent),var(--el-xp,0px)_var(--el-yp,0px)_0_0_var(--btn-shade,transparent)] active:translate-x-px active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  focusRing,
);

// --btn-shade is the color the elevation ring + offset use: a darker shade of the
// button's own fill for colored variants, the border token for neutral ones.
const variants: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground hover:bg-primary/90 [--btn-shade:color-mix(in_oklab,var(--primary),#000_32%)]",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 [--btn-shade:var(--border)]",
  ghost:
    "text-muted-foreground hover:bg-panel hover:text-foreground data-[state=open]:bg-panel data-[state=open]:text-foreground [box-shadow:none]",
  outline:
    "border border-input bg-transparent text-foreground hover:bg-panel [--btn-shade:var(--border)]",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 [--btn-shade:color-mix(in_oklab,var(--destructive),#000_28%)]",
  // A text action styled as a link (no fill or elevation). For an inline link
  // inside prose or a table cell, pair with size="sm" and className="h-auto px-0".
  link: "text-link underline-offset-4 hover:underline [box-shadow:none]",
};

// Heights come from the shared control scale so buttons stay locked to inputs
// and selects; only the horizontal padding + text size are button-specific.
const sizes: Record<ButtonSize, string> = {
  sm: `${controlHeight.sm} px-3 text-sm`,
  md: `${controlHeight.md} px-4 text-sm`,
  lg: `${controlHeight.lg} px-6 text-base`,
  // A square on the same scale as md, so a default icon button is exactly as tall
  // as a default text button/input and scales with the Brand's density. Callers
  // wanting a smaller square (calendar nav, etc.) override with size-7/size-9.
  icon: `${controlHeight.md} w-[var(--control-md)] p-0`,
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

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as the child element (e.g. a Next <Link>) instead of a <button>. */
  asChild?: boolean;
};

export function Button({ variant, size, className, asChild, type, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot data-slot="button" className={buttonClasses({ variant, size, className })} {...props} />;
  }
  // A bare <button> inside a <form> submits it by default, which is almost never
  // what an action button means. Default to type="button"; pass type="submit"
  // explicitly for the form's submit.
  return (
    <button
      data-slot="button"
      type={type ?? "button"}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
