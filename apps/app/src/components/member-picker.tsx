"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@flagon/design";
import { MemberAvatar } from "./member-avatar";

type Option = {
  userId: string;
  name: string;
  email: string;
  username: string | null;
};

/**
 * A GitHub-style search-to-add: a primary trigger opens a popover with a search
 * field and a filtered, scrollable list of people. Picking a row fires `onPick`,
 * clears the query, and closes the panel. Disable (never hide) the trigger with a
 * `disabledReason` tooltip when the caller cannot add members.
 */
export function MemberPicker({
  options,
  onPick,
  disabled = false,
  triggerLabel = "Add a member",
  disabledReason,
}: {
  options: Option[];
  onPick: (userId: string) => void;
  disabled?: boolean;
  triggerLabel?: string;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = options
    .filter((o) => {
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q) ||
        (o.username ? `@${o.username}`.toLowerCase().includes(q) : false)
      );
    })
    .slice(0, 50);

  function pick(userId: string) {
    onPick(userId);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="primary"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <Plus className="size-4" /> {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-white/8 p-2">
          <div className="flex items-center gap-2 rounded-md border border-white/8 bg-white/2 px-2.5 transition-colors focus-within:border-teal-500/50 focus-within:ring-2 focus-within:ring-teal-500/20">
            <Search className="size-3.5 shrink-0 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username, or email"
              className="w-full bg-transparent py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No matches.
            </p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.userId}
                type="button"
                onClick={() => pick(o.userId)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
              >
                <MemberAvatar name={o.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-100">
                    {o.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {o.username ? `@${o.username}` : o.email}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
