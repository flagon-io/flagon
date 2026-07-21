import { SkeletonCards, SkeletonPageHeader } from "@/components/skeleton";

/**
 * Route-level skeleton for the organization root (the project list).
 *
 * Next renders this while the server component awaits its data, which is what
 * makes skeletons the default across the console rather than something each
 * page has to remember to build.
 */
export default function Loading() {
  return (
    <div>
      <SkeletonPageHeader />
      <div className="mt-8">
        <SkeletonCards cards={6} />
      </div>
    </div>
  );
}
