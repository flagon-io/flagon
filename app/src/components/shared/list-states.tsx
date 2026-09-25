"use client";

// Shared chrome for the paginated member/access lists (org members, team members,
// project collaborators/teams/owners): the bordered shell, the loading skeleton,
// and the error state shown when a list fails to load (never "no items").
import type { ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from "@flagon-io/ui";

export function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-hairline">{children}</div>;
}

export function ListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <TableShell>
      <div className="divide-y divide-hairline">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </TableShell>
  );
}

/** A list that failed to load: the real reason plus a retry, never an empty list. */
export function ListError({
  title = "Couldn't load this list",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive" icon={<AlertCircle />}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRetry && (
        <div className="pt-1">
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="size-4" />
            Try again
          </Button>
        </div>
      )}
    </Alert>
  );
}
