"use client";

import { useState } from "react";
import { Check, Copy, Play } from "lucide-react";

/**
 * Interactive console for an API operation. Always calls same-origin `/api`
 * (the API routes resolve on every host and the *.flagon.io session cookie is
 * present), so it works identically in local dev and production with no CORS.
 */
type Param = { name: string; in: string; required?: boolean };

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable; nothing to do */
        }
      }}
      className="rounded-md border border-white/10 p-1.5 text-zinc-500 transition hover:border-white/20 hover:text-zinc-200"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-teal-400" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

export function TryIt({
  method,
  path,
  requiresAuth,
  params,
  bodyExample,
}: {
  method: string;
  path: string;
  requiresAuth: boolean;
  params: Param[];
  bodyExample: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(bodyExample ?? "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    status: number;
    statusText: string;
    body: string;
  } | null>(null);

  async function send() {
    setRunning(true);
    setResult(null);
    try {
      let target = path;
      const query = new URLSearchParams();
      for (const param of params) {
        const value = values[param.name] ?? "";
        if (param.in === "path") {
          target = target.replace(`{${param.name}}`, encodeURIComponent(value));
        } else if (param.in === "query" && value) {
          query.set(param.name, value);
        }
      }
      const url = `/api${target}${query.size ? `?${query}` : ""}`;
      const hasBody = method !== "get" && body.trim().length > 0;
      const res = await fetch(url, {
        method: method.toUpperCase(),
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? body : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON (e.g. 204 empty body) */
      }
      setResult({
        status: res.status,
        statusText: res.statusText,
        body: pretty || "(no content)",
      });
    } catch {
      setResult({ status: 0, statusText: "Network error", body: "" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-5 border-t border-white/5 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-sm font-medium text-teal-300 transition hover:bg-teal-500/15"
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        {open ? "Hide console" : "Try it"}
      </button>

      {open ? (
        <div className="mt-4 space-y-3">
          {requiresAuth ? (
            <p className="text-xs leading-5 text-zinc-500">
              Runs against this environment with your current session. Sign in
              at the app first if you get a 401.
            </p>
          ) : null}

          {params.map((param) => (
            <label key={param.name} className="block text-sm text-zinc-300">
              <span className="text-xs text-zinc-500">
                {param.name}
                {param.required ? " (required)" : ""} · {param.in}
              </span>
              <input
                value={values[param.name] ?? ""}
                onChange={(event) =>
                  setValues((v) => ({ ...v, [param.name]: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-white/10 bg-white/4 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-teal-500/60"
              />
            </label>
          ))}

          {method !== "get" ? (
            <label className="block text-sm text-zinc-300">
              <span className="text-xs text-zinc-500">Request body (JSON)</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                spellCheck={false}
                className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-teal-500/60"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={send}
            disabled={running}
            className="rounded-md bg-teal-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400 disabled:opacity-60"
          >
            {running ? "Sending..." : `Send ${method.toUpperCase()}`}
          </button>

          {result ? (
            <div>
              <div className="mb-1.5 text-sm">
                <code
                  className={`font-semibold ${
                    result.status >= 200 && result.status < 300
                      ? "text-teal-300"
                      : "text-red-300"
                  }`}
                >
                  {result.status || ""} {result.statusText}
                </code>
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs leading-5 text-zinc-300">
                <code>{result.body}</code>
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
