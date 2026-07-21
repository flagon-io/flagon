import { SkeletonPageHeader, SkeletonRows } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHeader />
      <SkeletonRows rows={4} className="mt-8" />
    </div>
  );
}
