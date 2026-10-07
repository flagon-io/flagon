import type { ComponentType } from "react";
import type { FigureProps } from "../kit";
import { HeapVsClustered } from "./heap-vs-clustered";
import { AppendVsRandom } from "./append-vs-random";
import { BtreeLevels } from "./btree-levels";
import { OffsetVsKeyset } from "./offset-vs-keyset";
import { PlanDecisionPath } from "./plan-decision-path";

/** Figures drawn for this group of chapters, by name. */
export const FIGURES_B: Record<string, ComponentType<FigureProps>> = {
  "heap-vs-clustered": HeapVsClustered,
  "append-vs-random": AppendVsRandom,
  "btree-levels": BtreeLevels,
  "offset-vs-keyset": OffsetVsKeyset,
  "plan-decision-path": PlanDecisionPath,
};
