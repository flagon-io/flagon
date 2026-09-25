import { PageSkeleton } from "@/components/shared/route-loading";

// Renders inside the settings chrome's content column, which owns the padding.
export default function SettingsLoading() {
  return <PageSkeleton rows={3} />;
}
