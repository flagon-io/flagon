import type { ReactNode } from "react";
import { Card } from "@flagon-io/ui";
import { PageHeader, PageBody } from "./page-header";

/** Temporary content for shell routes we haven't built out yet. */
export function PagePlaceholder({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <PageBody>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{children ?? "This area is coming soon."}</p>
        </Card>
      </PageBody>
    </>
  );
}
