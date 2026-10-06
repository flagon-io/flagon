import Link from "next/link";
import { Logo } from "@/components/logo";
import { Plus } from "@/components/plus";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { MainNav } from "@/components/main-nav";
import { Search } from "@/components/search";
import { buttonClasses } from "@/components/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-background/70 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Logo className="h-6 w-6 text-foreground" />
            <span className="text-[15px] font-semibold tracking-tight">Flagon</span>
          </Link>

          <MainNav className="hidden md:flex" />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Search />
          <ThemeToggle />
          <div className="hidden md:block">
            <Link
              href="/careers"
              className={buttonClasses({ variant: "default", size: "sm" })}
            >
              Careers
            </Link>
          </div>
          <MobileNav />
        </div>

        {/* crosshair marks where the header divider meets the column rails;
            only shown once the column has outer margin (xl), so they never
            straddle the viewport edge and force horizontal scroll on mobile */}
        <Plus className="absolute bottom-0 left-0 hidden h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 text-mark xl:block" />
        <Plus className="absolute bottom-0 right-0 hidden h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 text-mark xl:block" />
      </div>
    </header>
  );
}
