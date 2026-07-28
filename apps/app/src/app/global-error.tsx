"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary for errors thrown by the root layout itself. It replaces
 * the whole document, so it must render its own <html>/<body> and cannot rely
 * on the app's global stylesheet, theme, or fonts loading. Everything here is
 * inline-styled for that reason. Still reports to Sentry (inert without a DSN).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "5rem 1.5rem",
          textAlign: "center",
          background: "#09090b",
          color: "#e4e4e7",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              maxWidth: "24rem",
              margin: "0.5rem auto 0",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#a1a1aa",
            }}
          >
            An unexpected error interrupted the app. You can try again, and
            we&apos;ve been notified.
          </p>
        </div>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{
            borderRadius: "0.375rem",
            border: "none",
            background: "#14b8a6",
            color: "#09090b",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
