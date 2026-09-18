import type { ReactNode } from "react";
import { Card, cn } from "@flagon-io/ui";

/**
 * Settings card: a titled body with an optional footer bar that
 * holds a muted hint on the left and an action on the right. Used across the
 * settings surfaces so they feel cohesive.
 */
export function SettingsCard({
  title,
  description,
  children,
  footer,
  footerHint,
  bodyClassName,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  footerHint?: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className={cn("space-y-5 p-6", bodyClassName)}>
        {(title || description) && (
          <div className="space-y-1.5">
            {title && (
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            )}
            {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
        )}
        {children}
      </div>
      {(footer || footerHint) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-muted/20 px-6 py-3.5">
          <p className="text-sm text-muted-foreground">{footerHint}</p>
          {footer && <div className="flex items-center gap-2">{footer}</div>}
        </div>
      )}
    </Card>
  );
}
