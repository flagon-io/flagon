import Link from "next/link";
import { SiGithub, SiDiscord } from "@icons-pack/react-simple-icons";
import { Logo } from "@/components/logo";
import { Plus } from "@/components/plus";
import { site } from "@/lib/site";
import { PRODUCTS, productHref } from "@/lib/products";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-hairline bg-background/70 backdrop-blur-md">
      {/* divider-end marks; only shown once the column has outer margin (xl),
          so they never straddle the viewport edge on smaller screens */}
      <Plus className="absolute left-0 top-0 hidden h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-mark xl:block" />
      <Plus className="absolute right-0 top-0 hidden h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 text-mark xl:block" />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
        {/* brand */}
        <div className="col-span-2 sm:col-span-1">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Logo className="h-6 w-6 text-foreground" />
            <span className="text-[15px] font-semibold tracking-tight">
              Flagon
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            {site.tagline}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <a
              href={site.links.github}
              target="_blank"
              rel="noreferrer"
              aria-label="Flagon on GitHub"
              className="text-subtle transition hover:text-foreground"
            >
              <SiGithub className="h-4.5 w-4.5" />
            </a>
            <a
              href={site.links.discord}
              target="_blank"
              rel="noreferrer"
              aria-label="Flagon on Discord"
              className="text-subtle transition hover:text-foreground"
            >
              <SiDiscord className="h-4.5 w-4.5" />
            </a>
          </div>
        </div>

        <FooterCol title="Products">
          {PRODUCTS.map((p) => (
            <FooterLink key={p.id} href={productHref(p)}>
              {p.name}
            </FooterLink>
          ))}
          <FooterLink href="/products">All products</FooterLink>
        </FooterCol>

        <FooterCol title="Company">
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/people">People</FooterLink>
          <FooterLink href="/handbook">Handbook</FooterLink>
          <FooterLink href="/media">Media</FooterLink>
          <FooterLink href="/careers">Careers</FooterLink>
          <FooterLink href="/handbook/brand-overview">Brand</FooterLink>
        </FooterCol>

        <FooterCol title="Community">
          <FooterLink href="/blog">Blog</FooterLink>
          <FooterLink href="/books">Books</FooterLink>
          <FooterLink href={site.links.discord} external>
            Discord
          </FooterLink>
          <FooterLink href={site.links.github} external>
            GitHub
          </FooterLink>
          <FooterLink href={site.links.g1t} external>
            Flagon on g1t
          </FooterLink>
          <FooterLink href={`mailto:${site.links.email}`} external>
            Email
          </FooterLink>
        </FooterCol>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 px-6 py-5 font-mono text-[11px] uppercase tracking-widest text-subtle sm:flex-row sm:justify-between">
          <p>
            © {year} {site.legalName}
          </p>
          <p>Built in public · {site.domain}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
        {title}
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls = "text-sm text-muted-foreground transition hover:text-foreground";
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {children}
        </a>
      ) : (
        <Link href={href} className={cls}>
          {children}
        </Link>
      )}
    </li>
  );
}
