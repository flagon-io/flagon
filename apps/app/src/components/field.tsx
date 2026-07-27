import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Shared input styling for the auth forms, so login, signup, and password
 * reset stay pixel-identical and only one place changes when the look does.
 * The `disabled:` variants matter: signup renders disabled until registration
 * opens.
 */
export const inputClass =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

export const submitButtonClass =
  "mt-1 h-10.5 rounded-md bg-teal-500 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-teal-500";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Optional content aligned to the right of the label, e.g. a "Forgot password?" link. */
  aside?: ReactNode;
};

/** A labeled text input. `id` doubles as the label target and the input id. */
export function Field({ id, label, aside, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-zinc-400">
          {label}
        </label>
        {aside}
      </div>
      <input id={id} className={inputClass} {...props} />
    </div>
  );
}
