"use client";

import { useEffect, useState } from "react";
import { OtpInput } from "@/components/auth/otp-input";

interface UserEmail {
  id: string;
  email: string;
  verified: boolean;
  isPrimary: boolean;
  createdAt: string;
}

export default function EmailSettingsPage() {
  const [emails, setEmails] = useState<UserEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const res = await fetch("/api/emails");
    if (res.ok) {
      const { emails } = await res.json();
      setEmails(emails);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setPendingEmail(newEmail);
    setNewEmail("");
  }

  async function handleVerify(otp: string) {
    if (!pendingEmail) return;
    setError(null);

    const res = await fetch("/api/emails/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingEmail, otp }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "That code didn't work.");
      return;
    }

    setPendingEmail(null);
    refresh();
  }

  async function handleSetPrimary(id: string) {
    setError(null);
    const res = await fetch(`/api/emails/${id}/primary`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't set that email as primary.");
      return;
    }
    refresh();
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/emails/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't remove that email.");
      return;
    }
    refresh();
  }

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-1 flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">Email addresses</h1>

      {loading ? (
        <p className="text-sm text-black/60">Loading...</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {emails.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium">{e.email}</span>
                <span className="ml-2 text-xs text-black/50">
                  {e.isPrimary
                    ? "Primary"
                    : e.verified
                      ? "Verified"
                      : "Unverified"}
                </span>
              </div>
              <div className="flex gap-3">
                {!e.isPrimary && e.verified && (
                  <button
                    onClick={() => handleSetPrimary(e.id)}
                    className="text-xs font-medium underline"
                  >
                    Make primary
                  </button>
                )}
                {!e.isPrimary && (
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="text-xs font-medium text-red-600 underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingEmail ? (
        <div className="rounded-lg border border-black/10 bg-white p-4 text-center">
          <p className="text-sm text-black/60">
            Enter the code we sent to{" "}
            <span className="font-semibold">{pendingEmail}</span>
          </p>
          <div className="mt-4">
            <OtpInput onComplete={handleVerify} />
          </div>
        </div>
      ) : (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="Add another email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-black/30 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Add
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
