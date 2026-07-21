import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/form-controls";
import { appPath } from "@/lib/urls";
import { brand } from "@/lib/brand";
import { listFlags } from "@/lib/flags.server";
import { listClientTokens, serializeClientToken } from "@/lib/client-tokens.server";
import { resolveOrg } from "../resolve-org";
import { createFlagAction, setDefaultVariantAction } from "./actions";
import { CreateFlagModal } from "./create-flag-modal";
import { CredentialsPanel } from "./credentials-panel";
export const metadata: Metadata = { title: "Feature Flags" };
export default async function FlagsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params; const org = await resolveOrg(slug); if (!org) notFound();
  const [flags, clientTokens] = await Promise.all([listFlags(org.id), listClientTokens(org.id)]);
  return <div><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">{org.name}</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">Feature Flags</h1><p className="mt-1 text-sm text-zinc-500">Typed organization-wide decisions, evaluated through standard OFREP.</p></div><CreateFlagModal action={createFlagAction.bind(null, slug)} /></div>
    {flags.length ? <ul className="mt-8 divide-y divide-white/5 border border-white/10">{flags.map((flag) => { const current = flag.variants.find((variant) => variant.key === flag.defaultVariant); return <li key={flag.id} className="flex items-center gap-4 px-4 py-3.5"><Flag className="h-4 w-4 text-zinc-500" /><Link href={appPath(`/${slug}/flags/${flag.key}`)} className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-100">{flag.name}</p><p className="mt-0.5 text-xs text-zinc-500"><code>{flag.key}</code> · {flag.type} · {flag.rules.length} ordered rules</p></Link>{flag.type === "boolean" ? <form action={setDefaultVariantAction.bind(null, slug, flag.key, flag.defaultVariant === "on" ? "off" : "on")}><Button type="submit" size="sm" variant="secondary" className={flag.defaultVariant === "on" ? "border-teal-500/20 bg-teal-500/10 text-teal-300" : ""}>{flag.defaultVariant === "on" ? "On" : "Off"}</Button></form> : <code className="max-w-40 truncate text-xs text-zinc-400">{JSON.stringify(current?.value)}</code>}</li>; })}</ul> : <div className="mt-8 border border-dashed border-white/10 py-12 text-center text-sm text-zinc-600">No flags yet.</div>}
    <CredentialsPanel orgSlug={slug} clientTokens={clientTokens.map(serializeClientToken)} /><section className="mt-10 border-t border-white/10 pt-8"><h2 className="text-lg font-semibold text-zinc-100">OpenFeature / OFREP</h2><p className="mt-1 text-sm text-zinc-500">Server and client providers use the same flags; their evaluation context and caching modes differ.</p><code className="mt-3 block border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">{brand.apiUrl}/ofrep/v1</code></section>
  </div>;
}
