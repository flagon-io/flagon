import { Loader2 } from "lucide-react";

/**
 * Global loading fallback. Without a `loading.tsx`, the App Router holds the
 * whole response (no streaming) and the browser shows a blank screen while the
 * server renders, worst on a cold start or the post-login redirect chain. This
 * gives an instant, streamed indicator instead.
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="size-6 animate-spin text-zinc-600" aria-label="Loading" />
    </div>
  );
}
