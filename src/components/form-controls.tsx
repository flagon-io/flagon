"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { buttonBaseClass, inputBaseClass, labelClass } from "./form-ui";

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

/**
 * Button variants. EVERY variant carries a border, because a button whose
 * edges you cannot see is a button you have to guess the click target of. The
 * old borderless "ghost" is gone; `bare` replaces it and exists only for icon
 * affordances that sit inside chrome which already draws the boundary (a
 * dialog's close X, a segmented control), where a second box would be noise.
 */
export type ButtonVariant =
  "primary" | "secondary" | "danger" | "ghost" | "bare";

export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: "sm" | "md" = "md",
) {
  const variantClass =
    variant === "primary"
      ? "bg-teal-500 font-semibold text-zinc-950 hover:bg-teal-400 disabled:opacity-60"
      : variant === "secondary"
        ? "border border-white/10 text-zinc-300 hover:border-white/20 hover:text-zinc-100 disabled:opacity-50"
        : variant === "danger"
          ? "border border-red-500/40 font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          : variant === "bare"
            ? "text-zinc-500 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
            : // ghost: quieter than secondary, but still a visible target.
              "border border-white/8 text-zinc-400 hover:border-white/20 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40";
  return cx(
    buttonBaseClass,
    variantClass,
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      className={cx(buttonStyles(variant, size), className)}
      {...props}
    />
  );
}

export function Input({
  className,
  compact,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <input
      className={cx(inputBaseClass, compact ? "h-8 text-xs" : "h-9", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        inputBaseClass,
        "min-h-24 resize-y py-2 leading-5",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx(labelClass, className)}>
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs font-normal text-zinc-600">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};
export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  placeholder,
  disabled,
  className,
  compact = false,
  ariaLabel,
}: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  ariaLabel?: string;
}) {
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cx(
          "flex w-full box-border items-center justify-between gap-3 rounded-md border border-white/10 bg-[#111113] px-3 text-left text-sm leading-none text-zinc-200 outline-none transition hover:border-white/20 focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 data-[placeholder]:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "h-8 text-xs" : "h-9",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={5}
          className="z-[110] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-white/10 bg-[#111113] p-1 shadow-2xl shadow-black/60"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-default select-none items-center rounded px-8 py-2 text-sm text-zinc-300 outline-none data-[highlighted]:bg-white/7 data-[highlighted]:text-zinc-50 data-[disabled]:opacity-40"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5">
                  <Check className="h-3.5 w-3.5 text-teal-400" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
