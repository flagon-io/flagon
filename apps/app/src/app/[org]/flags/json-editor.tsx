"use client";

import { useRef } from "react";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A minimal JSON tokenizer that wraps tokens in colored spans. The input is HTML-
 * escaped first, so the returned string is safe to inject. Keys (strings followed
 * by a colon) are tinted differently from string values.
 */
function highlightJson(code: string): string {
  const esc = escapeHtml(code);
  return esc.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],])/g,
    (m, str, colon, kw, num, punct) => {
      if (str !== undefined) {
        return colon
          ? `<span class="text-sky-300">${str}</span><span class="text-zinc-500">${colon}</span>`
          : `<span class="text-emerald-300">${str}</span>`;
      }
      if (kw !== undefined) return `<span class="text-violet-300">${kw}</span>`;
      if (num !== undefined) return `<span class="text-amber-300">${num}</span>`;
      if (punct !== undefined) return `<span class="text-zinc-500">${punct}</span>`;
      return m;
    },
  );
}

/**
 * A lightweight, dependency-free JSON editor: a transparent-text `<textarea>`
 * layered over a syntax-highlighted `<pre>`, with a line-number gutter. Scroll is
 * kept in sync across the three layers. No editor library, just this file.
 */
export function JsonEditor({
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = value.split("\n").length;

  function syncScroll() {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }

  return (
    <div
      className={`flex overflow-hidden rounded-md border bg-black/40 font-mono text-xs ${
        invalid ? "border-red-500/40" : "border-white/10"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className="max-h-56 shrink-0 select-none overflow-hidden border-r border-white/8 bg-white/2 px-2 py-2 text-right text-zinc-600"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="leading-5">
            {i + 1}
          </div>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 max-h-56 overflow-hidden whitespace-pre px-3 py-2 leading-5 text-zinc-300"
          dangerouslySetInnerHTML={{ __html: `${highlightJson(value)}\n` }}
        />
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onBlur={onBlur}
          disabled={disabled}
          spellCheck={false}
          aria-label={ariaLabel}
          className="relative block max-h-56 min-h-24 w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-2 leading-5 text-transparent caret-white outline-none"
        />
      </div>
    </div>
  );
}
