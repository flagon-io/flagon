import type { ComponentType } from "react";
import type { FigureProps } from "../kit";
import { BufferLookup } from "./buffer-lookup";
import { CheckpointFpi } from "./checkpoint-fpi";
import { CheckpointRedo } from "./checkpoint-redo";
import { ClockSweep } from "./clock-sweep";
import { HotVsCold } from "./hot-vs-cold";
import { ServerMap } from "./server-map";
import { ThreeTiers } from "./three-tiers";
import { UpdateNewVersion } from "./update-new-version";
import { WalWritePath } from "./wal-write-path";

/** Figures drawn for this group of chapters, by name. */
export const FIGURES_A: Record<string, ComponentType<FigureProps>> = {
  "server-map": ServerMap,
  "three-tiers": ThreeTiers,
  "buffer-lookup": BufferLookup,
  "clock-sweep": ClockSweep,
  "update-new-version": UpdateNewVersion,
  "hot-vs-cold": HotVsCold,
  "wal-write-path": WalWritePath,
  "checkpoint-redo": CheckpointRedo,
  "checkpoint-fpi": CheckpointFpi,
};
