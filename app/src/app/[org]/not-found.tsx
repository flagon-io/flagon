"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { Button } from "@flagon-io/ui";

/**
 * The in-organization 404. This renders inside the org shell (sidebar + topbar),
 * so it's only reached by someone who already has access to the org - a missing or
 * deleted resource within it. It's friendly and keeps them in context, unlike the
 * generic root 404 that guards against leaking whether an org exists at all.
 */
export default function OrgNotFound() {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/12 text-brand-bright">
        <Compass className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          We couldn&rsquo;t find that
        </h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          This page doesn&rsquo;t exist in this organization, or it may have been moved or deleted.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => router.back()}>Go back</Button>
        <Button asChild variant="outline">
          <Link href="/">Your dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
