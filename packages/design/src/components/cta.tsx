import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * The call-to-action button.
 *
 * One component so every CTA on every surface aligns by construction and gets
 * a real focus ring, rather than each page pasting its own teal class string
 * and shoving an icon into a nested span. It is a flex row, so a leading or
 * trailing icon lines up with the label without a wrapper.
 *
 * Framework-agnostic on purpose: it renders a plain `<a>`, so the design
 * package stays free of any router dependency and both the marketing site and
 * the app can use it. Where client-side navigation matters, a consumer can
 * pass its own router link as `children` of a plain link, or wrap this.
 */

type CtaVariant = "primary" | "secondary";
type CtaSize = "sm" | "md" | "lg";
type CtaShape = "square" | "pill";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

const VARIANT: Record<CtaVariant, string> = {
  primary: "bg-teal-500 text-zinc-950 hover:bg-teal-400",
  // Vercel-style dark button: a defined border over a subtle fill (not a ghost
  // link), with the border brightening toward white on hover.
  secondary:
    "border border-white/20 bg-white/4 text-zinc-100 hover:border-white/40 hover:bg-white/8",
};

const SIZE: Record<CtaSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-sm",
};

const SHAPE: Record<CtaShape, string> = {
  square: "rounded-md",
  pill: "rounded-full",
};

export function Cta({
  children,
  variant = "primary",
  size = "md",
  shape = "square",
  icon,
  iconRight,
  className,
  ...rest
}: {
  variant?: CtaVariant;
  size?: CtaSize;
  shape?: CtaShape;
  /** Leading icon. The button is a flex row, so it aligns without a wrapper. */
  icon?: ReactNode;
  /** Trailing icon, e.g. an arrow. */
  iconRight?: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const classes = [base, VARIANT[variant], SIZE[size], SHAPE[shape], className]
    .filter(Boolean)
    .join(" ");

  return (
    <a className={classes} {...rest}>
      {icon}
      {children}
      {iconRight}
    </a>
  );
}
