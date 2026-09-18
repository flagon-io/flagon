"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { useIsMobile } from "../lib/use-is-mobile";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "relative z-50 max-h-72 min-w-32 overflow-hidden rounded-lg border border-hairline bg-popover p-1 text-popover-foreground shadow-lg",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]")}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-2.5 pr-8 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2.5 flex items-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-brand" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn("px-2.5 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-hairline", className)} {...props} />;
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * A styled native `<select>`. Its option list is drawn by the OS (the mobile
 * wheel/sheet picker), so it is the right control on touch devices; the trigger
 * still matches the theme. Prefer `SelectField`, which picks this or the Radix
 * Select automatically.
 */
export function NativeSelect({
  options,
  className,
  ...props
}: Omit<ComponentProps<"select">, "children"> & { options: SelectOption[] }) {
  return (
    <div className="relative inline-flex w-full">
      <select
        data-slot="native-select"
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-background pr-8 pl-3 text-sm text-foreground outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export type SelectFieldProps = {
  options: SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  /** Class for the native <select> (mobile) and, if `triggerClassName` is unset, the Radix trigger. */
  className?: string;
  /** Class for the Radix trigger (desktop) only. */
  triggerClassName?: string;
  contentClassName?: string;
  "aria-label"?: string;
};

/**
 * The design system's adaptive select: a native `<select>` on mobile (best OS
 * picker, dark-mode-correct by the platform) and our Radix Select on desktop
 * (fully themed menu). Data-driven via `options`, so one call site works on
 * every device. For rich, composed menus use the primitives directly.
 */
export function SelectField({
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
  name,
  className,
  triggerClassName,
  contentClassName,
  "aria-label": ariaLabel,
}: SelectFieldProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <NativeSelect
        options={options}
        value={value}
        disabled={disabled}
        name={name}
        aria-label={ariaLabel}
        className={cn(triggerClassName, className)}
        onChange={(e) => onValueChange?.(e.currentTarget.value)}
      />
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled} name={name}>
      <SelectTrigger className={triggerClassName ?? className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
