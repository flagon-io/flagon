import type { ComponentType, ReactNode } from "react";
import type { FigureProps } from "./kit";
import { PageAnatomy } from "./figures/page-anatomy";
import { FIGURES_A } from "./figures/registry-a";
import { FIGURES_B } from "./figures/registry-b";
import { FIGURES_C } from "./figures/registry-c";

export { PART_ART } from "./parts";

/**
 * Every figure the book can place, by name. Chapters use them from MDX as
 * <Fig name="page-anatomy">The caption, in Markdown.</Fig>.
 */
export const FIGURES: Record<string, ComponentType<FigureProps>> = {
  "page-anatomy": PageAnatomy,
  ...FIGURES_A,
  ...FIGURES_B,
  ...FIGURES_C,
};

export function Fig({ name, children }: { name: string; children?: ReactNode }) {
  const Drawing = FIGURES[name];
  if (!Drawing) throw new Error(`<Fig name="${name}">: no such figure in components/book-art`);
  return <Drawing id={`fig-${name}`} caption={children} />;
}
