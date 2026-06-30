'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
} as const;

/**
 * Accessible modal dialog (design-system primitive). Rendered in a portal over a
 * blurred backdrop; locks body scroll, focuses itself, traps Tab, and restores
 * focus on close. Dismissal is configurable — `closeOnEsc` / `closeOnBackdrop`
 * (both default true). Build create/confirm flows on this rather than ad-hoc panels.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnEsc = true,
  closeOnBackdrop = true,
  showClose = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
  showClose?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Hold the latest callbacks in refs so the focus/scroll effect can depend on
  // `[open]` alone. Keeping `onClose`/`closeOnEsc` in the effect deps would re-run
  // it on every parent render (inline `onClose={() => …}` is a new fn each time),
  // and each re-run re-grabs focus — which yanked the caret to the close button on
  // every keystroke. Refs decouple "latest handler" from "re-run the effect".
  const onCloseRef = useRef(onClose);
  const closeOnEscRef = useRef(closeOnEsc);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscRef.current = closeOnEsc;
  });

  useEffect(() => setMounted(true), []);

  // Body scroll lock + focus management — runs once per open/close, not per render.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Focus the first real field, not the header close button, so the user can type immediately.
    const initial = focusables.find((el) => el.getAttribute('aria-label') !== 'Close') ?? focusables[0];
    (initial ?? panelRef.current)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && closeOnEscRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ animation: 'flagon-fade 0.15s ease-out' }}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ animation: 'flagon-pop 0.15s ease-out' }}
        className={cn(
          'relative my-8 w-full rounded-2xl border border-border bg-card shadow-xl outline-none',
          SIZES[size],
        )}
      >
        {(title || showClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-base font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-card-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}

        <div className="px-5 py-4">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
