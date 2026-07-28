"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

/**
 * The one button. Its default height (`h-10`, 40px) matches the form primitives
 * (Input, Select) EXACTLY, so a button sitting in a row of fields lines up
 * perfectly. Size is standardized: prefer the default everywhere, even when a
 * smaller one feels tempting, so controls stay uniform. `size="sm"` exists only
 * for genuinely dense, inline contexts; `size="icon"` is the square 40px button
 * for icon-only actions (e.g. an overflow "…" menu next to a text button).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-teal-500 text-zinc-950 hover:bg-teal-400 font-semibold",
  secondary:
    "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 font-medium",
  ghost: "text-zinc-300 hover:bg-white/5 font-medium",
  danger:
    "border border-white/10 bg-white/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 font-medium",
};

const SIZES = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-2.5 text-xs",
  icon: "h-10 w-10 text-sm",
} as const;

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: keyof typeof SIZES;
  }
>(function Button({ variant = "secondary", size = "md", className, type, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={[
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-teal-500/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZES[size],
        VARIANTS[variant],
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
});
