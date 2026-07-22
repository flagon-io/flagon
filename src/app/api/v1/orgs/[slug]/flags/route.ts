import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { createFlag, listFlags, serializeFlag } from "@/lib/flags.server";
import { flagUsageSummary, orgEmitsExposures } from "@/lib/flag-usage.server";
import { assessFlag, checksPerHour, passRate } from "@/lib/flag-metrics";
import type { FlagType } from "@/lib/flags";
import { resolveFlagOrg } from "./context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:read");
  if ("error" in context) return context.error;

  const [flags, usage, emitsExposures] = await Promise.all([
    listFlags(context.org.id),
    flagUsageSummary(context.org.id),
    orgEmitsExposures(context.org.id),
  ]);
  const now = new Date();

  // Usage rides alongside the flag definition: staleness and check volume are
  // exactly what a client cleaning up flags or building a dashboard needs, and
  // shipping them here keeps this endpoint the console's list, in JSON.
  return apiJson(
    flags.map((flag) => {
      const flagUsage = usage.get(flag.key);
      const lastCheckedAt = flagUsage?.lastCheckedAt ?? null;
      const assessment = assessFlag(flag, {
        now,
        // Staleness uses real app access (exposures), not billed evaluations.
        lastCheckedAt: flagUsage?.exposedLastAt
          ? new Date(flagUsage.exposedLastAt)
          : null,
        orgEmitsExposures: emitsExposures,
      });
      return {
        ...serializeFlag(flag),
        stale: assessment.stale,
        stale_reasons: assessment.reasons,
        // Billed evaluations (bulk + single-flag), reconciling with the invoice.
        checks_per_hour: flagUsage ? checksPerHour(flagUsage.series, now) : 0,
        pass_rate: flagUsage
          ? passRate(flagUsage.byVariant, flag.type as FlagType)
          : null,
        last_checked_at: lastCheckedAt,
        // Client-hook app reads (real usage); null-ish until the hook is adopted.
        exposures_30d: flagUsage?.exposedChecks ?? 0,
        last_exposed_at: flagUsage?.exposedLastAt ?? null,
      };
    }),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:write");
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null);
  // `name` is optional: createFlag names the flag after its key when it is
  // omitted, which is what the console relies on since its create form asks
  // for the key alone.
  if (!body || typeof body.key !== "string") {
    return apiError(400, "invalid_flag", "Provide a key.");
  }
  const result = await createFlag(context.org.id, {
    key: body.key,
    name: typeof body.name === "string" ? body.name : undefined,
    description:
      typeof body.description === "string" ? body.description : undefined,
    type: typeof body.type === "string" ? body.type : undefined,
    variants: Array.isArray(body.variants) ? body.variants : undefined,
    defaultVariant:
      typeof body.default_variant === "string"
        ? body.default_variant
        : undefined,
    rules: Array.isArray(body.rules) ? body.rules : undefined,
  });
  if (!result.ok)
    return apiError(
      result.code === "key_taken" ? 409 : 400,
      result.code,
      result.error,
    );
  return apiJson(serializeFlag(result.flag), { status: 201 });
}
