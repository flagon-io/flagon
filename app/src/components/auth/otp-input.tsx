"use client";

import { useRef, useState } from "react";

interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, onComplete, disabled }: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  function setDigit(index: number, digit: string) {
    const next = [...values];
    next[index] = digit;
    setValues(next);
    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (next.every((v) => v !== "")) {
      onComplete(next.join(""));
    }
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(length).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setValues(next);
    if (pasted.length === length) {
      onComplete(pasted);
    } else {
      inputs.current[pasted.length]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-2">
      {values.map((value, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="h-14 w-12 rounded-lg border border-input bg-background text-center text-lg font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        />
      ))}
    </div>
  );
}
