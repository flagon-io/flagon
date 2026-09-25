"use client";

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";
import type { ComponentProps } from "react";

/** Constrain content to a fixed width/height ratio. Pass `ratio` (e.g. 16 / 9). */
export function AspectRatio(props: ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />;
}
