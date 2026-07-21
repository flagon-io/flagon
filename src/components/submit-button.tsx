"use client";

import { useFormStatus } from "react-dom";
import { buttonStyles } from "./form-controls";
export function SubmitButton({ children, pendingLabel = "Working…", className, variant = "primary", disabled = false }: { children: React.ReactNode; pendingLabel?: string; className?: string; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const unavailable = pending || disabled;
  return <button type="submit" disabled={unavailable} aria-disabled={unavailable} className={`${buttonStyles(variant)} ml-auto ${className ?? ""} disabled:cursor-not-allowed disabled:opacity-40`}>{pending ? pendingLabel : children}</button>;
}
