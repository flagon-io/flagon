"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type SessionRow = {
  token: string;
  createdAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
};

/** Lists active sessions with a per-row revoke, plus "sign out everywhere else". */
export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function revoke(token: string) {
    setBusy(true);
    await authClient.revokeSession({ token });
    router.refresh();
    setBusy(false);
  }

  async function revokeOthers() {
    setBusy(true);
    await authClient.revokeOtherSessions();
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
        {sessions.map((s) => (
          <li
            key={s.token}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200">
                {describeAgent(s.userAgent)}
                {s.current ? (
                  <span className="ml-2 text-xs font-medium text-teal-400">
                    This device
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-zinc-500">
                {s.ipAddress ? `${s.ipAddress} · ` : ""}
                started {new Date(s.createdAt).toLocaleString()}
              </p>
            </div>
            {!s.current ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => revoke(s.token)}
                className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                Revoke
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {sessions.length > 1 ? (
        <button
          type="button"
          disabled={busy}
          onClick={revokeOthers}
          className="self-start text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          Sign out all other sessions
        </button>
      ) : null}
    </div>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
      ? "Chrome"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : /curl/.test(ua)
            ? "API client"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Linux/.test(ua)
        ? "Linux"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : "";
  return os ? `${browser} on ${os}` : browser;
}
