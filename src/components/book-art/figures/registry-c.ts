import type { ComponentType } from "react";
import type { FigureProps } from "../kit";
import { DetachVsDelete } from "./detach-vs-delete";
import { LockQueue } from "./lock-queue";
import { LostUpdate } from "./lost-update";
import { PitrTimeline } from "./pitr-timeline";
import { RouteByTenant } from "./route-by-tenant";
import { StreamingReplica } from "./streaming-replica";

/** Figures drawn for this group of chapters, by name. */
export const FIGURES_C: Record<string, ComponentType<FigureProps>> = {
  "lock-queue": LockQueue,
  "lost-update": LostUpdate,
  "pitr-timeline": PitrTimeline,
  "streaming-replica": StreamingReplica,
  "detach-vs-delete": DetachVsDelete,
  "route-by-tenant": RouteByTenant,
};
