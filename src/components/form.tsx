import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Labeled text field built on the design-system Input. */
export function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <Input
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({
  children,
  loading,
}: {
  children: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Button type="submit" disabled={loading} className="w-full">
      {children}
    </Button>
  );
}
