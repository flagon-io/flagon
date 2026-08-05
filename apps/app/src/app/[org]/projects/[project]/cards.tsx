import Link from "next/link";

/**
 * Presentational card shells for the project overview, shared by the server
 * cards (the relationship graph) and the client editable cards. No hooks, so
 * they compose into either a server or a client component.
 */
export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-white/10 bg-white/2 ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

export function CardHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-13 items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
      <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
      {action}
    </div>
  );
}

export function EmptyPrompt({
  text,
  action,
}: {
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-zinc-500">{text}</p>
      {action ? (
        <Link
          href={action.href}
          className="shrink-0 text-sm text-teal-400 hover:text-teal-300"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
