// Lazy, fine-grained Shiki highlighter (JS engine, only the langs/themes we
// need) so the docs bundle stays lean. Dual-theme output drives colors from CSS
// variables, switched by the `.dark` class (see globals.css .shiki rules).
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
      langs: [
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/css.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export async function highlight(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
