import { cn } from '@/lib/cn';

/** Design-system multiline text input. Mirrors <Input> styling. */
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
        className,
      )}
      {...props}
    />
  );
}
