"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Plus, Search, Users, X } from "lucide-react";
import { Button } from "@/components/form-controls";

/**
 * Project ownership: who is responsible, as a chip list with a search picker.
 *
 * The previous version rendered every team in the organization as a checkbox
 * list, which is only usable while an org has about five teams and stops being
 * a control at all past twenty. Ownership is also a question people answer
 * with a NAME they already have in mind, so search is the natural interaction:
 * type "plat", get the Platform team and Priya, pick one.
 *
 * Owners can be teams or people (drizzle/0026). Both are searched together and
 * kept visually distinct rather than split into two pickers, because the user
 * is looking for "whoever owns this", not for a category.
 */
type Team = { id: string; name: string };
type Person = { id: string; name: string; username: string | null };
type Selection = { kind: "team" | "user"; id: string };

export function OwnershipPanel({
  teams,
  people,
  initial,
  canManage,
  save,
}: {
  teams: Team[];
  people: Person[];
  initial: Selection[];
  canManage: boolean;
  save: (selection: Selection[]) => Promise<{ ok: boolean; message: string }>;
}) {
  const [selected, setSelected] = useState<Selection[]>(initial);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const personById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );

  const isSelected = (kind: Selection["kind"], id: string) =>
    selected.some((item) => item.kind === kind && item.id === id);

  const toggle = (kind: Selection["kind"], id: string) =>
    setSelected((items) =>
      isSelected(kind, id)
        ? items.filter((item) => !(item.kind === kind && item.id === id))
        : [...items, { kind, id }],
    );

  // Close on outside click and on Escape: a picker that traps focus for a
  // two-second decision is worse than the list it replaced.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const matches = (haystack: Array<string | null>) =>
    !needle || haystack.some((value) => value?.toLowerCase().includes(needle));

  const teamResults = teams.filter((team) => matches([team.name]));
  const peopleResults = people.filter((person) =>
    matches([person.name, person.username]),
  );
  const empty = !teamResults.length && !peopleResults.length;

  const dirty =
    selected.length !== initial.length ||
    selected.some(
      (item) =>
        !initial.some((base) => base.kind === item.kind && base.id === item.id),
    );

  const commit = () =>
    start(async () => {
      const result = await save(selected);
      setError(result.ok ? null : result.message);
      if (result.ok) setOpen(false);
    });

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Owned by</h2>
        {canManage ? (
          <div className="relative" ref={containerRef}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-haspopup="dialog"
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add owner
            </Button>

            {open ? (
              <div
                role="dialog"
                aria-label="Add an owner"
                className="absolute right-0 z-50 mt-2 w-72 border border-white/10 bg-[#111113] shadow-2xl shadow-black/60"
              >
                <div className="flex items-center gap-2 border-b border-white/10 px-3">
                  <Search className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search people and teams"
                    aria-label="Search people and teams"
                    className="h-9 w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto p-1">
                  {teamResults.length ? (
                    <Group label="Teams">
                      {teamResults.map((team) => (
                        <Row
                          key={team.id}
                          label={team.name}
                          selected={isSelected("team", team.id)}
                          onClick={() => toggle("team", team.id)}
                          avatar={
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/7">
                              <Users className="h-3 w-3 text-zinc-400" />
                            </span>
                          }
                        />
                      ))}
                    </Group>
                  ) : null}

                  {peopleResults.length ? (
                    <Group label="People">
                      {peopleResults.map((person) => (
                        <Row
                          key={person.id}
                          label={person.name}
                          meta={
                            person.username ? `@${person.username}` : undefined
                          }
                          selected={isSelected("user", person.id)}
                          onClick={() => toggle("user", person.id)}
                          avatar={
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/15 text-[10px] font-semibold text-teal-300">
                              {person.name.slice(0, 1).toUpperCase()}
                            </span>
                          }
                        />
                      ))}
                    </Group>
                  ) : null}

                  {empty ? (
                    <p className="px-3 py-6 text-center text-xs text-zinc-600">
                      {teams.length || people.length
                        ? `Nothing matches "${query}".`
                        : "Invite a member or create a team first."}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-2">
                  <span className="pl-1 text-xs text-zinc-600">
                    {selected.length} selected
                  </span>
                  <Button
                    size="sm"
                    disabled={pending || !dirty}
                    onClick={commit}
                  >
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {selected.map((item) => {
          const team = item.kind === "team" ? teamById.get(item.id) : null;
          const person = item.kind === "user" ? personById.get(item.id) : null;
          const label = team?.name ?? person?.name;
          if (!label) return null;
          return (
            <span
              key={`${item.kind}:${item.id}`}
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-2 pr-1 text-xs font-medium text-zinc-300"
            >
              {team ? (
                <Users className="h-3 w-3 text-zinc-500" aria-hidden />
              ) : (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-teal-500/15 text-[9px] font-semibold text-teal-300">
                  {label.slice(0, 1).toUpperCase()}
                </span>
              )}
              {label}
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => {
                    toggle(item.kind, item.id);
                    // Removing from the chip list is a decision in itself, so
                    // it saves immediately rather than waiting for a picker
                    // the user never opened.
                    start(async () => {
                      const next = selected.filter(
                        (entry) =>
                          !(entry.kind === item.kind && entry.id === item.id),
                      );
                      const result = await save(next);
                      setError(result.ok ? null : result.message);
                    });
                  }}
                  className="rounded-full p-0.5 text-zinc-600 transition hover:bg-white/10 hover:text-zinc-200"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          );
        })}

        {!selected.length ? (
          <span className="text-xs text-zinc-600">No owner assigned.</span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </section>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  label,
  meta,
  avatar,
  selected,
  onClick,
}: {
  label: string;
  meta?: string;
  avatar: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 transition hover:bg-white/5"
    >
      {avatar}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {meta ? (
          <span className="ml-1.5 text-xs text-zinc-600">{meta}</span>
        ) : null}
      </span>
      {selected ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-teal-400" />
      ) : null}
    </button>
  );
}
