import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border text-muted',
        brand: 'border-brand-500/30 bg-brand-500/10 text-brand-500',
        success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
        warning: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
        danger: 'border-red-500/20 bg-red-500/10 text-red-500',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
