"use client";

import { useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@flagon-io/ui";

/**
 * Convenience wrapper over the design-system InputOTP: renders a centered
 * `length`-digit code field and fires onComplete when it's full. Existing call
 * sites keep the simple onComplete API while getting the shared component.
 */
export function OtpInput({
  length = 6,
  onComplete,
  disabled,
}: {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <InputOTP
      maxLength={length}
      value={value}
      disabled={disabled}
      onChange={setValue}
      onComplete={onComplete}
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length }).map((_, i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
