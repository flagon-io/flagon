import { codeToHtml } from "shiki";

/**
 * A highlighted code block for the docs.
 *
 * An async SERVER component, and that is what makes the cost acceptable: every
 * docs page is statically prerendered, so Shiki runs during `next build` and
 * ships plain spans with inline colours. No highlighter, no grammars, and no
 * theme reach the browser, and there is no flash of unstyled code because the
 * markup arrives already coloured.
 *
 * Highlighting is deliberately restrained. In a terminal snippet the useful
 * signal is which part is the command and which part is a flag or a string;
 * painting six colours across a two-line curl teaches nothing and just makes
 * the page noisier than the prose around it.
 */
export async function CodeBlock({
  code,
  lang = "bash",
  className = "",
}: {
  code: string;
  /** Any Shiki language id. `bash`, `ts`, `json` and `http` cover the docs. */
  lang?: string;
  className?: string;
}) {
  const html = await codeToHtml(code.trim(), {
    lang,
    theme: "github-dark-default",
    // Shiki emits its own background on <pre>. The docs already have a
    // surface, so drop it and keep one border and one background across
    // every block rather than a theme-coloured island inside our own.
    transformers: [
      {
        pre(node) {
          node.properties.style = "";
          node.properties.class = "";
        },
      },
    ],
  });

  return (
    <div
      className={`mt-3 overflow-x-auto border border-white/10 bg-black/30 p-4 text-[13px] leading-6 ${className}`}
      // Shiki's output is generated from `code`, which is authored in this
      // repository, never user input.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
