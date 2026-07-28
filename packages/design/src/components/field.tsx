import type { ReactNode } from "react";

/**
 * A labeled form field: a small uppercase-weight label, the control, and an
 * optional hint. Keeps vertical rhythm consistent across every form.
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-400">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
