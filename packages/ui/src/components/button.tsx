import type { ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/cn";
import { controlHeight } from "../lib/control";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

// `--elevation` is a Brand-supplied box-shadow (empty by default = flat). When a
// Brand sets it, buttons get a chunky, pressable look; active nudges down.
// box-shadow carries the Brand's elevation (chunky/pressable look), so the focus
// indicator uses `outline` instead of a ring - otherwise the two would fight over
// box-shadow. Elevation is empty by default (flat).
// The chunky elevation is built HERE from the Brand's geometry (--el-ring / --el-x
// / --el-y, all 0 by default = flat) and each variant's own --btn-shade color, so
// a primary button gets a dark-primary edge and a neutral button a dark edge - the
// two-tone "3D block" look. On :active the offset shrinks to --el-xp/yp and the
// button nudges down, so it sinks into its shadow. Focus uses outline, leaving
// box-shadow free for the elevation.
const base =
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium outline-none transition [box-shadow:0_0_0_var(--el-ring,0px)_var(--btn-shade,transparent),var(--el-x,0px)_var(--el-y,0px)_0_0_var(--btn-shade,transparent)] active:[box-shadow:0_0_0_var(--el-ring,0px)_var(--btn-shade,transparent),var(--el-xp,0px)_var(--el-yp,0px)_0_0_var(--btn-shade,transparent)] active:translate-x-px active:translate-y-px focus-visible:[outline:2px_solid_var(--color-brand)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50";

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
    "bg-destructive text-white hover:bg-destructive/90 [--btn-shade:color-mix(in_oklab,var(--destructive),#000_28%)]",
  // A text action styled as a link (no fill or elevation). For an inline link
  // inside prose or a table cell, pair with size="sm" and className="h-auto px-0".
  link: "text-link underline-offset-4 hover:underline [box-shadow:none]",
};

// Heights come from the shared control scale so buttons stay locked to inputs
// and selects; only the horizontal padding + text size are button-specific.
const sizes: Record<ButtonSize, string> = {
  sm: `${controlHeight.sm} px-3 text-sm`,
  md: `${controlHeight.md} px-4 text-sm`,
  lg: `${controlHeight.lg} px-6 text-[15px]`,
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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as the child element (e.g. a Next <Link>) instead of a <button>. */
  asChild?: boolean;
};

export function Button({ variant, size, className, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={buttonClasses({ variant, size, className })} {...props} />;
}
