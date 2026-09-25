import { PageBody } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shared/route-loading";

export default function ProjectsLoading() {
  return (
    <PageBody>
      <PageSkeleton rows={5} />
    </PageBody>
  );
}
