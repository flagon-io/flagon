"use client";

// The shared body of every route error boundary (error.tsx). Server Component
// errors reach the client with their message stripped in production, so this
// shows friendly copy plus the digest (to match server logs), never a stack.
import { useEffect } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle, Button, cn } from "@flagon-io/ui";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Next's boundary retry: re-fetches and re-renders the segment. */
  retry: () => void;
};

export function RouteError({
  error,
  retry,
  title = "Something went wrong",
  description = "We couldn't load this page. This is usually temporary, so try again in a moment.",
  className,
}: RouteErrorProps & { title?: string; description?: string; className?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={cn("max-w-2xl", className)}>
      <Alert variant="destructive" icon={<AlertCircle />}>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="pt-1">
          <Button variant="outline" size="sm" onClick={() => retry()}>
            <RotateCw className="size-4" />
            Try again
          </Button>
        </div>
      </Alert>
    </div>
  );
}
