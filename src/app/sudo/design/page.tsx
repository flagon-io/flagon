import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/theme-toggle';
import { SelectDemo, FieldDemo, ModalDemo, SecretRevealDemo } from './demos';

function Row({ title, code, children }: { title: string; code: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-6 last:border-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <code className="font-mono text-xs text-muted">{code}</code>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Section({
  title,
  importPath,
  children,
}: {
  title: string;
  importPath: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        <code className="font-mono text-[11px] text-muted">{importPath}</code>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Sudo</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Design system</h1>
      <p className="mt-1 text-sm text-muted">
        Every reusable primitive Flagon is built from. The product renders through these, so a change
        here propagates everywhere. Keep this page current as components are added. It&rsquo;s the
        canonical, AI-friendly catalog (mirrored in{' '}
        <code className="font-mono text-xs">DESIGN_SYSTEM.md</code>) so components get reused rather
        than reinvented.
      </p>

      <Section title="Button" importPath="@/components/ui/button">
        <Row title="Variants" code="variant=primary|secondary|ghost|danger">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row title="Sizes" code="size=sm|md|lg|icon">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="icon">
            +
          </Button>
        </Row>
        <Row title="Disabled" code="disabled">
          <Button disabled>Primary</Button>
          <Button variant="secondary" disabled>
            Secondary
          </Button>
        </Row>
        <Row title="Link as button" code="buttonVariants({…}) on <Link>">
          <a href="#" className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-black">
            Anchor styled as button
          </a>
        </Row>
      </Section>

      <Section title="Badge" importPath="@/components/ui/badge">
        <Row title="Variants" code="variant=neutral|brand|success|warning|danger">
          <Badge>Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
        </Row>
      </Section>

      <Section title="Form" importPath="@/components/ui/input · @/components/form">
        <Row title="Input" code="<Input />">
          <div className="w-full max-w-xs">
            <Input placeholder="you@company.com" />
          </div>
        </Row>
        <Row title="Input (filled)" code="defaultValue">
          <div className="w-full max-w-xs">
            <Input defaultValue="acme-production" />
          </div>
        </Row>
        <Row title="Input (password)" code="type=password">
          <div className="w-full max-w-xs">
            <Input type="password" defaultValue="supersecret" />
          </div>
        </Row>
        <Row title="Input (disabled)" code="disabled">
          <div className="w-full max-w-xs">
            <Input disabled defaultValue="Read only" />
          </div>
        </Row>
        <Row title="Textarea" code="<Textarea rows … />">
          <div className="w-full max-w-xs">
            <Textarea rows={3} placeholder="Multiline input…" />
          </div>
        </Row>
        <Row title="Field (labeled + hint)" code="<Field label hint … />">
          <FieldDemo />
        </Row>
        <Row title="Select" code="<Select value onValueChange options />">
          <SelectDemo />
        </Row>
      </Section>

      <Section title="Secret reveal" importPath="@/components/ui/secret-reveal">
        <Row title="SecretReveal" code="<SecretReveal masked onReveal /> — reveal + copy, surfaces errors">
          <SecretRevealDemo />
        </Row>
      </Section>

      <Section title="Overlays & menus" importPath="popover pattern">
        <Row title="Theme toggle" code="<ThemeToggle /> (menu pattern)">
          <ThemeToggle />
        </Row>
        <Row title="Modal" code="<Modal open onClose title footer … />">
          <ModalDemo />
        </Row>
        <p className="pt-1 text-xs leading-relaxed text-muted">
          The popover/menu pattern (button with <code className="font-mono">aria-haspopup</code> +
          absolutely-positioned panel, click-outside &amp; Escape to close) is the shared basis for{' '}
          <code className="font-mono">Select</code>, <code className="font-mono">ThemeToggle</code>,{' '}
          <code className="font-mono">UserMenu</code> (account, top-right), and{' '}
          <code className="font-mono">OrgSwitcher</code> (sidebar header). Reuse one of these as the
          starting point for any new dropdown rather than hand-rolling another.
        </p>
      </Section>

      <Section title="Tokens" importPath="globals.css @theme">
        <Row title="Brand" code="--color-brand-500 (#ff6a14)">
          <div className="flex gap-1.5">
            <span className="size-7 rounded bg-brand-400" title="brand-400" />
            <span className="size-7 rounded bg-brand-500" title="brand-500" />
            <span className="size-7 rounded bg-brand-600" title="brand-600" />
          </div>
        </Row>
        <Row title="Surfaces" code="background · card · card-muted · border">
          <span className="grid size-7 place-items-center rounded border border-border bg-background text-[9px] text-muted">bg</span>
          <span className="grid size-7 place-items-center rounded border border-border bg-card text-[9px] text-muted">card</span>
          <span className="grid size-7 place-items-center rounded border border-border bg-card-muted text-[9px] text-muted">muted</span>
        </Row>
        <Row title="Text" code="foreground · muted">
          <span className="text-sm text-foreground">Foreground</span>
          <span className="text-sm text-muted">Muted</span>
        </Row>
      </Section>
    </div>
  );
}
