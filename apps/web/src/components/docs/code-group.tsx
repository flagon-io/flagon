"use client";

import { Code, CopyButton } from "./code-block";
import { LANGS, useLang, type LangId } from "./lang";

export type CodeExample = { code: string; caption?: string };

/**
 * A multi-language code sample bound to the global language preference. The tab
 * strip sets the global choice, so picking a language on any block syncs every
 * block on the page; a block only lists the languages it actually provides.
 */
export function CodeGroup({
  examples,
}: {
  examples: Partial<Record<LangId, CodeExample>>;
}) {
  const { lang, setLang } = useLang();
  const available = LANGS.filter((l) => examples[l.id]);
  if (available.length === 0) return null;

  // Follow the global language when present; otherwise show the first available
  // without changing the global choice (another block may have that language).
  const activeId = examples[lang] ? lang : available[0].id;
  const current = examples[activeId];
  if (!current) return null;

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pr-1.5">
        <div className="flex flex-1 flex-wrap">
          {available.map((l) => {
            const active = l.id === activeId;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={
                  "relative px-3.5 py-2.5 text-xs font-medium transition " +
                  (active ? "text-teal-300" : "text-zinc-500 hover:text-zinc-300")
                }
              >
                {l.label}
                {active ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal-400" />
                ) : null}
              </button>
            );
          })}
        </div>
        <CopyButton text={current.code} />
      </div>
      {current.caption ? (
        <div className="border-b border-white/5 px-4 py-1.5 text-[11px] text-zinc-600">
          {current.caption}
        </div>
      ) : null}
      <Code code={current.code} />
    </div>
  );
}
