/**
 * Shared form styling + notices for the app surface (auth pages, settings).
 * Plain class strings and server-safe presentational components; client forms
 * import what they need.
 */
export const inputClass =
  "mt-1 block w-full rounded-md border border-white/10 bg-white/4 px-3 py-1.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

export const labelClass = "block text-sm font-medium text-zinc-300";

export const hintClass = "mt-1.5 text-xs leading-5 text-zinc-500";

export const linkClass =
  "text-teal-400 transition hover:text-teal-300 hover:underline";

export const buttonClass =
  "rounded-md bg-teal-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400 disabled:cursor-default disabled:opacity-60";

export const subtleButtonClass =
  "rounded-md border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-white/20 hover:text-zinc-100 disabled:cursor-default disabled:opacity-50";

export const dangerButtonClass =
  "rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-default disabled:opacity-50";

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    error: "border-red-500/30 bg-red-500/10 text-red-300",
    success: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    info: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
