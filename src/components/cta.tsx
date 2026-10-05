import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Slash, buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/button";

type Variant = "primary" | "secondary" | "ghost";

const toButtonVariant: Record<Variant, ButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
};

type CtaProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  external?: boolean;
  /** A trailing arrow; on by default for all but primary, which leads with a slash. */
  arrow?: boolean;
  size?: ButtonSize;
  className?: string;
};

/**
 * Marketing call-to-action: a link styled as a button. Primary actions lead
 * with a slash; the rest trail a nudging arrow. Internal links go through
 * next/link; external links open in a new tab.
 */
export function Cta({
  href,
  children,
  variant = "primary",
  external = false,
  arrow = variant !== "primary",
  size,
  className,
}: CtaProps) {
  const Arrow = external ? ArrowUpRight : ArrowRight;
  const cls = buttonClasses({ variant: toButtonVariant[variant], size, className });
  const inner = (
    <>
      {variant === "primary" && <Slash />}
      {children}
      {arrow && (
        <Arrow
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2}
        />
      )}
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
