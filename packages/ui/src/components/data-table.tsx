"use client";

import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, PlusCircle, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Badge } from "./badge";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator } from "./command";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./dropdown-menu";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export type { ColumnDef } from "@tanstack/react-table";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Column id to expose a text search box for. Omit to hide the global filter. */
  filterColumn?: string;
  filterPlaceholder?: string;
  /** Rows per page. Omit to disable pagination (render all rows). */
  pageSize?: number;
  /** Show a per-column show/hide menu in the toolbar. */
  enableColumnVisibility?: boolean;
  emptyText?: string;
  className?: string;
  /**
   * Extra toolbar content. As a function it receives the live table instance, so
   * you can drop in `<DataTableFacetedFilter column={table.getColumn("status")} .../>`
   * and other column-level controls.
   */
  toolbar?: ReactNode | ((table: TanTable<TData>) => ReactNode);
}

/** A sortable, filterable, paginated table built on TanStack Table + Flagon's Table. */
export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder = "Filter…",
  pageSize,
  enableColumnVisibility = false,
  emptyText = "No results.",
  className,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(pageSize
      ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } }
      : {}),
  });

  const filterCol = filterColumn ? table.getColumn(filterColumn) : undefined;
  const toolbarNode = typeof toolbar === "function" ? toolbar(table) : toolbar;
  const hasToolbar = filterCol || toolbarNode || enableColumnVisibility;

  return (
    <div className={cn("space-y-3", className)}>
      {hasToolbar && (
        <div className="flex items-center gap-2">
          {filterCol && (
            <Input
              size="sm"
              value={(filterCol.getFilterValue() as string) ?? ""}
              onChange={(e) => filterCol.setFilterValue(e.target.value)}
              placeholder={filterPlaceholder}
              className="max-w-xs"
            />
          )}
          {toolbarNode}
          {enableColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  <SlidersHorizontal className="size-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter((c) => c.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      className="capitalize"
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-hairline">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pageSize && table.getPageCount() > 1 && <DataTablePagination table={table} />}
    </div>
  );
}

function DataTablePagination<TData>({ table }: { table: TanTable<TData> }) {
  const selected = table.getFilteredSelectedRowModel().rows.length;
  const total = table.getFilteredRowModel().rows.length;
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {selected > 0
          ? `${selected} of ${total} row(s) selected`
          : `Page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}

export interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[];
}

/**
 * A column-level multi-select filter (Popover + Command), like the status/priority
 * facets on a real data table. Feed it a `table.getColumn("status")` and the set
 * of options; it drives that column's `arrIncludesSome`-style filter value.
 */
export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues();
  const selected = new Set(column?.getFilterValue() as string[] | undefined);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed" aria-label={`Filter by ${title}`}>
          <PlusCircle className="size-4" />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {selected.size}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) selected.delete(option.value);
                      else selected.add(option.value);
                      const values = Array.from(selected);
                      column?.setFilterValue(values.length ? values : undefined);
                    }}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-input",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50",
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                    {option.icon && <option.icon className="size-4 text-muted-foreground" />}
                    <span>{option.label}</span>
                    {facets?.get(option.value) != null && (
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
