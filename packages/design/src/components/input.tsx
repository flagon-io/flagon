"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Text inputs that share the EXACT trigger styling of Select, so a form of mixed
 * inputs and selects lines up: same height, border, radius, and focus ring.
 *
 * Full-width by default, but a caller-supplied width WINS: pass any width/flex
 * utility (`w-16`, `min-w-…`, `flex-1`, …) and `cn` (tailwind-merge) keeps the
 * caller's utility over the base `w-full`.
 */
const shared =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(shared, "h-10", className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(shared, "py-2.5 resize-none", className)} {...props} />
  );
});
