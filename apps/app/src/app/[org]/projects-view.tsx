"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  GitBranch,
  LayoutGrid,
  List,
  Plus,
  Search,
  Users,
} from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SegmentedControl,
  Select,
  Textarea,
} from "@flagon/design";
import { createProjectAction } from "./projects/actions";
import { FRAMEWORKS, LIFECYCLES, TIERS, labelFor } from "@/lib/catalog";
import { FrameworkIcon, ProjectIcon } from "@/components/framework-badge";
import type { Project } from "@/lib/projects-api";
import type { Entitlement } from "@/lib/flags-api";
import { compact, usd } from "./usage/format";

type TeamOption = { key: string; name: string };

/** Prepend a "None" sentinel to an optional single-select's options. */
function withNone(options: { value: string; label: string }[], noneLabel = "None") {
  return [{ value: NONE, label: `— ${noneLabel} —` }, ...options];
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const NONE = "__none__";
type View = "grid" | "list";

export function ProjectsView({
  slug,
  projects,
  canCreate,
  entitlement,
  plan,
  teams,
}: {
  slug: string;
  projects: Project[];
  canCreate: boolean;
  entitlement: Entitlement | null;
  plan: string;
  teams: TeamOption[];
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, query]);

  return (
    <div className="flex flex-col gap-6">
      {projects.length === 0 ? (
        <EmptyState slug={slug} canCreate={canCreate} onNew={() => setOpen(true)} />
      ) : (
        <>
          {/* Top bar: search · view toggle · new */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="pl-9"
              />
            </div>
            <SegmentedControl
              ariaLabel="View"
              sizing="content"
              value={view}
              onValueChange={(v) => setView(v as View)}
              options={[
                { value: "grid", label: <LayoutGrid className="size-4" />, title: "Grid view" },
                { value: "list", label: <List className="size-4" />, title: "List view" },
              ]}
            />
            {canCreate ? (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus className="size-4" /> New Project
              </Button>
            ) : null}
          </div>

          {/* Body: usage sidebar + projects */}
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="order-2 flex flex-col gap-6 lg:order-1">
              <UsagePanel slug={slug} entitlement={entitlement} plan={plan} />
            </aside>

            <div className="order-1 min-w-0 lg:order-2">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center text-sm text-zinc-500">
                  No projects match &ldquo;{query.trim()}&rdquo;.
                </div>
              ) : view === "grid" ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((p) => (
                    <ProjectCard key={p.key} slug={slug} project={p} />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  {filtered.map((p, i) => (
                    <ProjectRow key={p.key} slug={slug} project={p} first={i === 0} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {open ? (
        <NewProjectModal slug={slug} teams={teams} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

/** A muted pill for a project's lifecycle, matching the tag chip style. */
function LifecyclePill({ value }: { value: string }) {
  return (
    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
      {labelFor(LIFECYCLES, value)}
    </span>
  );
}

function OwnerLine({ project }: { project: Project }) {
  return project.ownerTeam ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Users className="size-3.5 shrink-0" />
      <span className="truncate">{project.ownerTeam.name}</span>
    </span>
  ) : (
    <span className="text-zinc-600">No owner</span>
  );
}

function ProjectCard({ slug, project: p }: { slug: string; project: Project }) {
  return (
    <Link
      href={`/${slug}/projects/${p.key}`}
      className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4 transition-colors hover:border-white/20 hover:bg-white/4"
    >
      <div className="flex items-start gap-3">
        <ProjectIcon image={p.image} framework={p.framework} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
          <p className="truncate font-mono text-xs text-zinc-500">{p.key}</p>
        </div>
        {p.lifecycle ? <LifecyclePill value={p.lifecycle} /> : null}
      </div>

      <p className="line-clamp-2 min-h-10 text-sm text-zinc-400">
        {p.description || <span className="text-zinc-600">No description yet.</span>}
      </p>

      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
        <OwnerLine project={p} />
        <span className="shrink-0">{relativeTime(p.createdAt)}</span>
      </div>
    </Link>
  );
}

function ProjectRow({
  slug,
  project: p,
  first,
}: {
  slug: string;
  project: Project;
  first: boolean;
}) {
  return (
    <Link
      href={`/${slug}/projects/${p.key}`}
      className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/3 ${
        first ? "" : "border-t border-white/8"
      }`}
    >
      <ProjectIcon image={p.image} framework={p.framework} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
        <p className="truncate font-mono text-xs text-zinc-500">{p.key}</p>
      </div>
      {p.lifecycle ? <LifecyclePill value={p.lifecycle} /> : null}
      <span className="hidden min-w-0 items-center gap-1.5 text-xs text-zinc-500 sm:inline-flex">
        <OwnerLine project={p} />
      </span>
      <span className="shrink-0 text-xs text-zinc-600">{relativeTime(p.createdAt)}</span>
    </Link>
  );
}

/**
 * The usage-overview sidebar. Mirrors the /usage page's credit/events bars in a
 * compact form, off the same Entitlement (the CURRENT month). Pro draws down a
 * $50 credit; Hobby burns a free-events ceiling. No invented numbers.
 */
function UsagePanel({
  slug,
  entitlement,
  plan,
}: {
  slug: string;
  entitlement: Entitlement | null;
  plan: string;
}) {
  // Days left in the current calendar-month cycle (the credit resets monthly).
  const daysLeft = useMemo(() => {
    const now = new Date();
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
  }, []);

  const stats: { label: string; value: string }[] = [];
  if (entitlement) {
    stats.push({ label: "Exposures", value: compact(entitlement.usedEvents) });
    if (entitlement.creditCents > 0) {
      stats.push({ label: "Overage", value: usd(entitlement.overageCents) });
    } else if (entitlement.remainingEvents !== null) {
      stats.push({ label: "Remaining", value: compact(entitlement.remainingEvents) });
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Usage</p>
          <p className="mt-1 text-sm text-zinc-300">{daysLeft} days left in cycle</p>
        </div>
        <Link
          href={`/${slug}/usage`}
          className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/8 hover:text-zinc-100"
        >
          Details
        </Link>
      </div>

      {!entitlement ? (
        <p className="text-sm text-zinc-500">Usage is unavailable right now.</p>
      ) : entitlement.creditCents > 0 ? (
        <Meter
          label="Included credit"
          used={usd(entitlement.creditUsedCents)}
          total={usd(entitlement.creditCents)}
          pct={entitlement.creditUsedCents / entitlement.creditCents}
          nonZero={entitlement.creditUsedCents > 0}
          over={entitlement.overageCents > 0}
        />
      ) : entitlement.includedEvents > 0 ? (
        <Meter
          label="Free events"
          used={compact(entitlement.usedEvents)}
          total={compact(entitlement.includedEvents)}
          pct={entitlement.usedEvents / entitlement.includedEvents}
          nonZero={entitlement.usedEvents > 0}
          over={entitlement.isOver}
        />
      ) : null}

      {stats.length > 0 ? (
        <dl
          className={`grid gap-3 border-t border-white/8 pt-4 ${
            stats.length > 1 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-zinc-500">{s.label}</dt>
              <dd className="mt-0.5 text-sm text-zinc-100 tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-xs text-zinc-600">
        {plan === "hobby"
          ? "Flag checks are free; opt-in exposures count toward your monthly limit."
          : "Flag checks are free; you're billed only for opt-in exposures past your credit."}
      </p>
    </section>
  );
}

/** A compact labeled progress meter (credit drawdown or events burn-down). */
function Meter({
  label,
  used,
  total,
  pct,
  nonZero,
  over,
}: {
  label: string;
  used: string;
  total: string;
  pct: number;
  nonZero: boolean;
  over: boolean;
}) {
  const width = Math.max(Math.min(1, pct) * 100, nonZero ? 2 : 0);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-300">{label}</span>
        <span className="text-zinc-400 tabular-nums">
          <span className={over ? "text-amber-400" : "text-zinc-200"}>{used}</span> / {total}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full ${over ? "bg-amber-500" : "bg-[#3987e5]"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  slug,
  canCreate,
  onNew,
}: {
  slug: string;
  canCreate: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your catalog: the projects your org runs, who owns them, and what&apos;s
            built on top.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-white/5 text-zinc-300">
          <Boxes className="size-6" />
        </span>
        <div>
          <p className="text-base font-medium text-zinc-100">
            {canCreate ? "Create your first project" : "No projects yet"}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
            A project is a system you run. Give it a stack, an owning team, and a
            README, then build flags and more on top. This is the foundation your
            catalog grows from.
          </p>
        </div>
        {canCreate ? (
          <div className="flex flex-col items-center gap-2">
            <Button variant="primary" onClick={onNew}>
              <Plus className="size-4" /> New Project
            </Button>
            <Link
              href={`/${slug}/teams`}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <Users className="size-3.5" /> Or set up a team to own it first
            </Link>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">An owner or admin can create the first one.</p>
        )}
      </div>
    </div>
  );
}

/** A small "Soon" badge for features that are telegraphed but not yet live. */
function SoonBadge() {
  return (
    <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-300 uppercase">
      Soon
    </span>
  );
}

/**
 * The repository link: telegraphs the coming "link a repository" flow — pick an
 * org/repo the way Vercel does, auto-detect the stack, and later import settings
 * from a flagon.yml. Disabled today, and framed as a LINK you attach: you still
 * name and configure the project below whether or not a repo is linked.
 */
function RepositoryLink() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
          <GitBranch className="size-4 text-zinc-500" /> Link a Git repository
        </span>
        <SoonBadge />
      </div>
      <button
        type="button"
        disabled
        aria-label="Select a repository (coming soon)"
        className="mt-2.5 flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-500 opacity-60"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <GitBranch className="size-4 shrink-0" />
          <span className="truncate">Select an organization and repository</span>
        </span>
        <ChevronDown className="size-4 shrink-0" />
      </button>
      <p className="mt-1.5 text-xs text-zinc-500">
        Auto-detects the stack and can import settings from a{" "}
        <span className="font-mono text-zinc-400">flagon.yml</span>. You&apos;ll still
        name it below.
      </p>
    </div>
  );
}

function NewProjectModal({
  slug,
  teams,
  onClose,
}: {
  slug: string;
  teams: TeamOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [framework, setFramework] = useState(NONE);
  const [ownerTeam, setOwnerTeam] = useState(NONE);
  const [lifecycle, setLifecycle] = useState(NONE);
  const [tier, setTier] = useState(NONE);
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onNameChange(v: string) {
    setName(v);
    // Convenience only: seed the slug from the name until the user edits it.
    if (!keyEdited) setKey(slugify(v));
  }

  function create() {
    setError(null);
    if (!name.trim()) return setError("Give the project a name.");
    const parsedTags = Array.from(
      new Set(tags.split(",").map((t) => t.trim()).filter(Boolean)),
    );
    start(async () => {
      const res = await createProjectAction(slug, {
        name: name.trim(),
        key: key.trim() || slugify(name),
        // Omit (not null) when unset — the create endpoint's fields are optional.
        description: description.trim() || undefined,
        framework: framework === NONE ? undefined : framework,
        ownerTeamKey: ownerTeam === NONE ? undefined : ownerTeam,
        lifecycle: lifecycle === NONE ? undefined : lifecycle,
        tier: tier === NONE ? undefined : tier,
        tags: parsedTags.length ? parsedTags : undefined,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/projects/${res.key}`);
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="New Project"
        description="Link a repository or set one up by hand, then add the catalog details."
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-4">
        <RepositoryLink />

        <Field label="Project name">
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Payments API"
            autoFocus
          />
        </Field>

        <Field label="Slug" hint="Used in the project's URL.">
          <Input
            value={key}
            onChange={(e) => {
              setKeyEdited(true);
              setKey(slugify(e.target.value));
            }}
            placeholder="payments-api"
            className="font-mono"
          />
        </Field>

        <Field label="Stack" hint="Optional. What this project is built on.">
          <div className="flex items-center gap-3">
            <FrameworkIcon framework={framework === NONE ? null : framework} size="md" />
            <Select
              ariaLabel="Stack"
              value={framework}
              onValueChange={setFramework}
              className="flex-1"
              options={withNone(
                FRAMEWORKS.map((f) => ({ value: f.value, label: f.label })),
                "No stack",
              )}
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owning team" hint="Who's responsible.">
            <Select
              ariaLabel="Owning team"
              value={ownerTeam}
              onValueChange={setOwnerTeam}
              className="w-full"
              options={withNone(
                teams.map((t) => ({ value: t.key, label: t.name })),
                "No owner",
              )}
            />
          </Field>
          <Field label="Lifecycle">
            <Select
              ariaLabel="Lifecycle"
              value={lifecycle}
              onValueChange={setLifecycle}
              className="w-full"
              options={withNone(LIFECYCLES)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tier">
            <Select
              ariaLabel="Tier"
              value={tier}
              onValueChange={setTier}
              className="w-full"
              options={withNone(TIERS)}
            />
          </Field>
          <Field label="Tags" hint="Comma-separated.">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="payments, go, pci"
            />
          </Field>
        </div>

        <Field label="Description" hint="Optional. A short summary of what it does.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this project is."
          />
        </Field>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create Project"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
