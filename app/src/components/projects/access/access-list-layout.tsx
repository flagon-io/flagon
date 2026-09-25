"use client";

// Shared chrome for the project access managers (collaborators, teams, owners):
// heading, notices, the count + primary "Add" action, the loading / error /
// empty / table states, "Load more", the per-row actions menu, the principal
// cell, and the add dialog. Each manager supplies only its copy, its columns,
// and its add-dialog fields.
import type { ComponentType, FormEvent, ReactNode } from "react";
import Link from "next/link";
import { Info, MoreHorizontal, UsersRound } from "lucide-react";
import {
  Alert,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Skeleton,
} from "@flagon-io/ui";
import { ListError, TableShell } from "@/components/shared/list-states";
import { initials } from "@/lib/initials";
import type { AccessList } from "./use-access-list";

type Icon = ComponentType<{ className?: string }>;

export function AccessListLayout<T>({
  title,
  description,
  notice,
  spacing = "space-y-4",
  error,
  list,
  summary,
  canManage,
  addLabel,
  addIcon: AddIcon,
  onAdd,
  skeleton,
  empty,
  errorTitle,
  children,
  dialog,
}: {
  title: string;
  description: ReactNode;
  /** An informational note under the heading. */
  notice?: ReactNode;
  spacing?: "space-y-4" | "space-y-5";
  /** A failed mutation (add/change/remove). */
  error: string | null;
  list: AccessList<T>;
  /** The count line: shown while loading, and for a loaded list of `n` rows. */
  summary: { loading: string; count: (n: number) => string };
  canManage: boolean;
  addLabel: string;
  addIcon: Icon;
  onAdd: () => void;
  skeleton: { avatar: "circle" | "square"; trailing: "select" | "badge" };
  empty: { icon: Icon; title: string; body: ReactNode };
  errorTitle: string;
  /** The populated table. */
  children: ReactNode;
  dialog: ReactNode;
}) {
  const addButton = (className?: string) => (
    <Button size="sm" className={className} onClick={onAdd}>
      <AddIcon className="size-4" />
      {addLabel}
    </Button>
  );
  const EmptyIcon = empty.icon;

  return (
    <div className={spacing}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {notice && (
        <Alert className="flex items-start gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{notice}</span>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {list.loading ? summary.loading : list.loadError ? null : summary.count(list.items.length)}
        </p>
        {canManage && addButton()}
      </div>

      {list.loading ? (
        <AccessSkeleton {...skeleton} />
      ) : list.loadError ? (
        <ListError title={errorTitle} message={list.loadError} onRetry={() => void list.reload()} />
      ) : list.items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <EmptyIcon className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">{empty.title}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{empty.body}</p>
          {canManage && addButton("mt-1")}
        </Card>
      ) : (
        <TableShell>{children}</TableShell>
      )}

      {!list.loading && !list.loadError && (
        <LoadMore
          next={list.next}
          loading={list.loadingMore}
          error={list.moreError}
          onLoadMore={() => void list.loadMore()}
        />
      )}

      {dialog}
    </div>
  );
}

function AccessSkeleton({
  avatar,
  trailing,
}: {
  avatar: "circle" | "square";
  trailing: "select" | "badge";
}) {
  return (
    <TableShell>
      <div className="divide-y divide-hairline">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className={avatar === "circle" ? "size-9 rounded-full" : "size-9 rounded-md"} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className={trailing === "select" ? "h-8 w-28 rounded-md" : "h-6 w-14 rounded-full"} />
          </div>
        ))}
      </div>
    </TableShell>
  );
}

/** "Load more" for a keyset-paginated list, with an inline error on failure. */
export function LoadMore({
  next,
  loading,
  error,
  onLoadMore,
}: {
  next: string | null;
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
}) {
  if (!next) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      {error && <ListError title="Couldn't load more" message={error} />}
      <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
        {loading ? "Loading..." : error ? "Try again" : "Load more"}
      </Button>
    </div>
  );
}

/** The kebab menu at the end of a row. */
export function RowActions({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A person or team: avatar (or team glyph), name (optionally linked), and a subline. */
export function PrincipalCell({
  kind,
  name,
  sub,
  avatarUrl,
  href,
  suffix,
}: {
  kind: "user" | "team";
  name: string;
  sub?: string | null;
  avatarUrl?: string | null;
  href?: string;
  suffix?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {kind === "team" ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <UsersRound className="size-4" />
        </span>
      ) : (
        <Avatar className="size-9 ring-1 ring-hairline">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-xs font-medium">{initials({ name })}</AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="truncate text-sm font-medium text-foreground hover:underline">
            {name}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium text-foreground">
            {name}
            {suffix}
          </p>
        )}
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** The add dialog: title, description, the caller's fields, error, and actions. */
export function AccessAddDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  error,
  submitting,
  canSubmit,
  submitLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  onSubmit: () => void;
  error: string | null;
  submitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1.5">{description}</DialogDescription>
          </div>

          {children}

          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Adding..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Need a new team? Create one." under a team picker. */
export function CreateTeamHint({ slug }: { slug: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Need a new team?{" "}
      <Link href={`/${slug}/teams/new`} className="font-medium underline">
        Create one
      </Link>
      .
    </p>
  );
}
