"use client";

import { OTPInput, OTPInputContext } from "input-otp";
import { Minus } from "lucide-react";
import { useContext, type ComponentProps } from "react";
import { cn } from "../lib/cn";

/**
 * One-time-code input (paste-aware, single logical field rendered as slots).
 * Built on `input-otp`, shadcn-style: compose InputOTP > InputOTPGroup >
 * InputOTPSlot (with InputOTPSeparator between groups). Drive it with
 * value/onChange + maxLength, and onComplete to fire when it's full.
 */
export function InputOTP({
  className,
  containerClassName,
  ...props
}: ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center gap-2 has-[:disabled]:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

export function InputOTPGroup({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="input-otp-group" className={cn("flex items-center", className)} {...props} />;
}

export function InputOTPSlot({
  index,
  className,
  ...props
}: ComponentProps<"div"> & { index: number }) {
  const context = useContext(OTPInputContext);
  const slot = context?.slots[index];
  const char = slot?.char;
  const hasFakeCaret = slot?.hasFakeCaret;
  const isActive = slot?.isActive;

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex h-12 w-11 items-center justify-center border-y border-r border-input text-lg font-semibold text-foreground shadow-sm transition-all outline-none",
        "first:rounded-l-lg first:border-l last:rounded-r-lg",
        "data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring/40",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink h-6 w-px bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
}

export function InputOTPSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" className={cn(className)} {...props}>
      <Minus className="size-4 text-muted-foreground" />
    </div>
  );
}
