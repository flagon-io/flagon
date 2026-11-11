"use client";

import { useMemo, useState } from "react";
import {
  ROLES,
  LEVELS,
  STEPS,
  LOCATIONS,
  computeSalary,
  formatUSD,
} from "@/lib/comp";
import { cn } from "@/lib/cn";

type CompCalculatorProps = {
  /** Preselect a role by id (the ids live in ROLES, src/lib/comp.ts). */
  role?: string;
  /** Preselect the level / step / location by id. */
  level?: string;
  step?: string;
  location?: string;
  /**
   * Pin the role and hide its selector, for a single-role context like a job
   * posting: <CompCalculator role="software-engineer" lockRole />.
   */
  lockRole?: boolean;
};

function pick<T extends { id: string }>(list: T[], id: string | undefined, fallback: T): T {
  return (id ? list.find((x) => x.id === id) : undefined) ?? fallback;
}

const DEFAULT_LEVEL = LEVELS.find((l) => l.id === "senior") ?? LEVELS[0];
const DEFAULT_STEP = STEPS.find((s) => s.id === "established") ?? STEPS[0];

/**
 * Interactive compensation calculator. Applies the published formula
 * (benchmark x level x step x location) and shows the base salary plus the range
 * across steps within the level. Every number comes from one file,
 * src/lib/comp.ts (currently illustrative placeholders): change the finances
 * there and every calculator on the site updates at once.
 *
 * Reusable anywhere: drop <CompCalculator /> into any page or MDX file. Pass
 * `role`, `level`, `step`, `location` (ids) to preset it, and `lockRole` to pin
 * the role and hide its selector (e.g. embedded in a job posting).
 */
export function CompCalculator({
  role: roleProp,
  level: levelProp,
  step: stepProp,
  location: locationProp,
  lockRole = false,
}: CompCalculatorProps = {}) {
  const [roleId, setRoleId] = useState(pick(ROLES, roleProp, ROLES[0]).id);
  const [levelId, setLevelId] = useState(pick(LEVELS, levelProp, DEFAULT_LEVEL).id);
  const [stepId, setStepId] = useState(pick(STEPS, stepProp, DEFAULT_STEP).id);
  const [locationId, setLocationId] = useState(pick(LOCATIONS, locationProp, LOCATIONS[0]).id);

  const { role, level, step, location } = useMemo(
    () => ({
      role: pick(ROLES, roleId, ROLES[0]),
      level: pick(LEVELS, levelId, DEFAULT_LEVEL),
      step: pick(STEPS, stepId, DEFAULT_STEP),
      location: pick(LOCATIONS, locationId, LOCATIONS[0]),
    }),
    [roleId, levelId, stepId, locationId],
  );

  // Each step is a [min, max] band, so the selected step yields a salary range,
  // and the whole level spans Learning's floor to Expert's ceiling.
  const [stepMin, stepMax] = step.range;
  const selLow = computeSalary(role.benchmark, level.modifier, stepMin, location.factor);
  const selHigh = computeSalary(role.benchmark, level.modifier, stepMax, location.factor);
  const levelLow = computeSalary(role.benchmark, level.modifier, STEPS[0].range[0], location.factor);
  const levelHigh = computeSalary(
    role.benchmark,
    level.modifier,
    STEPS[STEPS.length - 1].range[1],
    location.factor,
  );

  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border border-hairline bg-card">
      {lockRole && (
        <div className="border-b border-hairline px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
            Compensation
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{role.name}</p>
        </div>
      )}
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        {!lockRole && (
          <Selector label="Role" value={roleId} onChange={setRoleId}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Selector>
        )}
        <Selector label="Location" value={locationId} onChange={setLocationId}>
          {LOCATIONS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Selector>
        <Selector label="Level" value={levelId} onChange={setLevelId}>
          {LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Selector>
        <Selector label="Step" value={stepId} onChange={setStepId}>
          {STEPS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Selector>
      </div>

      {/* context line for the two chosen dimensions */}
      <div className="grid gap-px border-y border-hairline bg-hairline sm:grid-cols-2">
        <p className="bg-card p-4 text-sm text-muted-foreground sm:p-5">
          <span className="font-medium text-foreground">{level.name}.</span>{" "}
          {level.blurb}
        </p>
        <p className="bg-card p-4 text-sm text-muted-foreground sm:p-5">
          <span className="font-medium text-foreground">{step.name}.</span>{" "}
          {step.blurb}
        </p>
      </div>

      {/* result */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
            Base salary · {step.name}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {formatUSD(selLow)} <span className="text-subtle">to</span>{" "}
            {formatUSD(selHigh)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {role.name} · {level.name} · {location.name}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-sm">
          <p className="text-muted-foreground">Full range at this level</p>
          <p className="mt-0.5 font-medium">
            {formatUSD(levelLow)} to {formatUSD(levelHigh)}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-brand">
            + equity for everyone
          </p>
        </div>
      </div>

      <p className="border-t border-hairline bg-panel px-5 py-3 text-xs/relaxed text-subtle sm:px-6">
        Benchmarks are anchored to public market data as a starting point while we
        finalize our own bands. Same formula for every role, no negotiation.
      </p>
    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-subtle">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm",
            "outline-none transition focus-visible:ring-2 focus-visible:ring-brand",
          )}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </label>
  );
}
