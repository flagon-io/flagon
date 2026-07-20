"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { describeUserAgent } from "@/lib/user-agent";
import {
  Notice,
  subtleButtonClass,
} from "@/components/form-ui";

type SessionRow = {
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export function SessionsList({
  sessions,
  currentToken,
}: {
  sessions: SessionRow[];
  currentToken: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // Current session first, then most recent.
  const ordered = [...sessions].sort((a, b) => {
    if (a.token === currentToken) return -1;
    if (b.token === currentToken) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  async function revoke(token: string) {
    setError(null);
    setPendingToken(token);
    const { error: revokeError } = await authClient.revokeSession({ token });
    setPendingToken(null);
    if (revokeError) {
      setError(revokeError.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  async function revokeOthers() {
    setError(null);
    setPendingToken("__others__");
    const { error: revokeError } = await authClient.revokeOtherSessions();
    setPendingToken(null);
    if (revokeError) {
      setError(revokeError.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 max-w-2xl space-y-6">
      <p className="text-sm leading-6 text-zinc-400">
        This is a list of devices that are signed in to your account. Revoke
        any sessions that you do not recognize.
      </p>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
        {ordered.map((s) => {
          const current = s.token === currentToken;
          return (
            <li key={s.token} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                  {describeUserAgent(s.userAgent)}
                  {current ? (
                    <span className="rounded-full border border-teal-500/40 px-2 py-0.5 text-[11px] font-medium text-teal-300">
                      Current session
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {s.ipAddress ? `${s.ipAddress} · ` : ""}
                  signed in {new Date(s.createdAt).toLocaleString()} · expires{" "}
                  {new Date(s.expiresAt).toLocaleDateString()}
                </div>
              </div>
              {current ? null : (
                <button
                  type="button"
                  onClick={() => revoke(s.token)}
                  disabled={pendingToken !== null}
                  className={subtleButtonClass}
                >
                  {pendingToken === s.token ? "Revoking..." : "Revoke"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {ordered.length > 1 ? (
        <button
          type="button"
          onClick={revokeOthers}
          disabled={pendingToken !== null}
          className={subtleButtonClass}
        >
          {pendingToken === "__others__"
            ? "Signing out..."
            : "Sign out all other sessions"}
        </button>
      ) : null}
    </div>
  );
}
