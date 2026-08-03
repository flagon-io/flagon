"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { Button, Select } from "@flagon/design";
import { RELATION_TYPES, labelFor, relationInboundLabel } from "@/lib/catalog";
import type { ProjectRelations } from "@/lib/projects-api";
import { addProjectRelationAction, removeProjectRelationAction } from "../../actions";

const TYPE_OPTIONS = RELATION_TYPES.map((r) => ({ value: r.value, label: r.label }));

/**
 * The project's dependency edges. `outgoing` (this project points at another) are
 * this project's own edges and are add/removable by owner/admin. `incoming`
 * (another points at this) belong to the other project, so they're read-only here.
 */
export function RelationsManager({
  slug,
  projectKey,
  relations,
  targets,
  canManage,
}: {
  slug: string;
  projectKey: string;
  relations: ProjectRelations;
  targets: { key: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addType, setAddType] = useState("depends_on");
  const [addTarget, setAddTarget] = useState("");
  const [adding, startAdd] = useTransition();

  function add() {
    if (!addTarget) return;
    setError(null);
    startAdd(async () => {
      const res = await addProjectRelationAction(slug, projectKey, addType, addTarget);
      if (res.error) return setError(res.error);
      setAddTarget("");
      router.refresh();
    });
  }

  function remove(id: string) {
    setBusy(id);
    setError(null);
    removeProjectRelationAction(slug, projectKey, id).then((res) => {
      setBusy(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Section
        icon={<ArrowUpRight className="size-4" />}
        title="Outgoing"
        subtitle="What this project points at."
      >
        {relations.outgoing.length === 0 ? (
          <Empty text="No outgoing relations." />
        ) : (
          <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
            {relations.outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TypePill label={labelFor(TYPE_OPTIONS, r.type) ?? r.type} />
                  <Link
                    href={`/${slug}/projects/${r.project.key}`}
                    className="truncate text-sm text-zinc-200 hover:text-zinc-100"
                  >
                    {r.project.name}
                  </Link>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => remove(r.id)}
                    className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage && targets.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-white/8 bg-white/2 p-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-400">Relation</span>
              <Select
                ariaLabel="Relation type"
                value={addType}
                onValueChange={setAddType}
                options={TYPE_OPTIONS}
              />
            </div>
            <div className="flex min-w-52 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-400">Project</span>
              <Select
                ariaLabel="Target project"
                value={addTarget}
                onValueChange={setAddTarget}
                placeholder="Choose a project…"
                options={targets.map((t) => ({ value: t.key, label: t.name }))}
              />
            </div>
            <Button variant="secondary" onClick={add} disabled={adding || !addTarget}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        icon={<ArrowDownLeft className="size-4" />}
        title="Incoming"
        subtitle="What points at this project. You can remove these from here too."
      >
        {relations.incoming.length === 0 ? (
          <Empty text="No incoming relations." />
        ) : (
          <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
            {relations.incoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TypePill label={relationInboundLabel(r.type)} />
                  <Link
                    href={`/${slug}/projects/${r.project.key}`}
                    className="truncate text-sm text-zinc-200 hover:text-zinc-100"
                  >
                    {r.project.name}
                  </Link>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => remove(r.id)}
                    className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-200">{title}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function TypePill({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
      {label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-white/8 bg-white/2 px-4 py-6 text-center text-sm text-zinc-500">
      {text}
    </p>
  );
}
