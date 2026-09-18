/**
 * /p/<slug> — the share link. Sends the visitor to the editor with the
 * project loaded, or back with a reason it could not be opened.
 *
 * `redirect()` throws to do its work, so it is never called inside a try.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { redirect } from "next/navigation";
import { getServices } from "@/lib/adapters";
import { encodeProjectId } from "@/lib/encode-id";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicProjectPage({ params }: PageProps) {
  const { slug } = await params;

  let destination = "/?error=not-found";
  try {
    const project = await getServices().projects.getBySlug(slug);
    if (!project) destination = "/?error=not-found";
    else if (!project.published) destination = "/?error=not-public";
    // The editor expects the encoded id: a raw slug with dashes decodes to
    // nonsense.
    else destination = `/?file=${encodeProjectId(project.id)}`;
  } catch (error) {
    console.error("Could not load the shared project:", error);
    destination = "/?error=load-failed";
  }

  redirect(destination);
}
