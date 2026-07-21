import { permanentRedirect } from "next/navigation";
import { appPath } from "@/lib/urls";

/**
 * The project list moved to the organization root.
 *
 * Kept as a redirect rather than deleted: this path was the list for the whole
 * life of the console, so it is in bookmarks, in links people have shared, and
 * in the browser history of everyone who has used it. Its children
 * (`/projects/new`, `/projects/<slug>`) are unaffected and still live here.
 */
export default async function ProjectsIndex({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  permanentRedirect(appPath(`/${org}`));
}
