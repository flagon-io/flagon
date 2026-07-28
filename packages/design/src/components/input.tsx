"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Text inputs that share the EXACT trigger styling of Select, so a form of mixed
 * inputs and selects lines up: same height, border, radius, and focus ring. Pass
 * a `className` to tweak per use; it is appended, so overrides win.
 */
// Shared field styling. The standard control height is 10 (40px) — Input, Select,
// and Button all share it so a row of mixed controls lines up exactly.
const shared =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input ref={ref} className={[shared, "h-10", className ?? ""].join(" ")} {...props} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={[shared, "resize-none py-2.5", className ?? ""].join(" ")}
      {...props}
    />
  );
});
