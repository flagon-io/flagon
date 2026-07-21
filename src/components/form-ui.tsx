/**
 * Shared form styling + notices for the app surface (auth pages, settings).
 * Plain class strings and server-safe presentational components; client forms
 * import what they need.
 */
export const inputBaseClass =
  "block w-full box-border rounded-md border border-white/10 bg-white/4 px-3 py-0 text-sm leading-none text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass = `${inputBaseClass} h-9`;

export const labelClass = "block text-sm font-medium text-zinc-300";

export const hintClass = "mt-1.5 text-xs leading-5 text-zinc-500";

export const linkClass =
  "text-teal-400 transition hover:text-teal-300 hover:underline";

export const buttonBaseClass =
  "inline-flex cursor-pointer items-center justify-center rounded-md px-3 py-0 text-sm transition disabled:cursor-not-allowed";
export const buttonClass = `${buttonBaseClass} ml-auto h-9 bg-teal-500 font-semibold text-zinc-950 hover:bg-teal-400 disabled:opacity-60`;

/**
 * The header pill: the one control that sits in a top bar on any surface.
 *
 * Shared so the marketing header's "Dashboard" and the console header's
 * "Return to site" are literally the same button. They are the same idea
 * pointing in opposite directions, and when they were styled separately the
 * console one drifted into a squared-off control that read as secondary
 * chrome rather than as the way out.
 */
export const headerPillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/5 hover:text-white";

export const subtleButtonClass = `${buttonBaseClass} h-9 border border-white/10 text-zinc-300 hover:border-white/20 hover:text-zinc-100 disabled:opacity-50`;

export const dangerButtonClass = `${buttonBaseClass} h-9 border border-red-500/40 font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50`;

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
