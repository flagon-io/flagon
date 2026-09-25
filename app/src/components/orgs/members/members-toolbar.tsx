"use client";

import { useEffect, useRef } from "react";
import { ArrowUpDown, Plus, Search } from "lucide-react";
import {
  Button,
  Input,
  Kbd,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flagon-io/ui";

export type MemberSort = "joined" | "name" | "role";

/** Search box ("/" focuses it), role filter, sort, and the invite action. */
export function MembersToolbar({
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  sort,
  onSortChange,
  onInvite,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  sort: MemberSort;
  onSortChange: (sort: MemberSort) => void;
  onInvite?: () => void;
}) {
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      filterRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={filterRef}
          size="sm"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter members..."
          aria-label="Filter members"
          className="pr-10 pl-9"
        />
        <Kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">/</Kbd>
      </div>
      <Select value={roleFilter} onValueChange={onRoleFilterChange}>
        <SelectTrigger size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          <SelectItem value="owner">Owner</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="member">Member</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={(v) => onSortChange(v as MemberSort)}>
        <SelectTrigger size="sm" className="w-36">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="joined">Newest</SelectItem>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="role">Role</SelectItem>
        </SelectContent>
      </Select>
      {onInvite && (
        <Button size="sm" onClick={onInvite}>
          <Plus className="size-4" />
          Invite people
        </Button>
      )}
    </div>
  );
}
