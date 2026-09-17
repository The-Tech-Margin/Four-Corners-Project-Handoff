import { redirect } from "next/navigation";
import { getProjectBySlug } from "@/lib/db/projects";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function PublicProjectPage({ params }: PageProps) {
  const { slug } = await params;

  try {
    // Try to fetch the project by slug
    const project = await getProjectBySlug(slug);

    if (!project) {
      // Slug doesn't exist
      redirect("/?error=not-found");
    }

    if (!project.published) {
      // Project exists but is not published
      redirect("/?error=not-public");
    }

    // Redirect to main page with file parameter to load the shared project
    redirect(`/?file=${slug}`);
  } catch (error) {
    console.error("Error loading public project:", error);
    redirect("/?error=load-failed");
  }
}
