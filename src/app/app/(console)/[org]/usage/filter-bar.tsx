"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

/**
 * The usage filter controls.
 *
 * Every control writes the URL and nothing else: the page is a server
 * component that reads those same parameters, and the REST endpoint parses
 * them with the same parser (src/lib/usage-params.ts). So a filtered view is
 * a shareable link, the back button works, and "what does the API call for
 * this screen look like" has a literal answer - the query string.
 *
 * The dropdowns are custom rather than native <select> for two reasons: a
 * native select renders its options as an OS popup that ignores the app's
 * dark theme entirely, and it cannot express "several products at once",
 * which is the filter people actually reach for.
 */
export type FilterOption = { value: string; label: string };

/** Shared URL writer: one place that knows how the query string is shaped. */
function useQueryWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (changes: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        params.delete(key);
        // An empty selection is the "all" case: absent from the URL rather
        // than empty, so the default view has a clean, linkable address.
        if (value === null || value === "") continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item) params.append(key, item);
        }
      }
      const query = params.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  return { update, pending };
}

/** Closes the panel on an outside click or Escape, and restores focus. */
function useDismiss(
  open: boolean,
  close: () => void,
  root: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, root]);
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="ml-2 h-3 w-3 shrink-0 text-zinc-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
        checked ? "border-teal-500 bg-teal-500" : "border-white/20"
      }`}
    >
      {checked ? (
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5 text-zinc-950"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * One dropdown. `multiple` turns it into a checklist whose empty state means
 * "everything", which is what makes "All products" and "2 products" the same
 * control rather than two.
 */
function FilterSelect({
  label,
  allLabel,
  noun,
  options,
  selected,
  multiple,
  onChange,
}: {
  label: string;
  /** Shown when nothing is selected: "All products". */
  allLabel: string;
  /** Pluralised in the summary: "3 projects". */
  noun?: string;
  options: FilterOption[];
  selected: string[];
  multiple?: boolean;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const id = useId();
  useDismiss(open, close, root);

  const chosen = options.filter((option) => selected.includes(option.value));
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen.length} ${noun ?? "selected"}`;

  const toggle = (value: string) => {
    if (!multiple) {
      onChange(value ? [value] : []);
      close();
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between border px-3 py-2 text-sm transition ${
          open
            ? "border-teal-500/60 bg-white/5 text-zinc-100"
            : "border-white/10 bg-white/2 text-zinc-200 hover:border-white/20"
        }`}
      >
        <span className="truncate">
          <span className="sr-only">{label}: </span>
          {summary}
        </span>
        <Chevron />
      </button>

      {open ? (
        <div
          id={id}
          role="listbox"
          aria-label={label}
          aria-multiselectable={multiple}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-max min-w-full overflow-y-auto border border-white/10 bg-zinc-950 py-1 shadow-xl shadow-black/50"
        >
          <button
            type="button"
            role="option"
            aria-selected={selected.length === 0}
            onClick={() => {
              onChange([]);
              if (!multiple) close();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5"
          >
            {multiple ? <Check checked={selected.length === 0} /> : null}
            <span className="truncate">{allLabel}</span>
          </button>

          {options.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => toggle(option.value)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
                  active ? "text-zinc-100" : "text-zinc-300"
                }`}
              >
                {multiple ? <Check checked={active} /> : null}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function UsageFilterBar({
  periods,
  products,
  projects,
  meters,
  current,
}: {
  periods: FilterOption[];
  products: FilterOption[];
  projects: FilterOption[];
  meters: FilterOption[];
  current: {
    period: string;
    products: string[];
    projects: string[];
    meters: string[];
    groupBy: string;
  };
}) {
  const { update, pending } = useQueryWriter();

  return (
    <div
      className={`grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:flex xl:flex-nowrap ${
        pending ? "opacity-60" : ""
      }`}
    >
      <div className="xl:w-56">
        <FilterSelect
          label="Billing period"
          allLabel={periods[0]?.label ?? "Current billing period"}
          options={periods.slice(1)}
          selected={current.period ? [current.period] : []}
          onChange={(values) => update({ period: values[0] ?? null })}
        />
      </div>
      <div className="xl:w-44">
        <FilterSelect
          label="Product"
          allLabel="All products"
          noun="products"
          multiple
          options={products}
          selected={current.products}
          // Meters belong to products, so narrowing the product invalidates
          // any meter filter underneath it.
          onChange={(values) => update({ product: values, meter: null })}
        />
      </div>
      <div className="xl:w-44">
        <FilterSelect
          label="Project"
          allLabel="All projects"
          noun="projects"
          multiple
          options={projects}
          selected={current.projects}
          onChange={(values) => update({ project: values })}
        />
      </div>
      {meters.length > 1 ? (
        <div className="xl:w-44">
          <FilterSelect
            label="Meter"
            allLabel="All meters"
            noun="meters"
            multiple
            options={meters}
            selected={current.meters}
            onChange={(values) => update({ meter: values })}
          />
        </div>
      ) : null}
      <div className="xl:w-40">
        <FilterSelect
          label="Group by"
          allLabel="By product"
          options={[
            { value: "product", label: "By product" },
            { value: "project", label: "By project" },
            { value: "meter", label: "By meter" },
          ]}
          selected={current.groupBy === "product" ? [] : [current.groupBy]}
          onChange={(values) => update({ group_by: values[0] ?? null })}
        />
      </div>
    </div>
  );
}

/**
 * Granularity and cumulative live in the chart's own header rather than the
 * filter row: they change how the chart is DRAWN, not which usage is counted,
 * and putting them beside the filters implied they narrowed the data too.
 */
export function ChartControls({
  granularity,
  cumulative,
}: {
  granularity: string;
  cumulative: boolean;
}) {
  const { update } = useQueryWriter();

  return (
    <div className="flex items-center gap-3">
      <div className="flex border border-white/10">
        {[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={granularity === option.value}
            onClick={() =>
              update({
                granularity: option.value === "daily" ? null : option.value,
              })
            }
            className={`px-3 py-1.5 text-xs transition ${
              granularity === option.value
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={cumulative}
          onChange={(event) =>
            update({ cumulative: event.target.checked ? "1" : null })
          }
          className="h-3.5 w-3.5 accent-teal-500"
        />
        Cumulative
      </label>
    </div>
  );
}
