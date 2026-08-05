"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast, useConfirm } from "@flagon/design";
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
  const { confirm, confirmDialog } = useConfirm();
  // Keyed per row so revoking one session doesn't disable every other row's
  // button; `busyAll` covers the sign-out-everywhere action.
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  async function revoke(token: string) {
    if (
      !(await confirm({
        title: "Revoke this session?",
        message:
          "The device on this session will be signed out and must sign in again.",
        confirmLabel: "Revoke session",
        tone: "danger",
      }))
    )
      return;
    setBusyToken(token);
    const { error } = await authClient.revokeSession({ token });
    setBusyToken(null);
    if (error) {
      toast.error("Couldn't revoke session", error.message);
      return;
    }
    router.refresh();
  }

  async function revokeOthers() {
    if (
      !(await confirm({
        title: "Sign out everywhere else?",
        message:
          "Every other session but this one will be signed out. Those devices must sign in again.",
        confirmLabel: "Sign out other sessions",
        tone: "danger",
      }))
    )
      return;
    setBusyAll(true);
    const { error } = await authClient.revokeOtherSessions();
    setBusyAll(false);
    if (error) {
      toast.error("Couldn't sign out other sessions", error.message);
      return;
    }
    router.refresh();
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
                disabled={busyToken === s.token || busyAll}
                onClick={() => revoke(s.token)}
                className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                {busyToken === s.token ? "Revoking…" : "Revoke"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {sessions.length > 1 ? (
        <button
          type="button"
          disabled={busyAll}
          onClick={revokeOthers}
          className="self-start text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {busyAll ? "Signing out…" : "Sign out all other sessions"}
        </button>
      ) : null}
      {confirmDialog}
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
