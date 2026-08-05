"use client";

import Link from "next/link";
import { Boxes, Plus, Siren } from "lucide-react";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@flagon/design";

/**
 * The global quick-create menu (top-right of the workspace header, just left of
 * the account avatar). A GitHub-style "+" that opens a grouped list of create
 * actions available on every org page. Each item routes to the relevant page
 * with the create flow auto-opened via a query flag (?create=1 / ?declare=1),
 * which that page reads to open its modal on load.
 */
export function QuickCreate({ slug }: { slug: string }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Create new"
          className="w-8 px-0"
        >
          <Plus className="size-4" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Create</MenuLabel>
        <MenuItem asChild>
          <Link href={`/${slug}?create=1`}>
            <Boxes className="size-4 text-zinc-500" /> New project
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href={`/${slug}/incidents?declare=1`}>
            <Siren className="size-4 text-zinc-500" /> New incident
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
