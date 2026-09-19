import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { buttonClasses } from "./button";

/** Move through pages of results. Compose Content > Item > Link/Previous/Next/Ellipsis. */
export function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav aria-label="pagination" data-slot="pagination" className={cn("mx-auto flex w-full justify-center", className)} {...props} />
  );
}
export function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex items-center gap-1", className)} {...props} />;
}
export function PaginationItem(props: ComponentProps<"li">) {
  return <li {...props} />;
}
export function PaginationLink({ className, isActive, ...props }: ComponentProps<"a"> & { isActive?: boolean }) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(buttonClasses({ variant: isActive ? "outline" : "ghost", size: "icon" }), className)}
      {...props}
    />
  );
}
export function PaginationPrevious({ className, ...props }: ComponentProps<"a">) {
  return (
    <a className={cn(buttonClasses({ variant: "ghost", size: "sm" }), className)} aria-label="Previous page" {...props}>
      <ChevronLeft className="size-4" />
      Previous
    </a>
  );
}
export function PaginationNext({ className, ...props }: ComponentProps<"a">) {
  return (
    <a className={cn(buttonClasses({ variant: "ghost", size: "sm" }), className)} aria-label="Next page" {...props}>
      Next
      <ChevronRight className="size-4" />
    </a>
  );
}
export function PaginationEllipsis({ className, ...props }: ComponentProps<"span">) {
  return (
    <span aria-hidden className={cn("flex size-9 items-center justify-center", className)} {...props}>
      <MoreHorizontal className="size-4 text-muted-foreground" />
    </span>
  );
}
