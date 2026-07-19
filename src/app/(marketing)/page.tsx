import { brand } from "@/lib/brand";

export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-20 text-zinc-100">
      <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        {brand.eyebrow}
      </p>

      <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
        {brand.taglineLead}
        <br />
        <span className="text-zinc-500">{brand.taglineFollow}</span>
      </h1>

      <p className="mt-8 max-w-xl text-lg leading-8 text-zinc-400">
        {brand.description}
      </p>

      {/* Product teaser pills */}
      <div className="mt-10 flex flex-wrap items-center gap-2 text-sm">
        {brand.products.map((product) => (
          <span
            key={product}
            className="rounded-full border border-white/10 bg-white/3 px-3 py-1 text-zinc-300"
          >
            {product}
          </span>
        ))}
        <span className="px-1 text-zinc-500">and more on the way</span>
      </div>

      {/* Launch status */}
      <div className="mt-12 flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
          </span>
          <span className="text-sm font-medium text-teal-300">Coming soon</span>
        </div>
        <p className="text-sm text-zinc-500">Sign-ups open soon.</p>
      </div>
    </main>
  );
}
