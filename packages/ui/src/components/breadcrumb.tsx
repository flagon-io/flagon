import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** The trail of pages leading to the current one. Compose List > Item > Link/Page. */
export function Breadcrumb(props: ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}
export function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", className)} {...props} />
  );
}
export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("inline-flex items-center gap-1.5", className)} {...props} />;
}
export function BreadcrumbLink({ className, ...props }: ComponentProps<"a">) {
  return <a className={cn("transition-colors hover:text-foreground", className)} {...props} />;
}
export function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-medium text-foreground", className)}
      {...props}
    />
  );
}
export function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<"li">) {
  return (
    <li role="presentation" aria-hidden className={cn("[&>svg]:size-3.5", className)} {...props}>
      {children ?? <ChevronRight />}
    </li>
  );
}
