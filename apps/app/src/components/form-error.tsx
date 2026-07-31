import type { ReactNode } from "react";

/**
 * The shared inline error banner for auth forms. Red, quiet, and announced to
 * assistive tech via role="alert". Mirrors the amber "notice" styling used for
 * neutral messages so the forms stay visually consistent.
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-xs/5 text-red-300"
    >
      {children}
    </p>
  );
}

/** The neutral (non-error) counterpart, for success and informational notices. */
export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border border-teal-500/25 bg-teal-500/5 px-3 py-2.5 text-xs/5 text-teal-200"
    >
      {children}
    </p>
  );
}
