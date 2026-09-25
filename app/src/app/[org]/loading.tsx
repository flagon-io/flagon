import { PageBody } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shared/route-loading";

export default function OrgLoading() {
  return (
    <PageBody>
      <PageSkeleton />
    </PageBody>
  );
}
