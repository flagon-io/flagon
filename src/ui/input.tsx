"use client";

import { forwardRef } from "react";

/**
 * Text input with optional prepend/append addons, e.g.
 *
 *   <Input prepend="app.flagon.io/" ... />   -> [ app.flagon.io/ | value  ]
 *   <Input append=".flagon.io" ... />        -> [ value | .flagon.io      ]
 *
 * Addons are visually part of the field (shared border, focus ring on the
 * whole group) but not part of the value.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  prepend?: React.ReactNode;
  append?: React.ReactNode;
};

const addonClass =
  "flex select-none items-center border-white/10 bg-white/5 px-3 text-sm text-zinc-500";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prepend, append, className = "", ...props },
  ref,
) {
  const bare =
    "w-full min-w-0 flex-1 bg-transparent px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50";

  if (!prepend && !append) {
    return (
      <input
        ref={ref}
        className={`mt-1 block w-full rounded-md border border-white/10 bg-white/4 px-3 py-1.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }

  return (
    <div
      className={`mt-1 flex w-full items-stretch overflow-hidden rounded-md border border-white/10 bg-white/4 transition focus-within:border-teal-500/60 focus-within:ring-2 focus-within:ring-teal-500/20 ${className}`}
    >
      {prepend ? (
        <span className={`${addonClass} border-r`}>{prepend}</span>
      ) : null}
      <input ref={ref} className={bare} {...props} />
      {append ? (
        <span className={`${addonClass} border-l`}>{append}</span>
      ) : null}
    </div>
  );
});
