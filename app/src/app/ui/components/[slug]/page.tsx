import { notFound } from "next/navigation";
import { components, getComponent } from "@/components/docs/registry";
import { ComponentDocView } from "@/components/docs/component-doc-view";

export function generateStaticParams() {
  return components.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = getComponent(slug);
  if (!meta) return { title: "Flagon UI" };
  return { title: `${meta.name} - Flagon UI`, description: meta.description };
}

export default async function ComponentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = getComponent(slug);
  if (!meta) notFound();
  return <ComponentDocView meta={meta} />;
}
